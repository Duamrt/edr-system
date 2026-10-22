'use strict';
// Financeiro, parcelas e viewRegistry reais. Servidor, identidade e dados sinteticos.
// EDR_LISTAGEM_BASELINE=1 le os modulos do HEAD, sem reverter arquivos compartilhados.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const baseline = process.env.EDR_LISTAGEM_BASELINE === '1';
const evidence = path.resolve(process.env.EDR_LISTAGEM_EVIDENCE_DIR || path.join(root, '..', 'listagem-evidence'));
const origin = 'http://127.0.0.1:43812';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const empresa = id(10);
function fonte(rel) {
  return baseline ? execFileSync('git', ['show', 'HEAD:' + rel], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    : fs.readFileSync(path.join(root, rel), 'utf8');
}
const index = fonte('index.html');
const registry = index.match(/const viewRegistry = \{[\s\S]*?\n\};/)?.[0];
assert.ok(registry, 'viewRegistry deve ser extraido do index real.');
const sources = new Map([
  ['/js/edr-v2-financeiro.js', fonte('js/edr-v2-financeiro.js')],
  ['/js/edr-v2-parcelas.js', fonte('js/edr-v2-parcelas.js')],
]);
const seed = [
  { id: id(20), company_id: empresa, fornecedor: 'DANTAS SINTETICO', descricao: 'Boleto futuro sintetico', valor: 290, data_vencimento: '2026-11-10', status: 'pendente', obra_id: null, nota_id: null, nota_ref: null },
  { id: id(21), company_id: empresa, fornecedor: 'DARF SINTETICO', descricao: 'Tributo pago sintetico', valor: 71.43, data_vencimento: '2026-10-15', data_pagamento: '2026-10-14', status: 'pago', obra_id: null, nota_id: null, nota_ref: null },
];
const original = { id: id(30), company_id: empresa, fornecedor: 'FORNECEDOR NF SINTETICO', descricao: 'Obrigacao original sintetica', valor: 1854.17, data_vencimento: '2026-10-28', status: 'pendente', obra_id: null, nota_id: id(3), nota_ref: '100/1' };
let browser;
test.before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.EDR_CHROMIUM_EXECUTABLE || undefined }); });
test.after(async () => { await browser?.close(); });

