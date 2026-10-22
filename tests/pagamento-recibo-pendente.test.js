const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const source = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));

// O mesmo backend fictício atende o VM e o navegador. Não abre conexão externa.
function instalarFixture(root) {
  const copy = x => JSON.parse(JSON.stringify(x));
  const id = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12, '0');
  root._companyId = id(1);
  root.usuarioAtual = { id: id(2), perfil: 'admin' };
  root.obras = [];
  root.hojeISO = () => '2026-10-19';
  root.fmtData = x => String(x || '').split('-').reverse().join('/');
  root.fmt = x => Number(x).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  root.esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const qa = root.__qa = { id, mode: 'success', writes: [], reads: [], toasts: [], ops: [], movements: [],
    contas: [{ id: id(3), company_id: id(1), fornecedor: 'Fornecedor Fictício', nota_ref: 'TESTE-123/1', descricao: 'Parcela de teste', valor: 100, status: 'pendente', data_vencimento: '2026-10-16' }] };
  qa.state = () => ({ company_id: root._companyId, pagamento_sem_abertura: true, contas: [], movimentos: copy(qa.movements.filter(m => m.company_id === root._companyId)), pagamentos: [], total_centavos: 0 });
  root.showToast = msg => qa.toasts.push(msg);
  root.sbPost = root.sbPatch = root.sbDelete = root.fetch = () => { throw Error('Rede/escrita legada proibida neste ensaio'); };
  root.sbGet = async (table, query, options) => {
    qa.reads.push({ table, query, company: root._companyId, throwOnError: options?.throwOnError });
    if (qa.mode === 'readFailure' && table === 'caixa_operacoes') throw Error('Falha de leitura fictícia');
    const rows = { caixa_operacoes: qa.ops, caixa_movimentos: qa.movements, contas_pagar: qa.contas }[table];
    if (!rows) throw Error('Leitura inesperada: ' + table);
    const target = /[?&]id=eq\.([^&]+)/.exec(query || '')?.[1];
    return copy(rows.filter(r => r.company_id === root._companyId && (!target || r.id === decodeURIComponent(target))));
  };
  root.sbRpcEstoque = async (fn, args = {}) => {
    if (fn === 'caixa_estado') return { ok: true, dados: qa.state() };
    if (fn !== 'caixa_registrar') throw Error('RPC inesperada');
    qa.writes.push(copy(args));
    if (qa.mode === 'reject') return { ok: false, incerto: false, mensagem: 'Pedido recusado no ensaio' };
    if (qa.mode === 'lostBefore') return { ok: false, incerto: true };
    let op = qa.ops.find(o => o.id === args.p_operacao && o.company_id === root._companyId);
    if (!op) {
      const p = args.p_pedido;
      const movimento = { ...copy(p), id: id(100 + qa.movements.length), operacao_id: args.p_operacao, company_id: root._companyId, cancelado_em: null };
      const resultado = { company_id: root._companyId, operacao_id: args.p_operacao, acao: 'movimento', movimento_id: movimento.id };
      op = { id: args.p_operacao, company_id: root._companyId, pedido: copy(p), resultado };
      qa.ops.push(op); qa.movements.push(movimento);
      const conta = qa.contas.find(c => c.id === p.conta_pagar_id && c.company_id === root._companyId);
      if (conta && p.valor_centavos + p.desconto_centavos - p.juros_centavos >= conta.valor * 100) { conta.status = 'pago'; conta.data_pagamento = p.data_efetiva; }
    }
    if (qa.mode === 'lostAfter') return { ok: false, incerto: true };
    if (qa.mode === 'wrongReceipt') return { ok: true, dados: { ...copy(op.resultado), movimento_id: id(999) } };
    return { ok: true, dados: copy(op.resultado) };
  };
  root.renderCaixa = async () => {};
}

