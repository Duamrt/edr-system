'use strict';
// Chromium real; HTML/CSS, viewRegistry, financeiro e parcelas reais.
// Identidades, transporte e gravacoes inteiramente sinteticos. Nenhuma rede externa.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.EDR_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const evidence = path.resolve(process.env.EDR_EDICAO_EVIDENCE_DIR || path.join(root, '..', 'edicao-evidence-20261023'));
const origin = 'http://127.0.0.1:43813';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const empresa = id(10);
const original = { id:id(30), company_id:empresa, fornecedor:'DANTAS SINTETICO', descricao:'Obrigacao antiga sintetica', valor:1854.17, data_vencimento:'2026-10-28', status:'pendente', obra_id:null, nota_id:id(3), nota_ref:'100/1' };
const paga = { id:id(31), company_id:empresa, fornecedor:'DANTAS SINTETICO - PAGA', descricao:'Parcela paga preservada', valor:71.43, data_vencimento:'2026-10-15', data_pagamento:'2026-10-14', status:'pago', obra_id:null, nota_id:id(3), nota_ref:'100/1' };
const outra = { id:id(32), company_id:empresa, fornecedor:'OUTRA CONTA SINTETICA', descricao:'Obrigacao independente', valor:290, data_vencimento:'2026-12-10', status:'pendente', obra_id:null, nota_id:null, nota_ref:null };
const seed = [original,paga,outra];
const source = rel => fs.readFileSync(path.join(root,rel),'utf8');
const index = source('index.html');
const registry = index.match(/const viewRegistry = \{[\s\S]*?\n\};/)?.[0];
const modalStart = index.indexOf('<div id="modal-conta"');
const modalEnd = index.indexOf('<!-- MODAL PROJECAO CAIXA -->',modalStart);
assert.ok(registry && modalStart >= 0 && modalEnd > modalStart,'Extrair registry/modal reais do index');
const modal = index.slice(modalStart,modalEnd);
const modalHelpers = ['openModal','fecharModal'].map(name => {
  const fn = index.match(new RegExp('function '+name+'\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'))?.[0];
  assert.ok(fn,'Helper real '+name);return fn;
}).join('\n');
const sources = new Map([
  ['/js/edr-v2-financeiro.js',source('js/edr-v2-financeiro.js')],
  ['/js/edr-v2-parcelas.js',source('js/edr-v2-parcelas.js')],
]);
let browser;
test.before(async()=>{ browser=await chromium.launch({headless:true,executablePath:process.env.EDR_CHROMIUM_EXECUTABLE||undefined}); });
test.after(async()=>{await browser?.close();});