function html(rows) {
  const css = [...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  const bootstrap = String.raw`
    var _companyId='00000000-0000-4000-8000-000000000010';
    var usuarioAtual={id:'00000000-0000-4000-8000-000000000011',perfil:'admin'};
    var obras=[],notas=[],lancamentos=[],repassesCef=[],adicionaisPgtos=[];
    var __qa={reads:[],writes:[],toasts:[],failGet:false,nextId:100};
    var __seed=JSON.parse(document.getElementById('qa-seed').textContent);
    __qa.rows=JSON.parse(sessionStorage.getItem('qa-servidor-contas')||'null')||__seed;
    var __plain=x=>JSON.parse(JSON.stringify(x));
    var __persist=()=>sessionStorage.setItem('qa-servidor-contas',JSON.stringify(__qa.rows));
    var __id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    var showToast=m=>__qa.toasts.push(m);
    var hojeISO=()=>'2026-10-22';
    var fmt=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    var fmtData=d=>d?d.split('-').reverse().join('/'):'-';
    var esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    var sbGet=async(t,q='',options={})=>{
      __qa.reads.push({t,q,throwOnError:options.throwOnError===true});
      if(t==='contas_pagar'){
        if(__qa.failGet)throw Error('Falha GET sintetica');
        return __plain(__qa.rows);
      }
      return [];
    };
    var sbGetAll=async(...args)=>sbGet(...args);
    var caixaProspectivoCarregar=async()=>({movimentos:[]});
    var caixaProspectivoEstado=()=>({movimentos:[]});
    var caixaProspectivoRestante=c=>Number(c.valor);
    var caixaProspectivoRender=async el=>{el.textContent='Caixa sintetico: '+contasPagar.length+' contas em memoria';};
    var sbRpcEstoque=async(fn,p)=>{
      if(fn!=='registrar_parcelas_conta')throw Error('RPC inesperada no ensaio');
      __qa.writes.push(__plain({fn,...p}));
      const pedido=p.p_pedido;
      const origem=pedido.conta_id?__qa.rows.find(c=>c.id===pedido.conta_id):null;
      const novas=pedido.parcelas.map((parcela,i)=>({
        ...(origem||{}), id:origem&&i===0?origem.id:__id(__qa.nextId++),company_id:_companyId,
        fornecedor:pedido.fornecedor,descricao:pedido.descricao+' - Parcela '+(i+1),valor:parcela.valor_centavos/100,
        data_vencimento:parcela.vencimento,status:pedido.status,data_pagamento:pedido.data_pagamento,
        nota_id:pedido.nota_id,nota_ref:pedido.nota_ref,obra_id:pedido.obra_id,
        parcelamento_historico:[{operacao_id:p.p_operacao_id}],
      }));
      for(const nova of novas){const pos=__qa.rows.findIndex(c=>c.id===nova.id);if(pos<0)__qa.rows.push(nova);else __qa.rows[pos]=nova;}
      __persist();return {ok:true,dados:{contas:__plain(novas),repetida:false}};
    };
    var __qaNavigate=v=>{
      document.querySelectorAll('.qa-view').forEach(el=>el.style.display=el.id==='view-'+v?'':'none');
      document.body.dataset.qaView=v;
      viewRegistry.invoke(v);
    };
  `;
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style></head><body>'
    + '<main style="padding:24px;max-width:1100px;margin:auto"><h1>Contas a pagar - ensaio sintetico</h1><nav style="display:flex;gap:12px;margin:16px 0"><button id="qa-contas" class="btn" onclick="__qaNavigate(\'contas-pagar\')">Abrir Contas</button><button id="qa-caixa" class="btn" onclick="__qaNavigate(\'caixa\')">Abrir Caixa</button></nav>'
    + '<section class="qa-view" id="view-contas-pagar" style="display:none"><div id="contas-stats"></div><div id="contas-lista"></div></section>'
    + '<section class="qa-view" id="view-caixa" style="display:none"><div id="caixa-content"></div></section></main>'
    + '<script type="application/json" id="qa-seed">' + JSON.stringify(rows).replace(/</g, '\\u003c') + '</script>'
    + '<script>' + registry + '\n' + bootstrap + '</script><script src="/js/edr-v2-parcelas.js"></script><script src="/js/edr-v2-financeiro.js"></script></body></html>';
}
async function abrir(rows=seed) {
  const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],external=[];
  page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin!==origin||req.method()!=='GET'){external.push({method:req.method(),path:u.pathname});return route.abort();}
    if(u.pathname==='/index.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:html(rows)});
    if(sources.has(u.pathname))return route.fulfill({contentType:'application/javascript; charset=utf-8',body:sources.get(u.pathname)});
    return route.fulfill({status:404,body:''});
  });
  await page.goto(origin+'/index.html');
  return {page,errors,external,close:()=>context.close()};
}
async function navegar(page,view) {
  await page.locator(view==='caixa'?'#qa-caixa':'#qa-contas').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
}
const cache=page=>page.evaluate(()=>JSON.parse(JSON.stringify(contasPagar)));
const writes=page=>page.evaluate(()=>__qa.writes);
async function preencher(page,i,valor,vencimento) {
  await page.getByLabel('Valor da parcela '+i,{exact:true}).fill(valor);
  await page.getByLabel('Vencimento da parcela '+i,{exact:true}).fill(vencimento);
}
async function criarDuas(page) {
  await page.evaluate(()=>{void ParcelasConta.abrir({modo:'nota',notaId:'00000000-0000-4000-8000-000000000003',numero:'100/1',fornecedor:'FORNECEDOR NF SINTETICO',valorTotalNF:1854.17});});
  await preencher(page,1,'927,08','2026-10-28');
  await page.locator('#parcelas-adicionar').click();
  await preencher(page,2,'927,09','2026-11-04');
  await page.locator('#parcelas-salvar').click();
  await page.locator('#parcelas-conta-modal').waitFor({state:'detached'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
}
async function todas(page,quantidade) {
  const button=page.locator('#contas-stats').getByRole('button',{name:'Todas ('+quantidade+')',exact:true});
  assert.equal(await button.count(),1, 'Todas deve refletir o conjunto completo, inclusive contas anteriores');
  await button.click();
  assert.match(await page.locator('#contas-lista').innerText(),/DANTAS SINTETICO/);
  assert.match(await page.locator('#contas-lista').innerText(),/DARF SINTETICO/);
  assert.equal((await cache(page)).length,quantidade);
}
async function screenshot(page,nome){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,(baseline?'baseline-':'fix-')+nome+'.png'),fullPage:true});}
function intactos(a){assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);}

test('criar duas antes de abrir Financeiro carrega Todas com DANTAS e DARF anteriores',async()=>{
  const a=await abrir();try{
    assert.deepEqual(await cache(a.page),[]);
    await criarDuas(a.page);
    assert.equal(await a.page.evaluate(()=>__qa.rows.length),4);
    await navegar(a.page,'contas-pagar');
    await screenshot(a.page,'criar-antes-financeiro');
    await todas(a.page,4);
    assert.deepEqual((await cache(a.page)).find(c=>c.id===id(21)),seed[1]);
    assert.equal((await writes(a.page)).length,1);
    intactos(a);
  }finally{await a.close();}
});

test('desdobrar substitui a conta original pelo mesmo ID e conserva demais contas',async()=>{
  const a=await abrir([...seed,original]);try{
    await navegar(a.page,'contas-pagar');await todas(a.page,3);
    await a.page.evaluate(source=>{void ParcelasConta.abrirDesdobramento(contasPagar.find(c=>c.id===source));},original.id);
    await preencher(a.page,1,'800,01','2026-10-29');await a.page.locator('#parcelas-adicionar').click();
    await preencher(a.page,2,'1054,16','2026-11-13');await a.page.locator('#parcelas-motivo').fill('Desdobramento sintetico conforme boletos');
    await a.page.locator('#parcelas-salvar').click();await a.page.locator('#parcelas-conta-modal').waitFor({state:'detached'});
    await a.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    await todas(a.page,4);
    const rows=await cache(a.page);
    assert.equal(rows.filter(c=>c.id===original.id).length,1);
    assert.equal(rows.find(c=>c.id===original.id).valor,800.01);
    assert.equal(rows.filter(c=>c.nota_id===original.nota_id).reduce((s,c)=>s+Math.round(c.valor*100),0),185417);
    assert.deepEqual(rows.find(c=>c.id===seed[0].id),seed[0]);assert.deepEqual(rows.find(c=>c.id===seed[1].id),seed[1]);
    await screenshot(a.page,'desdobramento-preserva-lista');intactos(a);
  }finally{await a.close();}
});