function dom() {
  const fields = new Map();
  function element(id, tag = 'div') {
    const e = { id, tagName: tag.toUpperCase(), value: '', checked: false, disabled: false, textContent: '', focus() {},
      remove() { fields.delete(id); }, insertAdjacentHTML(_, html) { parse(html); this._html = html; } };
    Object.defineProperty(e, 'innerHTML', { get: () => e._html || '', set: html => { e._html = html; parse(html); } });
    fields.set(id, e); return e;
  }
  function parse(html) {
    for (const m of String(html).matchAll(/<(input|select|button|div|p)[^>]*\bid="([^"]+)"[^>]*>/g)) {
      const e = element(m[2], m[1]); e.value = /\bvalue="([^"]*)"/.exec(m[0])?.[1] || '';
    }
  }
  element('contas-stats'); element('contas-lista');
  return { fields, document: { body: element('body'), getElementById: id => fields.get(id) || null,
    querySelectorAll: () => [...fields.values()].filter(e => ['INPUT','SELECT'].includes(e.tagName)) } };
}
async function ambiente(journal = new Map(), seed) {
  const d = dom();
  const ctx = { document: d.document, crypto: webcrypto, console, setTimeout, clearTimeout,
    sessionStorage: { getItem: k => journal.get(k) || null, setItem: (k,v) => journal.set(k,v), removeItem: k => journal.delete(k) } };
  instalarFixture(ctx);
  if (seed) Object.assign(ctx.__qa, plain(seed));
  vm.createContext(ctx);
  vm.runInContext(source('edr-v2-financeiro.js') + '\n' + source('edr-v2-caixa-prospectivo.js'), ctx);
  await ctx._loadContasPagar(); await ctx.caixaProspectivoCarregar(); ctx.renderContasPagar();
  return { ...d, ctx, qa: ctx.__qa, journal, run: code => vm.runInContext(code,ctx), panel: () => d.fields.get('contas-stats').innerHTML };
}
async function pagar(a, mode = 'success', valor = '100') {
  await a.ctx.caixaProspectivoAbrir('pagamento',a.qa.id(3));
  for (const [id,value] of Object.entries({ 'cp-valor':valor,'cp-data':'2026-10-16','cp-origem':'banco','cp-descricao':'','cp-desconto':'0','cp-juros':'0' })) a.fields.get(id).value=value;
  a.fields.get('cp-pago-confirmado').checked=true;
  a.qa.mode=mode;
  await a.ctx.caixaProspectivoSalvar();
}
const successes = a => a.qa.toasts.filter(t => t.startsWith('Pagamento registrado'));

