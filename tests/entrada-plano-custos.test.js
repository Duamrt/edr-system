'use strict';
// Regressão local: código real de Custos/projeções, fixtures sintéticas e nenhuma rede/banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const repo = path.resolve(__dirname, '..');
const company = 'qa-empresa-custos', obraId = 'qa-obra-custos';
const sourceFile = name => fs.readFileSync(path.join(repo, 'js', name), 'utf8');
function approved(overrides = {}) {
  return { company_id: company, planos: [{ obra_id: obraId, plano_id: obraId, stage: 'confirmed', revisao: 2,
    original_centavos: 10000, total_centavos: 11000, cancelado_centavos: 500,
    unlinked_centavos: 0, saldo_centavos: 7667, pendencia_conciliacao: false,
    parcelas: [{ id: 'qa-parcela-custos', label: 'Parcela QA', due: null, method: '', remaining: 7667 }], ...overrides }] };
}
function setup({resumo = approved(), venda = 1000, reps = [{id:'recibo', obra_id:obraId, tipo:'entrada', valor:33.33}],
  custo = [{obra_id:obraId,total:800}], adds = {qtd:0,valorTotal:0,totalRecebido:0}} = {}) {
  const nodes = new Map();
  for (const id of ['custos-resumo','custos-contrato-card','custos-cards-grid','custos-cards-overview',
    'custos-detalhe-view','custos-detalhes','custos-historico-mensal']) nodes.set(id, {innerHTML:'',style:{}});
  const printed = {html:'',count:0};
  const obra = {id:obraId,company_id:company,nome:'Casa QA',cidade:'QA',valor_venda:venda,contrato_entrada:100,contrato_valor:900};
  const ctx = {console,Intl,Number,BigInt,Date,Set,Object,Array,Math,Map,Promise,setTimeout,clearTimeout,
    document:{getElementById:id=>nodes.get(id)||null},
    window:{open:()=>({document:{write:html=>printed.html=html,close(){}},print:()=>printed.count++})},
    obras:[obra], obrasArquivadas:[], lancamentos:structuredClone(custo), repassesCef:structuredClone(reps),
    usuarioAtual:{id:'qa-admin',perfil:'admin'}, _companyId:company, _supabaseToken:'JWT_SINTETICO_SEM_REDE',
    norm:v=>String(v||'').toLowerCase(),esc:v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),
    fmtR:v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
    fmtData:v=>v||'—', aplicarPerfil:()=>{}, getAdicionaisObra:()=>structuredClone(adds),
    sbGet:async()=>structuredClone(reps), sbRpcEstoque:async()=>({ok:true,dados:structuredClone(resumo)})};
  vm.createContext(ctx);
  vm.runInContext(sourceFile('edr-v2-entrada-plano-projecoes.js'),ctx);
  vm.runInContext(sourceFile('edr-v2-entrada-cliente.js'),ctx);
  vm.runInContext(sourceFile('edr-v2-custos.js') + '\nglobalThis.__custos = CustosModule;',ctx);
  ctx.__custos.repassesCef = structuredClone(reps);
  ctx.EntradaPlanoProjecoes.publicar(resumo,{company_id:company,ator_id:'qa-admin',perfil:'admin'});
  return {ctx,nodes,printed,obra,render:()=>ctx._custosRenderResumoFinanceiro(obraId),
    cards:()=>ctx._custosRenderCards(),report:()=>ctx.custosGerarRelatorio(obraId)};
}
function metric(html,label) {
  const marker = '>' + label + '</div><div class="custos-resumo-value';
  const index = html.indexOf(marker); assert.ok(index >= 0,'Métrica existente: '+label);
  return html.slice(index + marker.length).replace(/^[^>]*>/,'').split('</div>')[0];
}
function value(a,label) {return metric(a.nodes.get('custos-resumo').innerHTML,label).replace(/\u00a0/g,' ');}
const currency = v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}).replace(/\u00a0/g,' ');
test('sem plano após resumo vazio confirmado conserva a venda original vigente',()=>{
  const a=setup({resumo:{company_id:company,planos:[]}});a.render();
  assert.equal(value(a,'SALDO A RECEBER'),currency(966.67));
  assert.equal(value(a,'LUCRO ESTIMADO'),currency(200));
  assert.equal(value(a,'MARGEM'),'20.0%');
  assert.doesNotMatch(a.nodes.get('custos-resumo').innerHTML,/AJUSTE LÍQUIDO/);
});
test('original100/acordo115/cancelado5 usa final110; mostra ajuste10 e não cancela duas vezes',()=>{
  const a=setup(),before=structuredClone(a.obra);a.render();
  assert.equal(value(a,'VALOR ORIGINAL DO IMÓVEL'),currency(1000));
  assert.equal(value(a,'AJUSTE LÍQUIDO DA ENTRADA'),currency(10));
  assert.equal(value(a,'CARTEIRA ATUAL'),currency(1010));
  assert.equal(value(a,'SALDO A RECEBER'),currency(976.67));
  assert.equal(value(a,'LUCRO ESTIMADO'),currency(210));
  assert.equal(value(a,'MARGEM'),'20.8%');
  assert.match(a.nodes.get('custos-resumo').innerHTML,/Entrada original: R\$\s*100,00 · Entrada atual: R\$\s*110,00/);
  assert.equal(value(a,'TOTAL RECEBIDO'),currency(33.33));assert.deepEqual(a.obra,before);
  a.ctx._custosRenderContratoCard(obraId);
  assert.match(a.nodes.get('custos-contrato-card').innerHTML,/CONTRATO CEF ORIGINAL/);
  assert.match(a.nodes.get('custos-contrato-card').innerHTML,/R\$\s*900,00/);
});
test('desconto aprovado diminui carteira sem alterar recebimento ou custo',()=>{
  const a=setup({resumo:approved({total_centavos:8000,cancelado_centavos:0,saldo_centavos:4667,
    parcelas:[{id:'p',label:'QA',due:null,method:'',remaining:4667}]})});a.render();
  assert.equal(value(a,'AJUSTE LÍQUIDO DA ENTRADA'),currency(-20));
  assert.equal(value(a,'CARTEIRA ATUAL'),currency(980));assert.equal(value(a,'LUCRO ESTIMADO'),currency(180));
  assert.equal(value(a,'TOTAL RECEBIDO'),currency(33.33));assert.equal(value(a,'CUSTO TOTAL'),currency(800));
});
test('fonte falha/inválida/outrotenant nunca converte carteira, saldo ou lucro em original ou zero',()=>{
  for (const resumo of [null,{company_id:'outro',planos:[]},approved({stage:'pending'})]) {
    const a=setup({resumo});a.render();
    for(const label of ['CARTEIRA ATUAL','SALDO A RECEBER','LUCRO ESTIMADO','MARGEM'])assert.equal(value(a,label),'Indisponível');
    assert.equal(value(a,'TOTAL RECEBIDO'),currency(33.33));assert.equal(value(a,'CUSTO TOTAL'),currency(800));
    a.cards();assert.match(a.nodes.get('custos-cards-grid').innerHTML,/margem indisponível/);
    assert.doesNotMatch(a.nodes.get('custos-cards-grid').innerHTML,/lucro ≥ 0 em todas|Nenhuma no prejuízo/);
    a.report();assert.match(a.printed.html,/Valores derivados indisponíveis/);
    assert.match(a.printed.html,/<td>Saldo a receber<\/td><td class="right">Indisponível/);
  }
});
test('adicional aprovado e repasses reais, inclusive estorno, somam uma vez em centavos',()=>{
  const reps=[{id:'pls',obra_id:obraId,tipo:'pls',valor:100},{id:'ent',obra_id:obraId,tipo:'entrada',valor:30},
    {id:'estorno',obra_id:obraId,tipo:'entrada',valor:-5.25},{id:'ter',obra_id:obraId,tipo:'terreno',valor:200}];
  const a=setup({reps,custo:[{obra_id:obraId,total:800.09}],adds:{qtd:1,valorTotal:50.11,totalRecebido:5.05}});
  a.render();
  assert.equal(value(a,'TOTAL RECEBIDO'),currency(329.8));
  assert.equal(value(a,'SALDO A RECEBER'),currency(730.31));
  assert.equal(value(a,'LUCRO ESTIMADO'),currency(260.02));
  assert.equal(value(a,'MARGEM'),'24.5%');
  const f=a.ctx._custosFinanceiroDerivado(a.obra,reps,a.ctx.lancamentos,a.ctx.getAdicionaisObra());
  assert.equal(f.receita,1060.11);assert.equal(f.recebido,324.75);assert.equal(f.recebidoGeral,329.8);
  a.ctx.repassesCef=[];a.render();assert.equal(value(a,'TOTAL RECEBIDO'),currency(329.8),'fallback não acrescenta o segundo pool');
  a.report();assert.match(a.printed.html,/<td>Receita total prevista<\/td><td class="right">R\$\s*1\.060,11/);
  assert.match(a.printed.html,/<td>Saldo a receber<\/td><td class="right">R\$\s*730,31/);
  assert.match(a.printed.html,/<td><strong>Lucro Estimado<\/strong><\/td><td class="right total">R\$\s*260,02/);
});
test('panorama agrega mesma carteira e adicionais; mantém contratoCEF histórico e recebido real',()=>{
  const a=setup({reps:[{obra_id:obraId,tipo:'entrada',valor:100}],adds:{qtd:1,valorTotal:50.11,totalRecebido:5.05}});
  a.ctx.obras.push({id:'segunda',company_id:company,nome:'Casa B',valor_venda:2000,contrato_entrada:100,contrato_valor:1800});
  a.ctx.__custos.repassesCef.push({obra_id:'segunda',tipo:'pls',valor:500});
  a.ctx.lancamentos.push({obra_id:'segunda',total:1000});
  a.ctx.getAdicionaisObra=id=>id===obraId?{qtd:1,valorTotal:50.11,totalRecebido:5.05}:{qtd:0,valorTotal:0,totalRecebido:0};
  a.cards();const html=a.nodes.get('custos-cards-grid').innerHTML;
  assert.match(html,/Carteira atual: R\$\s*1\.010,00/);
  assert.match(html,/Entrada original: R\$\s*100,00 · Ajuste líquido: R\$\s*10,00 · Entrada atual: R\$\s*110,00/);
  assert.match(html,/R\$\s*1\.260,11/);assert.match(html,/margem 41\.2%/);
  assert.match(html,/R\$\s*605,05/);assert.match(html,/R\$\s*2\.700,00/);
});
test('centavos evitam deriva decimal em custo e relatório inclui obra selecionada mesmo sem repasses',()=>{
  const a=setup({reps:[],custo:[{obra_id:obraId,total:0.1},{obra_id:obraId,total:0.2}]});a.render();a.report();
  assert.equal(value(a,'CUSTO TOTAL'),currency(0.3));assert.equal(value(a,'LUCRO ESTIMADO'),currency(1009.7));
  assert.match(a.printed.html,/Casa QA/);assert.match(a.printed.html,/Carteira atual/);assert.equal(a.printed.count,1);
});
test('recarga do detalhe chama render existente e mantém o resumo aprovado',async()=>{
  const a=setup();a.ctx.__custos.view='detalhe';a.ctx.__custos.obraAtual=obraId;
  await a.ctx.renderCustosView();assert.equal(value(a,'CARTEIRA ATUAL'),currency(1010));
  assert.equal(a.ctx.__custos.view,'detalhe');
});
test('id/perfil no mesmo objeto e tenant/token alterados durante leitura impedem render antigo',async()=>{
  for(const change of [
    a=>{a.ctx.usuarioAtual.id='outra-pessoa';},
    a=>{a.ctx.usuarioAtual.perfil='operacional';},
    a=>{a.ctx._companyId='outra-empresa';},
    a=>{a.ctx._supabaseToken='OUTRA_SESSAO_SINTETICA';}
  ]) {
    const a=setup();let release,reads=0;
    a.ctx.sbRpcEstoque=()=>new Promise(resolve=>{release=()=>resolve({ok:true,dados:approved()});});
    a.ctx.sbGet=async()=>{reads++;return[];};
    a.nodes.get('custos-resumo').innerHTML='SENTINELA_SEM_RENDER';
    const pending=a.ctx.custosAbrirDetalhe(obraId);change(a);release();await pending;
    assert.equal(a.nodes.get('custos-resumo').innerHTML,'SENTINELA_SEM_RENDER');assert.equal(reads,0);
    if (a.ctx.usuarioAtual.id !== 'qa-admin' || a.ctx.usuarioAtual.perfil !== 'admin' || a.ctx._companyId !== company) assert.equal(a.ctx.EntradaPlanoProjecoes.atual(),null);
  }
});
test('troca de tenant enquanto repasses carregam não publica registros do tenant anterior',async()=>{
  const a=setup();let release;
  a.ctx.sbGet=()=>new Promise(resolve=>{release=()=>resolve([{id:'registro-anterior',obra_id:obraId,tipo:'entrada',valor:999}]);});
  const pending=a.ctx._custosCarregarRepasses();a.ctx._companyId='nova-empresa';release();assert.equal(await pending,false);
  assert.equal(a.ctx.__custos.repassesCef.some(r=>r.id==='registro-anterior'),false);
});
test('troca no mesmo objeto durante render do panorama e chamada de detalhe mais nova vencem a espera antiga',async()=>{
  const a=setup();let release; a.ctx.sbRpcEstoque=()=>new Promise(resolve=>{release=()=>resolve({ok:true,dados:approved()});});
  const first=a.ctx.renderCustosView();a.ctx.usuarioAtual.perfil='operacional';release();await first;
  assert.equal(a.nodes.get('custos-cards-grid').innerHTML,'');
  const b=setup();let finish;b.ctx.sbRpcEstoque=()=>new Promise(resolve=>{finish=()=>resolve({ok:true,dados:approved()});});
  const older=b.ctx.custosAbrirDetalhe('obra-antiga'),latest=b.ctx.custosAbrirDetalhe(obraId);
  finish();await Promise.all([older,latest]);assert.equal(b.ctx.__custos.obraAtual,obraId);
  assert.equal(value(b,'CARTEIRA ATUAL'),currency(1010));
});