function html(rows) {
  const css=[...index.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');
  const bootstrap=String.raw`
    var _companyId='00000000-0000-4000-8000-000000000010';
    var usuarioAtual={id:'00000000-0000-4000-8000-000000000011',perfil:'admin'};
    var obras=[{id:'00000000-0000-4000-8000-000000000040',nome:'OBRA SINTETICA'}],notas=[],lancamentos=[],repassesCef=[],adicionaisPgtos=[];
    var __qa={reads:[],writes:[],patches:[],toasts:[],nextId:100,holdRpc:false,holdConsulta:false};
    var __plain=x=>JSON.parse(JSON.stringify(x));
    var __id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
    var __seed=JSON.parse(document.getElementById('qa-seed').textContent);
    __qa.rows=JSON.parse(sessionStorage.getItem('qa-contas-edicao')||'null')||__seed;
    var __persist=()=>sessionStorage.setItem('qa-contas-edicao',JSON.stringify(__qa.rows));
    var showToast=m=>__qa.toasts.push(m);
    var hojeISO=()=>'2026-10-23';
    var fmt=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    var fmtData=d=>d?d.split('-').reverse().join('/'):'-';
    var esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    var sbGet=async(t,q='',options={})=>{__qa.reads.push({t,q,options});return t==='contas_pagar'?__plain(__qa.rows):[];};
    var sbGetAll=async(...args)=>sbGet(...args);
    var sbPost=async()=>{throw Error('POST direto inesperado no ensaio');};
    var sbPatch=async(t,q,p)=>{
      if(t!=='contas_pagar')throw Error('PATCH inesperado');
      const alvo=q.split('eq.')[1],pos=__qa.rows.findIndex(c=>c.id===alvo);
      __qa.patches.push(__plain({t,q,p}));
      if(pos<0)return undefined;
      __qa.rows[pos]={...__qa.rows[pos],...p};__persist();return __plain(__qa.rows[pos]);
    };
    var caixaProspectivoPodeAlterarConta=async()=>{
      if(__qa.holdConsulta)await new Promise(resolve=>__qa.resolveConsulta=resolve);return true;
    };
    var caixaProspectivoVinculada=()=>false;
    var caixaProspectivoCarregar=async()=>({movimentos:[]});
    var caixaProspectivoEstado=()=>({movimentos:[]});
    var caixaProspectivoRestante=c=>Number(c.valor);
    var caixaProspectivoRender=async el=>{el.textContent='Caixa sintetico: '+contasPagar.length+' contas';};
    var sbRpcEstoque=async(fn,p)=>{
      if(fn!=='registrar_parcelas_conta')throw Error('RPC inesperada');
      __qa.writes.push(__plain({fn,...p}));
      if(__qa.holdRpc)await new Promise(resolve=>__qa.resolveRpc=resolve);
      const pedido=p.p_pedido,origem=pedido.conta_id?__qa.rows.find(c=>c.id===pedido.conta_id):null;
      const novas=pedido.parcelas.map((parcela,i)=>({
        ...(origem||{}),id:origem&&i===0?origem.id:__id(__qa.nextId++),company_id:_companyId,
        fornecedor:pedido.fornecedor,descricao:pedido.descricao,valor:parcela.valor_centavos/100,
        data_vencimento:parcela.vencimento,status:pedido.status,data_pagamento:pedido.data_pagamento,
        nota_id:pedido.nota_id,nota_ref:pedido.nota_ref,obra_id:pedido.obra_id,
        parcelamento:[{operacao_id:p.p_operacao_id}],
      }));
      for(const nova of novas){const pos=__qa.rows.findIndex(c=>c.id===nova.id);if(pos<0)__qa.rows.push(nova);else __qa.rows[pos]=nova;}
      __persist();return {ok:true,dados:{contas:__plain(novas),repetida:false}};
    };
    var __qaNavigate=v=>{
      document.querySelectorAll('.qa-view').forEach(el=>el.style.display=el.id==='view-'+v?'':'none');
      viewRegistry.invoke(v);
    };
  `;
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body>'
    +'<main style="padding:16px;max-width:1100px;margin:auto"><h1>Edicao de contas - ensaio sintetico</h1><nav style="display:flex;gap:12px;margin:16px 0"><button id="qa-contas" class="btn" onclick="__qaNavigate(\'contas-pagar\')">Abrir Contas</button><button id="qa-caixa" class="btn" onclick="__qaNavigate(\'caixa\')">Abrir Caixa</button></nav>'
    +'<section class="qa-view" id="view-contas-pagar"><div id="contas-stats"></div><div id="contas-lista"></div></section><section class="qa-view" id="view-caixa" style="display:none"><div id="caixa-content"></div></section></main>'
    +modal+'<script type="application/json" id="qa-seed">'+JSON.stringify(rows).replace(/</g,'\\u003c')+'</script>'
    +'<script>'+registry+'\n'+modalHelpers+'\n'+bootstrap+'</script><script src="/js/edr-v2-parcelas.js"></script><script src="/js/edr-v2-financeiro.js"></script></body></html>';
}
async function abrir(rows=seed,width=1440,height=1050) {
  const context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  const page=await context.newPage(),errors=[],external=[];page.setDefaultTimeout(5000);
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin!==origin||req.method()!=='GET'){external.push({method:req.method(),path:u.pathname});return route.abort();}
    if(u.pathname==='/index.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:html(rows)});
    if(sources.has(u.pathname))return route.fulfill({contentType:'application/javascript; charset=utf-8',body:sources.get(u.pathname)});
    return route.fulfill({status:404,body:''});
  });
  await page.goto(origin+'/index.html');await navegar(page,'contas-pagar');
  return {page,errors,external,close:()=>context.close()};
}
async function navegar(page,view) {
  await page.locator(view==='caixa'?'#qa-caixa':'#qa-contas').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
}
const cache=page=>page.evaluate(()=>JSON.parse(JSON.stringify(contasPagar)));
const writes=page=>page.evaluate(()=>__qa.writes);
const valor=(page,i)=>page.getByLabel('Valor da parcela '+i,{exact:true});
const data=(page,i)=>page.getByLabel('Vencimento da parcela '+i,{exact:true});
function intactos(a){assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);}
async function editar(page,conta=original) {
  await page.locator('#contas-lista button[onclick="abrirModalConta(\''+conta.id+'\')"]').click();
  await page.locator('#modal-conta.active').waitFor();
}
async function parcelas(page,conta=original) {
  await editar(page,conta);await page.locator('#conta-desdobrar').click();
  await page.locator('#parcelas-conta-modal').waitFor();
}
async function preencher(page,i,v,d){await valor(page,i).fill(v);await data(page,i).fill(d);}
async function salvar(page) {
  await page.locator('#parcelas-salvar').click();
  await page.locator('#parcelas-conta-modal').waitFor({state:'detached'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
}
async function duas(page) {
  await preencher(page,1,'927,08','2026-10-29');await page.locator('#parcelas-adicionar').click();
  await preencher(page,2,'927,09','2026-11-12');await page.locator('#parcelas-motivo').fill('Boletos sinteticos revisados');
}
async function screenshot(page,name){fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,name+'.png'),fullPage:true});}
async function confirmarPreservacao(page) {
  const rows=await cache(page);
  assert.deepEqual(rows.find(c=>c.id===paga.id),paga,'Parcela paga nunca alterada');
  assert.deepEqual(rows.find(c=>c.id===outra.id),outra,'Obrigacao independente preservada');
}