test('sucesso: recibo corresponde ao registro, com NF, fornecedor, valor, data e operação; observação vazia', async () => {
  const a=await ambiente(); await pagar(a);
  assert.equal(a.qa.writes.length,1); assert.equal(a.qa.movements.length,1); assert.equal(a.journal.size,0);
  assert.equal(successes(a).length,1);
  for (const text of ['Fornecedor Fictício','TESTE-123/1','100,00','16/10/2026',a.qa.ops[0].id,a.qa.movements[0].id]) assert.ok(a.panel().includes(text));
  assert.equal(a.qa.ops[0].pedido.descricao,'');
  assert.ok(a.qa.reads.filter(r=>r.table!=='contas_pagar').every(r=>r.throwOnError));
});
test('erro definitivo preserva formulário, sem recibo nem sucesso', async () => {
  const a=await ambiente(); await pagar(a,'reject');
  assert.equal(a.qa.movements.length,0); assert.equal(successes(a).length,0); assert.equal(a.journal.size,0);
  assert.match(a.fields.get('cp-erro').textContent,/recusado/); assert.ok(a.fields.has('cp-modal'));
});
test('resposta perdida após commit: voltar à lista e consultar encontra a operação, sem reenviar', async () => {
  const a=await ambiente(); await pagar(a,'lostAfter');
  assert.equal(successes(a).length,0); assert.equal(a.journal.size,1);
  a.ctx.caixaProspectivoCancelarFormulario(); a.ctx.renderContasPagar();
  assert.match(a.panel(),/Pagamento aguardando confirmação/); assert.match(a.panel(),/TESTE-123\/1/);
  await a.ctx.caixaProspectivoConferirPendente();
  assert.equal(a.qa.writes.length,1); assert.equal(a.journal.size,0); assert.equal(successes(a).length,1);
});
test('retorno em outra instância da mesma aba recupera journal e recibo sem escrita', async () => {
  const a=await ambiente(); await pagar(a,'lostAfter');
  const b=await ambiente(a.journal,{ ops:a.qa.ops,movements:a.qa.movements,contas:a.qa.contas });
  assert.match(b.panel(),/aguardando confirmação/);
  await b.ctx.caixaProspectivoConsultarPagamentoPendente();
  assert.equal(b.qa.writes.length,0); assert.match(b.panel(),/Pagamento registrado/);
});
test('ausência não é sucesso nem rollback: consulta não escreve; reenvio conserva pedido e UUID', async () => {
  const a=await ambiente(); await pagar(a,'lostBefore');
  await a.ctx.caixaProspectivoSalvar(); assert.equal(a.qa.writes.length,1);
  assert.match(a.panel(),/não confirma que a tentativa falhou/); assert.match(a.panel(),/Reenviar o mesmo registro/);
  a.qa.mode='success'; await a.ctx.caixaProspectivoReenviarPagamentoPendente();
  assert.deepEqual(a.qa.writes[1],a.qa.writes[0]); assert.equal(a.qa.movements.length,1); assert.equal(successes(a).length,1);
});
test('operação concluída entre consulta e clique em reenviar é só lida, sem segunda escrita', async () => {
  const a=await ambiente(); await pagar(a,'lostBefore'); await a.ctx.caixaProspectivoConsultarPagamentoPendente();
  a.qa.mode='success'; await a.ctx.sbRpcEstoque('caixa_registrar',a.qa.writes[0]); // commit fictício tardio
  const count=a.qa.writes.length;
  await a.ctx.caixaProspectivoReenviarPagamentoPendente();
  assert.equal(a.qa.writes.length,count); assert.equal(a.qa.movements.length,1); assert.equal(a.journal.size,0);
});
test('falha de leitura bloqueia reenvio e preserva a tentativa', async () => {
  const a=await ambiente(); await pagar(a,'lostBefore'); a.qa.mode='readFailure';
  await a.ctx.caixaProspectivoReenviarPagamentoPendente();
  assert.equal(a.qa.writes.length,1); assert.equal(a.journal.size,1); assert.equal(successes(a).length,0);
  assert.doesNotMatch(a.panel(),/onclick="caixaProspectivoReenviar/);
});
test('resposta aparentemente OK com movimento divergente não anuncia sucesso', async () => {
  const a=await ambiente(); await pagar(a,'wrongReceipt');
  assert.equal(successes(a).length,0); assert.equal(a.journal.size,1); assert.match(a.panel(),/não correspondem/);
  await a.ctx.caixaProspectivoConsultarPagamentoPendente(); assert.equal(successes(a).length,1); assert.equal(a.qa.writes.length,1);
});
for (const field of ['operation','target','company','value','date','request']) {
  test('identificação divergente bloqueia recibo/reenvio: '+field, async () => {
    const a=await ambiente(); await pagar(a,'lostAfter');
    if(field==='operation') a.qa.movements[0].operacao_id=a.qa.id(88);
    if(field==='target') a.qa.movements[0].conta_pagar_id=a.qa.id(88);
    if(field==='company') { const get=a.ctx.sbGet; a.ctx.sbGet=async(...args)=>{const rows=await get(...args);if(args[0]==='caixa_movimentos')rows[0].company_id=a.qa.id(88);return rows;}; }
    if(field==='value') a.qa.movements[0].valor_centavos++;
    if(field==='date') a.qa.movements[0].data_efetiva='2026-10-17';
    if(field==='request') a.qa.ops[0].pedido.descricao='Pedido diferente';
    await a.ctx.caixaProspectivoReenviarPagamentoPendente();
    assert.equal(successes(a).length,0); assert.equal(a.journal.size,1); assert.equal(a.qa.writes.length,1); assert.match(a.panel(),/não correspondem/);
  });
}
test('troca de empresa não expõe tentativa/recibo e não consulta a empresa anterior', async () => {
  const a=await ambiente(); await pagar(a,'lostAfter'); const before=a.qa.reads.length;
  a.ctx._companyId=a.qa.id(9); a.ctx.renderContasPagar();
  assert.doesNotMatch(a.panel(),/Fornecedor Fictício|TESTE-123|Operação:/);
  await a.ctx.caixaProspectivoConsultarPagamentoPendente(); assert.equal(a.qa.reads.length,before); assert.equal(a.journal.size,1);
});
test('troca de empresa ou ator durante consulta descarta resposta e preserva journal', async () => {
  for (const change of ['company','actor','role']) {
    const a=await ambiente(); await pagar(a,'lostAfter'); const get=a.ctx.sbGet;
    a.ctx.sbGet=async(...args)=>{const rows=await get(...args);if(args[0]==='caixa_operacoes'){
      if(change==='company')a.ctx._companyId=a.qa.id(9);
      if(change==='actor')a.ctx.usuarioAtual={...a.ctx.usuarioAtual};
      if(change==='role')a.ctx.usuarioAtual.perfil='visualizador';
    }return rows;};
    await a.ctx.caixaProspectivoReenviarPagamentoPendente(); a.ctx.renderContasPagar();
    assert.equal(successes(a).length,0); assert.equal(a.journal.size,1); assert.equal(a.qa.writes.length,1);
    if(change!=='actor')assert.doesNotMatch(a.panel(),/Fornecedor Fictício/);
  }
});
test('sem permissão administrativa não consulta, reenvia nem exibe recibo', async () => {
  const a=await ambiente(); await pagar(a); const reads=a.qa.reads.length;
  a.ctx.usuarioAtual.perfil='visualizador'; a.ctx.renderContasPagar();
  await a.ctx.caixaProspectivoReenviarPagamentoPendente();
  assert.equal(a.qa.reads.length,reads); assert.equal(a.qa.writes.length,1); assert.doesNotMatch(a.panel(),/Fornecedor Fictício/);
});
test('clique duplo na consulta/reenvio não duplica operação', async () => {
  const a=await ambiente(); await pagar(a,'lostBefore'); a.qa.mode='success';
  await Promise.all([a.ctx.caixaProspectivoReenviarPagamentoPendente(),a.ctx.caixaProspectivoReenviarPagamentoPendente()]);
  assert.equal(a.qa.writes.length,2); assert.equal(a.qa.movements.length,1); assert.deepEqual(a.qa.writes[0],a.qa.writes[1]);
});
test('parcial não é apresentado como quitação; dados textuais são escapados', async () => {
  const a=await ambiente(); a.qa.contas[0].fornecedor='<img src=x onerror=alert(1)>'; await pagar(a,'success','40');
  assert.match(a.panel(),/não está quitada/); assert.match(a.panel(),/40,00/); assert.match(a.panel(),/&lt;img/); assert.doesNotMatch(a.panel(),/<img/);
});
test('movimento cancelado localizado resolve tentativa sem afirmar pagamento ativo', async () => {
  const a=await ambiente(); await pagar(a,'lostAfter'); a.qa.movements[0].cancelado_em='2026-10-19T12:00:00Z';
  await a.ctx.caixaProspectivoConsultarPagamentoPendente();
  assert.match(a.panel(),/Registro localizado — cancelado/); assert.equal(successes(a).length,0); assert.equal(a.journal.size,0);
});
test('ordem das chaves JSONB não provoca divergência falsa', async () => {
  const a=await ambiente(); await pagar(a,'lostAfter');
  a.qa.ops[0].pedido=Object.fromEntries(Object.entries(a.qa.ops[0].pedido).reverse());
  await a.ctx.caixaProspectivoConsultarPagamentoPendente(); assert.equal(successes(a).length,1);
});
test('journal antigo sem identificação continua recuperável mesmo sem leitura geral do Caixa', async () => {
  const a=await ambiente(); await pagar(a,'lostAfter');
  const key=[...a.journal.keys()][0], j=JSON.parse(a.journal.get(key)); delete j.identificacao; a.journal.set(key,JSON.stringify(j));
  a.run('_cpInvalidarLeitura()'); a.ctx.renderContasPagar();
  assert.match(a.panel(),/aguardando confirmação/); assert.match(a.panel(),/Pagamentos persistidos indisponíveis/);
  await a.ctx.caixaProspectivoConsultarPagamentoPendente(); assert.equal(successes(a).length,1); assert.equal(a.qa.writes.length,1);
});
test('recibo confirmado não aparece após troca de empresa', async () => {
  const a=await ambiente(); await pagar(a); a.ctx._companyId=a.qa.id(9); a.ctx.renderContasPagar();
  assert.doesNotMatch(a.panel(),/Fornecedor Fictício|TESTE-123|Operação:/);
});

test('Chromium: perda de resposta, voltar, consulta sem reenvio e recibo responsivo', { skip: !process.env.EDR_RECIBO_PLAYWRIGHT_PATH }, async t => {
  const { chromium }=require(process.env.EDR_RECIBO_PLAYWRIGHT_PATH);
  const browser=await chromium.launch({headless:true,...(process.env.EDR_CHROMIUM_PATH ? {executablePath:process.env.EDR_CHROMIUM_PATH} : {})}); t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const url='http://127.0.0.1:43199/recibo-ficticio'; let external=0;
  const style=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
  await page.route('**/*',route=>route.request().url()===url?route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>${style}</style><body><main style="max-width:1000px;margin:20px auto;padding:12px"><h1>Contas a Pagar · Ensaio fictício</h1><div id="contas-stats"></div><div id="contas-lista"></div></main></body></html>`}):(external++,route.abort()));
  await page.goto(url); await page.evaluate('('+instalarFixture.toString()+')(window)');
  await page.addScriptTag({content:source('edr-v2-financeiro.js')}); await page.addScriptTag({content:source('edr-v2-caixa-prospectivo.js')});
  await page.evaluate(async()=>{await _loadContasPagar();await caixaProspectivoCarregar();renderContasPagar();});
  await page.getByRole('button',{name:'Confirmar pagamento',exact:true}).click();
  await page.locator('#cp-origem').selectOption('banco'); await page.locator('#cp-valor').fill('100'); await page.locator('#cp-data').fill('2026-10-16'); await page.locator('#cp-pago-confirmado').check();
  await page.evaluate(()=>{__qa.mode='lostAfter';}); await page.locator('#cp-salvar').click();
  await page.getByRole('button',{name:'Voltar à lista',exact:true}).click();
  assert.match(await page.locator('#contas-stats').innerText(),/TESTE-123\/1/);
  const evidence=process.env.EDR_RECIBO_EVIDENCE_DIR;
  if(evidence){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,'tentativa-pendente-desktop.png'),fullPage:true});}
  await page.getByRole('button',{name:'Consultar resultado',exact:true}).click();
  await page.getByRole('status',{name:'Recibo do registro de pagamento'}).waitFor();
  assert.match(await page.locator('#contas-stats').innerText(),/Pagamento registrado no sistema/);
  assert.equal(await page.evaluate(()=>__qa.writes.length),1);
  if(evidence)await page.screenshot({path:path.join(evidence,'recibo-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Sem overflow no recibo mobile');
  if(evidence)await page.screenshot({path:path.join(evidence,'recibo-mobile.png'),fullPage:true});
  assert.equal(external,0,'Nenhum recurso externo acessado');
});