test('repasses REST rejeitados ficam desconhecidos no resumo/panorama/relatório; não recebem dono confirmado',async()=>{
  const a=setup();let read=0;
  a.ctx.sbGet=async(table,query,options)=>{read++;assert.equal(table,'repasses_cef');assert.equal(options.throwOnError,true);throw Error('FALHA_QA_SEM_REDE');};
  await a.ctx.custosAbrirDetalhe(obraId);
  assert.equal(read,1);assert.equal(a.ctx.__custos._repassesDono,null);
  assert.equal(a.ctx.__custos._repassesFonte.status,'indisponivel');
  assert.equal(value(a,'TOTAL RECEBIDO'),'Indisponível');assert.equal(value(a,'SALDO A RECEBER'),'Indisponível');
  assert.equal(value(a,'CARTEIRA ATUAL'),currency(1010));assert.equal(value(a,'LUCRO ESTIMADO'),currency(210));
  assert.match(a.nodes.get('custos-resumo').innerHTML,/Recebimentos indisponíveis/);
  assert.doesNotMatch(a.nodes.get('custos-contrato-card').innerHTML,/R\$\s*0,00|0% recebido/);
  assert.match(a.nodes.get('custos-contrato-card').innerHTML,/CONTRATO CEF ORIGINAL/);
  a.cards();assert.match(a.nodes.get('custos-cards-grid').innerHTML,/Recebimentos indisponíveis/);
  a.report();assert.match(a.printed.html,/Total geral: <strong class="total">Indisponível/);
  assert.match(a.printed.html,/<td>Total recebido<\/td><td class="right">Indisponível/);
  assert.match(a.printed.html,/<td>Saldo a receber<\/td><td class="right">Indisponível/);
});
test('repasses [] confirmados significam recebido0, mesmo se pool global anterior tiver dados',async()=>{
  const a=setup();a.ctx.sbGet=async(table,query,options)=>{assert.equal(options.throwOnError,true);return [];};
  await a.ctx.custosAbrirDetalhe(obraId);
  assert.equal(a.ctx.__custos._repassesFonte.status,'confirmada');assert.equal(a.ctx.__custos._repassesDono.empresa,company);
  assert.equal(value(a,'TOTAL RECEBIDO'),currency(0));assert.equal(value(a,'SALDO A RECEBER'),currency(1010));
  assert.doesNotMatch(a.nodes.get('custos-resumo').innerHTML,/Recebimentos indisponíveis/);
});
test('resposta não-array não é vazio confirmado e retorno antigo nunca sobrescreve leitura mais nova',async()=>{
  const a=setup();a.ctx.sbGet=async()=>null;assert.equal(await a.ctx._custosCarregarRepasses(),false);
  a.render();assert.equal(value(a,'TOTAL RECEBIDO'),'Indisponível');
  const b=setup();let release,reads=0;
  b.ctx.sbGet=()=>{reads++;if(reads===1)return new Promise(resolve=>{release=()=>resolve([{id:'anterior',obra_id:obraId,valor:999,tipo:'entrada'}]);});return Promise.resolve([]);};
  const old=b.ctx._custosCarregarRepasses();b.ctx.usuarioAtual.id='outro-admin';
  assert.equal(await b.ctx._custosCarregarRepasses(),true);release();assert.equal(await old,false);
  assert.equal(b.ctx.__custos.repassesCef.length,0);assert.equal(b.ctx.__custos._repassesDono.ator,'outro-admin');
  assert.equal(b.ctx.__custos._repassesFonte.status,'confirmada');
});