test('conta antiga abre valores salvos; segunda linha vazia; duas parcelas desiguais preservam ID e paga',async()=>{
  const a=await abrir();try{
    await parcelas(a.page);
    assert.equal(await valor(a.page,1).inputValue(),'1854.17');assert.equal(await data(a.page,1).inputValue(),original.data_vencimento);
    await preencher(a.page,1,'927,08','2026-10-29');await a.page.locator('#parcelas-adicionar').click();
    assert.equal(await valor(a.page,2).inputValue(),'');assert.equal(await data(a.page,2).inputValue(),'');
    await preencher(a.page,2,'927,09','2026-11-12');await a.page.locator('#parcelas-motivo').fill('Dois boletos sinteticos');
    assert.match(await a.page.locator('#parcelas-soma').innerText(),/1\.854,17/);
    await salvar(a.page);const ws=await writes(a.page),rows=await cache(a.page);
    assert.equal(ws.length,1);assert.equal(ws[0].p_pedido.conta_id,original.id);
    assert.deepEqual(ws[0].p_pedido.parcelas.map(p=>[p.valor_centavos,p.vencimento]),[[92708,'2026-10-29'],[92709,'2026-11-12']]);
    assert.equal(ws[0].p_pedido.original.valor_centavos,185417);
    assert.equal(rows.length,4);assert.equal(rows.find(c=>c.id===original.id).valor,927.08);
    assert.equal(rows.filter(c=>c.status==='pendente'&&c.nota_id===original.nota_id).reduce((s,c)=>s+Math.round(c.valor*100),0),185417);
    await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

test('edita somente vencimento de uma parcela mantendo valor e sem divergencia',async()=>{
  const a=await abrir();try{
    await parcelas(a.page);await data(a.page,1).fill('2026-11-06');
    assert.equal(await a.page.locator('#parcelas-confirmacao-row').isVisible(),false);
    await a.page.locator('#parcelas-motivo').fill('Vencimento corrigido conforme boleto sintetico');await salvar(a.page);
    const p=(await writes(a.page))[0].p_pedido;
    assert.equal(p.parcelas.length,1);assert.deepEqual(p.parcelas[0],{numero:'',valor_centavos:185417,vencimento:'2026-11-06'});
    assert.equal(p.aceitar_divergencia,false);await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

test('corrigir valor em uma parcela exige confirmacao e motivo, incluindo centavos',async()=>{
  const a=await abrir();try{
    await parcelas(a.page);await preencher(a.page,1,'1.854,18','2026-11-06');
    await a.page.locator('#parcelas-salvar').click();assert.equal((await writes(a.page)).length,0);
    assert.match(await a.page.locator('#parcelas-erro').innerText(),/confirmação|divergência/);
    await a.page.locator('#parcelas-confirmacao').check();await a.page.locator('#parcelas-salvar').click();
    assert.match(await a.page.locator('#parcelas-erro').innerText(),/motivo/);assert.equal((await writes(a.page)).length,0);
    await a.page.locator('#parcelas-motivo').fill('Acrescimo sintetico de um centavo');await salvar(a.page);
    const p=(await writes(a.page))[0].p_pedido;assert.equal(p.parcelas[0].valor_centavos,185418);assert.equal(p.aceitar_divergencia,true);
    await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

test('cancelar revisao e reabrir recupera dados salvos sem RPC nem journal',async()=>{
  const a=await abrir();try{
    await parcelas(a.page);await duas(a.page);await a.page.locator('#parcelas-cancelar').click();
    assert.equal((await writes(a.page)).length,0);assert.deepEqual(await cache(a.page),seed);
    assert.equal(await a.page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('edr-parcelas-conta-v1:')).length),0);
    await parcelas(a.page);assert.equal(await a.page.locator('.parcela-linha').count(),1);
    assert.equal(await valor(a.page,1).inputValue(),'1854.17');assert.equal(await data(a.page,1).inputValue(),original.data_vencimento);
    await a.page.locator('#parcelas-cancelar').click();intactos(a);
  }finally{await a.close();}
});

test('duplo clique envia uma unica RPC e bloqueia controles ate a resposta',async()=>{
  const a=await abrir();try{
    await parcelas(a.page);await duas(a.page);await a.page.evaluate(()=>{__qa.holdRpc=true;});
    await a.page.locator('#parcelas-salvar').evaluate(el=>{el.click();el.click();});
    assert.equal((await writes(a.page)).length,1);assert.equal(await a.page.locator('#parcelas-salvar').isDisabled(),true);
    assert.equal(await valor(a.page,1).isDisabled(),true);assert.equal(await a.page.locator('#parcelas-cancelar').isDisabled(),true);
    await a.page.evaluate(()=>__qa.resolveRpc());await a.page.locator('#parcelas-conta-modal').waitFor({state:'detached'});
    assert.equal((await writes(a.page)).length,1);await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

test('conta paga permanece protegida inclusive chamada direta do editor',async()=>{
  const a=await abrir();try{
    await a.page.evaluate(pagaId=>{abrirModalConta(pagaId);void desdobrarConta(pagaId);},paga.id);
    assert.equal(await a.page.locator('#modal-conta').isVisible(),false);assert.equal(await a.page.locator('#parcelas-conta-modal').count(),0);
    assert.equal((await writes(a.page)).length,0);await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

test('novo cadastro e NF sem XML continuam com valor e vencimento vazios',async()=>{
  const a=await abrir();try{
    await a.page.evaluate(()=>abrirModalConta());assert.equal(await a.page.locator('#conta-valor').inputValue(),'');
    assert.equal(await a.page.locator('#conta-vencimento').inputValue(),'');assert.equal(await a.page.locator('#conta-desdobrar').isVisible(),false);
    await a.page.locator('#modal-conta').getByRole('button',{name:'Cancelar',exact:true}).click();
    await a.page.evaluate(()=>{void ParcelasConta.abrir({modo:'nota',notaId:'00000000-0000-4000-8000-000000000004',numero:'200/1',fornecedor:'NF SINTETICA',valorTotalNF:100.01});});
    assert.equal(await valor(a.page,1).inputValue(),'');assert.equal(await data(a.page,1).inputValue(),'');
    await a.page.locator('#parcelas-adicionar').click();assert.equal(await valor(a.page,2).inputValue(),'');assert.equal(await data(a.page,2).inputValue(),'');
    await a.page.locator('#parcelas-cancelar').click();assert.equal((await writes(a.page)).length,0);intactos(a);
  }finally{await a.close();}
});

for(const [name,missing] of [['valor ausente',{valor:null}],['vencimento ausente',{data_vencimento:null}]]) {
  test('dados antigos incompletos nao inventam '+name,async()=>{
    const antigo={...original,...missing};const a=await abrir([antigo,paga,outra]);try{
      await parcelas(a.page,antigo);
      if(missing.valor===null)assert.equal(await valor(a.page,1).inputValue(),'');
      if(missing.data_vencimento===null)assert.equal(await data(a.page,1).inputValue(),'');
      await a.page.locator('#parcelas-salvar').click();assert.equal((await writes(a.page)).length,0);
      await a.page.locator('#parcelas-cancelar').click();intactos(a);
    }finally{await a.close();}
  });
}

test('alteracoes nao salvas bloqueiam CTA sem perder campos; cancelar reabre snapshot salvo',async()=>{
  const a=await abrir();try{
    await editar(a.page);await a.page.locator('#conta-valor').fill('1900.01');await a.page.locator('#conta-vencimento').fill('2026-12-12');
    await a.page.locator('#conta-descricao').fill('Descricao nao salva');await a.page.locator('#conta-desdobrar').click();
    assert.equal(await a.page.locator('#parcelas-conta-modal').count(),0);assert.equal(await a.page.locator('#modal-conta').isVisible(),true);
    assert.match(await a.page.locator('#conta-parcelas-aviso').innerText(),/alterações não salvas/i);
    assert.equal(await a.page.locator('#conta-valor').inputValue(),'1900.01');assert.equal(await a.page.locator('#conta-vencimento').inputValue(),'2026-12-12');
    assert.equal(await a.page.locator('#conta-descricao').inputValue(),'Descricao nao salva');
    assert.equal((await writes(a.page)).length,0);assert.deepEqual(await a.page.evaluate(()=>__qa.patches),[]);
    await a.page.locator('#modal-conta').getByRole('button',{name:'Cancelar',exact:true}).click();await parcelas(a.page);
    assert.equal(await valor(a.page,1).inputValue(),'1854.17');assert.equal(await data(a.page,1).inputValue(),original.data_vencimento);
    await a.page.locator('#parcelas-cancelar').click();intactos(a);
  }finally{await a.close();}
});

test('alteracao durante consulta de vinculos tambem impede troca para parcelas',async()=>{
  const a=await abrir();try{
    await editar(a.page);await a.page.evaluate(()=>{__qa.holdConsulta=true;});await a.page.locator('#conta-desdobrar').click();
    await a.page.waitForFunction(()=>typeof __qa.resolveConsulta==='function');await a.page.locator('#conta-descricao').fill('Edicao durante consulta');
    await a.page.evaluate(()=>__qa.resolveConsulta());await a.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
    assert.equal(await a.page.locator('#parcelas-conta-modal').count(),0);assert.equal(await a.page.locator('#modal-conta').isVisible(),true);
    assert.equal(await a.page.locator('#conta-descricao').inputValue(),'Edicao durante consulta');assert.equal((await writes(a.page)).length,0);intactos(a);
  }finally{await a.close();}
});

test('salvar edicao simples depois abrir parcelas usa valor e vencimento novos persistidos',async()=>{
  const a=await abrir();try{
    await editar(a.page);await a.page.locator('#conta-valor').fill('827.51');await a.page.locator('#conta-vencimento').fill('2026-11-05');
    await a.page.locator('#modal-conta').getByRole('button',{name:'Salvar conta',exact:true}).click();await a.page.locator('#modal-conta.active').waitFor({state:'detached'});
    assert.equal(await a.page.evaluate(()=>__qa.patches.length),1);await parcelas(a.page);
    assert.equal(await valor(a.page,1).inputValue(),'827.51');assert.equal(await data(a.page,1).inputValue(),'2026-11-05');
    await a.page.locator('#parcelas-cancelar').click();assert.equal((await writes(a.page)).length,0);await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

test('desdobramento preserva lista, filtros, navegacao Caixa e reload sem nova RPC',async()=>{
  const a=await abrir();try{
    await parcelas(a.page);await duas(a.page);await salvar(a.page);assert.equal((await cache(a.page)).length,4);
    await a.page.locator('#contas-stats').getByRole('button',{name:'Pagas (1)',exact:true}).click();
    assert.match(await a.page.locator('#contas-lista').innerText(),/DANTAS SINTETICO - PAGA/);
    assert.doesNotMatch(await a.page.locator('#contas-lista').innerText(),/OUTRA CONTA SINTETICA/);
    await a.page.locator('#contas-stats input[type="month"]').fill('2026-11');await a.page.locator('#contas-stats input[type="month"]').dispatchEvent('change');
    assert.equal((await cache(a.page)).length,4);await navegar(a.page,'caixa');await navegar(a.page,'contas-pagar');
    assert.equal((await cache(a.page)).length,4);await confirmarPreservacao(a.page);
    await a.page.reload();await navegar(a.page,'contas-pagar');
    assert.equal((await cache(a.page)).length,4);assert.match(await a.page.locator('#contas-lista').innerText(),/OUTRA CONTA SINTETICA/);
    assert.equal((await writes(a.page)).length,0);await confirmarPreservacao(a.page);intactos(a);
  }finally{await a.close();}
});

for(const width of [320,390,1440]) {
  test('padding e CTA visiveis no editor antigo e parcelas em '+width+'px',async()=>{
    const a=await abrir(seed,width,width===1440?1050:844);try{
      await editar(a.page);const cta=a.page.locator('#conta-desdobrar');assert.equal(await cta.isVisible(),true);
      const box=await a.page.locator('#modal-conta .modal-box').boundingBox(),body=await a.page.locator('#modal-conta .modal-body').boundingBox();
      const fornecedor=await a.page.locator('#conta-fornecedor').boundingBox(),button=await cta.boundingBox();
      assert.ok(fornecedor.x-box.x>=15,'Campo deve ter margem lateral interna');
      assert.ok(box.x+box.width-fornecedor.x-fornecedor.width>=15,'Margem direita interna');
      assert.ok(button.y+button.height<=844||width===1440,'CTA deve estar no primeiro quadro');
      assert.ok(button.y<fornecedor.y,'CTA acima dos campos');
      assert.ok(body.width<=box.width&&box.width<=width,'Sem transbordamento horizontal do modal');
      assert.equal(await a.page.locator('#modal-conta').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
      const titleStyle=await a.page.locator('#modal-conta-titulo').evaluate(el=>{const s=getComputedStyle(el);return {padding:s.padding,border:s.borderBottomWidth};});
      assert.equal(titleStyle.padding,'0px');assert.equal(titleStyle.border,'0px');
      await screenshot(a.page,'conta-antiga-'+width);await cta.click();await a.page.locator('#parcelas-conta-modal').waitFor();await duas(a.page);
      const pbox=await a.page.locator('#parcelas-conta-modal .modal-box').boundingBox(),input=await valor(a.page,1).boundingBox();
      assert.ok(input.x-pbox.x>=12,'Editor de parcelas com margem interna');
      assert.ok(pbox.width<=width,'Parcelas dentro do viewport');
      assert.equal(await a.page.locator('#parcelas-conta-modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
      await screenshot(a.page,'parcelas-editadas-'+width);
      await a.page.locator('#parcelas-cancelar').scrollIntoViewIfNeeded();assert.equal(await a.page.locator('#parcelas-cancelar').isVisible(),true);
      await a.page.locator('#parcelas-salvar').click({trial:true});
      for(const seletor of ['#parcelas-cancelar','#parcelas-salvar']) {
        const rodape=await a.page.locator(seletor).boundingBox();
        assert.ok(rodape.y>=0&&rodape.y+rodape.height<=a.page.viewportSize().height,'Acao do rodape acessivel no viewport');
      }
      await screenshot(a.page,'parcelas-editadas-'+width+'-rodape');
      await a.page.locator('#parcelas-cancelar').click();assert.equal((await writes(a.page)).length,0);intactos(a);
    }finally{await a.close();}
  });
}
