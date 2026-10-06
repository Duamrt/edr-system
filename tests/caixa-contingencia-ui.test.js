'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {prepararCopia}=require('./fixtures/caixa-contingencia.cjs');
const raiz=path.resolve(__dirname,'..');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const empresa=id(1),banco=id(2),dinheiro=id(3),cp=id(4);
const original=fs.readFileSync(path.join(raiz,'js/edr-v2-caixa-prospectivo.js'),'utf8').replace(/\r\n/g,'\n');
const copia=prepararCopia();
test('contingência: patch verificável/reversível modifica só cópia e conserva frontend normal',()=>{
  new vm.Script(copia.source);
  assert.match(copia.source,/Contingência: consultas preservadas/);
  assert.equal(fs.readFileSync(path.join(raiz,'js/edr-v2-caixa-prospectivo.js'),'utf8').replace(/\r\n/g,'\n'),original);
  const reversao=prepararCopia();execFileSync('git',['apply','-R',reversao.patchLocal],{cwd:reversao.tmp,windowsHide:true,stdio:'pipe'});
  assert.equal(fs.readFileSync(reversao.file,'utf8').replace(/\r\n/g,'\n'),original);
});

function estado(){
  return{company_id:empresa,contas:[
    {id:banco,codigo:'banco',nome:'Banco QA',abertura_centavos:100000,corte_em:'2001-06-05T21:23:00Z',fuso:'America/Sao_Paulo',saldo_centavos:82500},
    {id:dinheiro,codigo:'dinheiro',nome:'Dinheiro QA',abertura_centavos:20000,corte_em:'2001-06-05T21:23:00Z',fuso:'America/Sao_Paulo',saldo_centavos:25000}],
    total_centavos:107500,pagamentos:[{conta_pagar_id:cp,pago_centavos:15000,restante_centavos:25000}],movimentos:[
      {id:id(11),operacao_id:id(21),tipo:'pagamento',conta_id:banco,conta_pagar_id:cp,valor_centavos:15000,data_efetiva:'2001-06-06',hora_efetiva:'14:00',descricao:'Pagamento parcial QA',cancelado_em:null,afeta_saldo:true},
      {id:id(12),operacao_id:id(22),tipo:'entrada',conta_id:banco,valor_centavos:2500,data_efetiva:'2001-06-06',hora_efetiva:'15:00',descricao:'Entrada QA',cancelado_em:null,afeta_saldo:true},
      {id:id(13),operacao_id:id(23),tipo:'transferencia',conta_id:banco,destino_id:dinheiro,valor_centavos:5000,data_efetiva:'2001-06-06',hora_efetiva:'16:00',descricao:'Transferência QA',cancelado_em:null,afeta_saldo:true},
      {id:id(14),operacao_id:id(24),tipo:'saida',conta_id:banco,valor_centavos:1000,data_efetiva:'2001-06-06',hora_efetiva:null,descricao:'Saída cancelada QA',cancelado_em:'2001-06-07T15:00:00Z',afeta_saldo:false,motivo_cancelamento:'Correção QA'}]};
}
const conta={id:cp,company_id:empresa,fornecedor:'Fornecedor QA',descricao:'Obrigação QA',valor:400,status:'pendente',data_vencimento:'2001-06-01',tipo:'despesa'};
if(!process.env.EDR_PLAYWRIGHT_PATH){
  test('contingência Chromium',{skip:'Defina EDR_PLAYWRIGHT_PATH; navegador não executado.'},()=>{});
}else{
  const {chromium}=require(process.env.EDR_PLAYWRIGHT_PATH);let browser;
  test.before(async()=>{browser=await chromium.launch({headless:true,...(process.env.EDR_CHROMIUM_PATH?{executablePath:process.env.EDR_CHROMIUM_PATH}:{})});console.log('CONTINGENCIA Chromium '+browser.version());});
  test.after(async()=>{if(browser)await browser.close()});
  const style=fs.readFileSync(path.join(raiz,'index.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
  const financeiro=fs.readFileSync(path.join(raiz,'js/edr-v2-financeiro.js'),'utf8');
  const alertas=fs.readFileSync(path.join(raiz,'js/edr-v2-alertas.js'),'utf8');
  const alertHelpers=['_alertCaixa','_alertContasPagar'].map(nome=>{
    const m=alertas.match(new RegExp('async function '+nome+'\\([\\s\\S]*?\\n\\}'));if(!m)throw Error('Helper real ausente: '+nome);return m[0];
  }).join('\n');
  async function ambiente(t,state=estado(),contas=[conta],pendente=null){
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});t.after(()=>context.close());
    const page=await context.newPage(),url='http://127.0.0.1:43201/caixa-contingencia-sintetica';let externo=0;
    const campos=['conta-id','conta-fornecedor','conta-descricao','conta-valor','conta-vencimento','conta-obra','conta-nota-ref'];
    const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>'+style+'</style><body><main id="caixa-content" style="max-width:1040px;margin:32px auto;padding:0 20px;"></main><div id="contas-stats"></div><div id="contas-lista"></div><section hidden>'+campos.map(k=>'<input id="'+k+'">').join('')+'</section></body></html>';
    await page.route('**/*',r=>{if(r.request().url()===url)return r.fulfill({status:200,contentType:'text/html',body:html});externo++;return r.abort()});await page.goto(url);
    await page.evaluate(({state,contas,empresa,pendente})=>{
      window._companyId=empresa;window.usuarioAtual={id:empresa,perfil:'admin',role:'admin'};
      window.__state=state;window.__contas=contas;window.__rpc=[];window.__legacy=[];window.__avisos=[];window.__falha=false;
      window.hojeISO=()=>'2001-06-09';window.fmtData=x=>x||'';window.fmt=window.fmtR=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
      window.esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.showToast=s=>window.__avisos.push(s);window.confirm=()=>true;window.confirmar=async()=>true;window.openModal=()=>{};window.fecharModal=()=>{};
      window.obras=[];window.lancamentos=[{total:99999,data:'2001-06-01',etapa:'28_mao'}];window.adicionaisPgtos=[];
      window.sbGet=async()=>JSON.parse(JSON.stringify(window.__contas));
      for(const fn of ['sbPost','sbPostMinimal','sbPatch','sbDelete'])window[fn]=async(...args)=>{window.__legacy.push({fn,args});return null;};
      window.sbRpcEstoque=async(fn,params={})=>{window.__rpc.push({fn,params});if(fn==='caixa_estado')return window.__falha?{ok:false,mensagem:'Falha QA leitura'}:{ok:true,dados:JSON.parse(JSON.stringify(window.__state))};return{ok:true,dados:{company_id:empresa,operacao_id:params.p_operacao}};};
      window.fetch=async()=>{throw Error('Rede externa proibida no ensaio')};
      if(pendente)sessionStorage.setItem('edr-caixa-pedido:'+empresa,JSON.stringify(pendente));
    },{state,contas,empresa,pendente});
    await page.addScriptTag({content:financeiro});await page.evaluate(()=>{contasPagar=window.__contas;});
    await page.addScriptTag({content:copia.source});await page.addScriptTag({content:alertHelpers});
    await page.evaluate(()=>caixaProspectivoRender(document.getElementById('caixa-content')));
    return{page,externo:()=>externo};
  }
  async function zeroEscritas(page){
    const r=await page.evaluate(()=>({rpc:window.__rpc.filter(x=>x.fn!=='caixa_estado'),legado:window.__legacy}));
    assert.deepEqual(r,{rpc:[],legado:[]});
  }
  test('contingência Chromium: leitura/auditoria e restante preservados; botões e chamadas de mutação recusados',async t=>{
    const a=await ambiente(t),p=a.page;
    assert.match(await p.locator('#caixa-content').innerText(),/TOTAL DISPONÍVEL.*1\.075,00/s);
    assert.match(await p.locator('#caixa-content').innerText(),/Obrigações a pagar.*250,00/s);
    assert.match(await p.locator('#caixa-content').innerText(),/Pagamento parcial QA/);assert.match(await p.locator('#caixa-content').innerText(),/Cancelado/);
    assert.equal(await p.locator('#cp-contingencia-aviso').count(),1);
    const botoes=await p.locator('#caixa-content button[onclick]').evaluateAll(xs=>xs.filter(x=>/^caixaProspectivo/.test(x.getAttribute('onclick'))).map(x=>x.disabled));
    assert.ok(botoes.length>=5);assert.ok(botoes.every(Boolean));
    await p.evaluate(async ids=>{for(const tipo of ['entrada','saida','transferencia','pagamento','abertura'])await caixaProspectivoAbrir(tipo,ids.cp);await caixaProspectivoSalvar();await caixaProspectivoCancelarMovimento(ids.m);await marcarComoPago(ids.cp);},{cp,m:id(11)});
    assert.equal(await p.locator('#cp-modal').count(),0);await zeroEscritas(p);assert.equal(a.externo(),0);
    if(process.env.EDR_UI_EVIDENCE_DIR){const dir=path.resolve(process.env.EDR_UI_EVIDENCE_DIR);fs.mkdirSync(dir,{recursive:true});await p.screenshot({path:path.join(dir,'caixa-contingencia-desktop.png'),fullPage:true});await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(dir,'caixa-contingencia-mobile.png'),fullPage:true});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  });
  test('contingência Chromium: edição/exclusão vinculadas continuam bloqueadas e alertas usam parcial confirmado',async t=>{
    const a=await ambiente(t),p=a.page;
    await p.evaluate(async cp=>{document.getElementById('conta-id').value=cp;document.getElementById('conta-fornecedor').value='Outro QA';document.getElementById('conta-descricao').value='Editar QA';document.getElementById('conta-valor').value='500';document.getElementById('conta-vencimento').value='2001-06-10';abrirModalConta(cp);await salvarConta();await excluirConta(cp);},cp);
    await zeroEscritas(p);assert.match((await p.evaluate(()=>window.__avisos)).join(' '),/vinculada/);
    const alerts=await p.evaluate(async()=>{const a=[];await _alertCaixa(a,'2001-06-09');await _alertContasPagar(a,'2001-06-09','2001-06-16');return a;});
    assert.equal(alerts.length,1);assert.match(alerts[0].msg,/250,00/);assert.doesNotMatch(alerts[0].msg,/400,00/);assert.equal(a.externo(),0);
  });
  test('contingência Chromium: pedido incerto mantém UUID/journal sem reenvio durante pausa',async t=>{
    const journal={company_id:empresa,operacao:id(99),pedido:{action:'movimento',tipo:'entrada',conta_id:banco,valor_centavos:1000,data_efetiva:'2001-06-08',descricao:'Pedido QA incerto'},cancelamento:false};
    const a=await ambiente(t,estado(),[conta],journal),p=a.page;
    const antes=await p.evaluate(()=>sessionStorage.getItem('edr-caixa-pedido:'+_companyId));
    assert.equal(await p.getByRole('button',{name:'Conferir pedido pendente'}).isDisabled(),true);
    await p.evaluate(async()=>{await caixaProspectivoConferirPendente();await caixaProspectivoConferirPendente();await caixaProspectivoSalvar();});
    assert.equal(await p.evaluate(()=>sessionStorage.getItem('edr-caixa-pedido:'+_companyId)),antes);await zeroEscritas(p);assert.equal(a.externo(),0);
  });
  test('contingência Chromium: falha de leitura não recupera saldo legado; sem abertura não permite declarar',async t=>{
    const a=await ambiente(t),p=a.page;await p.evaluate(async()=>{window.__falha=true;await caixaProspectivoRender(document.getElementById('caixa-content'));});
    assert.match(await p.locator('#caixa-content').innerText(),/consultar o saldo persistido/);assert.doesNotMatch(await p.locator('#caixa-content').innerText(),/TOTAL DISPONÍVEL/);
    const alerts=await p.evaluate(async()=>{const a=[];await _alertCaixa(a,'2001-06-09');await _alertContasPagar(a,'2001-06-09','2001-06-16');return a;});assert.deepEqual(alerts,[]);await zeroEscritas(p);
    const vazio={company_id:empresa,contas:[],movimentos:[],pagamentos:[],total_centavos:0};const b=await ambiente(t,vazio,[]);
    assert.equal(await b.page.getByRole('button',{name:'Declarar abertura'}).isDisabled(),true);await b.page.evaluate(()=>caixaProspectivoAbrir('abertura'));await zeroEscritas(b.page);
    assert.equal(a.externo(),0);assert.equal(b.externo(),0);
  });
}