test('Caixa para Contas e reload consultam servidor sem perder conjunto ou novas contas',async()=>{
  const a=await abrir();try{
    await criarDuas(a.page);await navegar(a.page,'contas-pagar');await todas(a.page,4);
    await a.page.evaluate(extra=>{__qa.rows.push(extra);__persist();},{id:id(50),company_id:empresa,fornecedor:'CONTA NOVA SINTETICA',valor:10.01,data_vencimento:'2026-12-01',status:'pendente'});
    await navegar(a.page,'caixa');assert.equal((await cache(a.page)).length,5);
    await navegar(a.page,'contas-pagar');await todas(a.page,5);
    await a.page.reload();assert.deepEqual(await cache(a.page),[]);
    await navegar(a.page,'contas-pagar');await todas(a.page,5);
    assert.match(await a.page.locator('#contas-lista').innerText(),/CONTA NOVA SINTETICA/);
    assert.equal((await writes(a.page)).length,0,'Reload nunca repete RPC de parcelamento');intactos(a);
  }finally{await a.close();}
});

test('filtros Pagas e mes mudam so apresentacao e Todas restaura lista completa',async()=>{
  const a=await abrir([...seed,original]);try{
    await navegar(a.page,'contas-pagar');await todas(a.page,3);
    const before=await cache(a.page);
    await a.page.locator('#contas-stats').getByRole('button',{name:'Pagas (1)',exact:true}).click();
    assert.match(await a.page.locator('#contas-lista').innerText(),/DARF SINTETICO/);
    assert.doesNotMatch(await a.page.locator('#contas-lista').innerText(),/DANTAS SINTETICO/);
    await a.page.locator('#contas-stats input[type="month"]').fill('2026-11');
    await a.page.locator('#contas-stats input[type="month"]').dispatchEvent('change');
    assert.doesNotMatch(await a.page.locator('#contas-lista').innerText(),/DARF SINTETICO/);
    assert.deepEqual(await cache(a.page),before);
    await a.page.locator('#contas-stats input[type="month"]').fill('');
    await a.page.locator('#contas-stats input[type="month"]').dispatchEvent('change');
    await todas(a.page,3);assert.deepEqual(await cache(a.page),before);
    assert.deepEqual(await writes(a.page),[]);intactos(a);
  }finally{await a.close();}
});

test('falha GET conserva cache e informa indisponibilidade em vez de lista vazia',async()=>{
  const a=await abrir([...seed,original]);try{
    await navegar(a.page,'contas-pagar');await todas(a.page,3);const before=await cache(a.page);
    await a.page.evaluate(()=>{__qa.failGet=true;});
    await navegar(a.page,'contas-pagar');
    assert.deepEqual(await cache(a.page),before);
    assert.match(await a.page.locator('#contas-stats').innerText(),/Não foi possível atualizar.*lista completa|indisponível/);
    assert.doesNotMatch(await a.page.locator('#contas-lista').innerText(),/Nenhuma conta cadastrada/);
    await screenshot(a.page,'falha-leitura-preserva-cache');
    await a.page.evaluate(()=>{__qa.failGet=false;});
    await a.page.getByRole('button',{name:'Carregar contas novamente',exact:true}).click();
    await a.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    await todas(a.page,3);assert.deepEqual(await writes(a.page),[]);intactos(a);
  }finally{await a.close();}
});

test('RPC confirmada com GET posterior falhando limpa pedido e recupera lista sem repetir RPC',async()=>{
  const a=await abrir();try{
    await a.page.evaluate(()=>{__qa.failGet=true;});
    await criarDuas(a.page);
    assert.equal((await writes(a.page)).length,1);assert.equal(await a.page.evaluate(()=>__qa.rows.length),4);
    assert.equal(await a.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('edr-parcelas-conta-v1:')).length),0);
    await navegar(a.page,'contas-pagar');
    assert.match(await a.page.locator('#contas-stats').innerText(),/Não foi possível atualizar.*lista completa|indisponível/);
    await a.page.getByRole('button',{name:'Carregar contas novamente',exact:true}).click();
    await a.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    assert.equal((await writes(a.page)).length,1);
    await a.page.evaluate(()=>{__qa.failGet=false;});
    await a.page.getByRole('button',{name:'Carregar contas novamente',exact:true}).click();
    await a.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    await todas(a.page,4);assert.equal((await writes(a.page)).length,1);intactos(a);
  }finally{await a.close();}
});
