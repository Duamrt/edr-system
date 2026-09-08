const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const stock = require('./fixtures/custo-nota.cjs').fonte + fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8');
const infra = fs.readFileSync(require.resolve('../js/edr-v2-infra.js'), 'utf8');
const hoje = '2026-09-08', agora = hoje + 'T15:00:00.123456Z';
const plain = x => JSON.parse(JSON.stringify(x));
function ambiente(storage = new Map()) {
  const avisos = [], pedidos = [], campos = {}, confirmacoes = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} }, window: {}, crypto: webcrypto,
    document: { addEventListener() {}, getElementById: id => campos[id] || null, querySelectorAll: () => [] },
    setTimeout() {}, clearTimeout() {}, norm: s => String(s || '').toUpperCase().trim(),
    esc: s => String(s || '').replace(/</g, '&lt;'), fmt: String, fmtR: String, fmtQtd: String,
    parseItens: n => JSON.parse(n.itens || '[]'), hojeISO: () => hoje,
    confirmar: async msg => { confirmacoes.push(msg); return true; }, confirm: () => true,
    showToast: msg => avisos.push(msg), closeModal() {}, fecharModal() {}, openModal() {},
    custoClassificacaoNovo: () => ({}), COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
    _companyId: 'empresa', usuarioAtual: { id: 'usuario' },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    estoqueModoAtomico: () => true,
    estoqueContratoAtual: () => ({ contrato: 2, habilitado: true, company_id: 'empresa', hoje, agora }),
    notas: [], distribuicoes: [], entradasDiretas: [], ajustesEstoque: [], lancamentos: [],
    catalogoMateriais: [{ id: 'material', codigo: '000001', nome: 'MATERIAL', unidade: 'UN', movimenta_estoque: true }],
    obras: [{ id: 'obra', nome: 'OBRA' }],
    sbPost: async () => { throw Error('ESCRITA LEGADA INDEVIDA'); },
    sbRpcEstoque: async (fn, p) => {
      pedidos.push({ fn, p: plain(p) });
      return { ok: true, dados: { operacao_id: p.p_operacao_id, status: 'registrada', distribuicao_id: 'dist', lancamento_id: 'custo', sem_origem: p.p_sem_origem_confirmada } };
    },
  };
  for (const nome of ['Notas', 'Lancamentos', 'Distribuicoes', 'EntradasDiretas', 'AjustesEstoque', 'Materiais']) ctx['load' + nome] = async () => true;
  vm.createContext(ctx);
  vm.runInContext(stock + '\nrenderEstoque = () => {}; globalThis.api = { consolidarEstoque, confirmarDistribuicaoItem, salvarSaidaMaterial, _rotuloOrigensEstoque, EstoqueModule };', ctx);
  ctx.api.EstoqueModule.catalogoMateriais = ctx.catalogoMateriais;
  const nf = (id, qtd, preco, data = '2026-09-01', criado_em) => ctx.notas.push({ id, numero_nf: id, obra: 'EDR', data, criado_em, itens: JSON.stringify([{ codigo: '000001', desc: 'MATERIAL', qtd, preco, total: qtd * preco }]) });
  const distribuir = qtd => ctx.api.confirmarDistribuicaoItem(ctx.api.consolidarEstoque()[0].chave, 'obra', '04_alven', qtd, hoje);
  const manual = qtd => {
    for (const [id, value] of Object.entries({ 'saida-desc': 'MATERIAL', 'saida-qtd': String(qtd), 'saida-unidade': 'UN', 'saida-data': hoje, 'saida-obra': 'obra', 'saida-etapa': '04_alven' })) campos[id] = { value };
    return ctx.api.salvarSaidaMaterial();
  };
  return { ctx, api: ctx.api, nf, distribuir, manual, avisos, pedidos, storage, campos, confirmacoes };
}
test('UI: os dois botoes usam uma RPC por saida e aceitam duas NFs', async () => {
  const a = ambiente(); a.nf('A', 5, 10); a.nf('B', 5, 20);
  await a.distribuir(7); await a.manual(7);
  assert.equal(a.pedidos.length, 2);
  assert.deepEqual(a.pedidos.map(p => p.p.p_criterio), ['fifo', 'fifo']);
  assert.ok(a.pedidos.every(p => p.fn === 'registrar_saida_estoque_atomica' && p.p.p_efetivo_em === agora));
  assert.equal(a.storage.size, 0);
});
test('UI: saldo insuficiente exige confirmacao e envia somente o deficit consentido', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  a.ctx.confirmar = async () => false; await a.distribuir(8);
  assert.equal(a.pedidos.length, 0); assert.equal(a.storage.size, 0);
  a.ctx.confirmar = async msg => { assert.match(msg, /Quantidade sem origem para conferência: 3 UN/); return true; };
  await a.distribuir(8);
  assert.equal(a.pedidos[0].p.p_sem_origem_confirmada, 3);
  assert.match(a.avisos.at(-1), /3 sem origem/);
});
test('UI: perda da resposta persiste pedido e recarga repete o mesmo UUID e payload', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  let original;
  a.ctx.sbRpcEstoque = async (fn, p) => { original = plain(p); return { ok: false, incerto: true, mensagem: 'Conexão interrompida' }; };
  await a.distribuir(3); assert.equal(a.storage.size, 1);
  const b = ambiente(a.storage); b.nf('A', 5, 10);
  await b.distribuir(3);
  assert.deepEqual(b.pedidos[0].p, original); assert.equal(b.storage.size, 0);
});
test('UI: outro pedido primeiro confere a pendencia, sem criar uma segunda saida', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  a.ctx.sbRpcEstoque = async () => ({ ok: false, incerto: true }); await a.distribuir(3);
  const original = JSON.parse([...a.storage.values()][0]).params;
  const b = ambiente(a.storage); b.nf('A', 5, 10); await b.distribuir(4);
  assert.equal(b.pedidos.length, 1); assert.deepEqual(b.pedidos[0].p, original);
  assert.match(b.confirmacoes[0], /Há uma saída sem confirmação/);
});
test('UI: falha definitiva inicial libera pedido; erro posterior a resposta perdida conserva UUID', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  a.ctx.sbRpcEstoque = async () => ({ ok: false, incerto: false, mensagem: 'saldo alterado' });
  await a.distribuir(3); assert.equal(a.storage.size, 0);
  a.ctx.sbRpcEstoque = async () => ({ ok: false, incerto: true }); await a.distribuir(3);
  const snapshot = [...a.storage.values()][0];
  a.ctx.sbRpcEstoque = async () => ({ ok: false, incerto: false }); await a.distribuir(3);
  assert.equal([...a.storage.values()][0], snapshot);
});
test('UI: modo desativado com pedido incerto bloqueia fallback legado', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  a.ctx.sbRpcEstoque = async () => ({ ok: false, incerto: true }); await a.distribuir(3);
  a.ctx.estoqueModoAtomico = () => false; a.ctx.estoqueContratoAtual = () => ({ contrato: 2, habilitado: false });
  await a.distribuir(3); assert.equal(a.storage.size, 1);
  assert.match(a.avisos.at(-1), /indisponível/);
});
test('UI: troca de empresa durante carga impede envio e durante envio preserva pendencia', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  a.ctx.loadMateriais = async () => { a.ctx._companyId = 'outra'; return true; };
  await a.distribuir(3); assert.equal(a.pedidos.length, 0);
  const b = ambiente(); b.nf('A', 5, 10);
  b.ctx.sbRpcEstoque = async (fn, p) => {
    b.ctx._companyId = 'outra';
    return { ok: true, dados: { operacao_id: p.p_operacao_id, status: 'registrada', distribuicao_id: 'dist', lancamento_id: 'custo' } };
  };
  await b.distribuir(3); assert.equal(b.storage.size, 1);
  assert.match(b.avisos.at(-1), /empresa de origem/);
});
test('UI: duplo clique trava os dois botoes durante envio', async () => {
  const a = ambiente(); a.nf('A', 5, 10);
  await Promise.all([a.distribuir(3), a.manual(3)]);
  assert.equal(a.pedidos.length, 1);
});
test('UI: falha de recarga apos gravacao informa saida confirmada e dados desatualizados', async () => {
  const a = ambiente(); a.nf('A', 5, 10); let cargas = 0;
  a.ctx.loadNotas = async () => ++cargas === 1;
  await a.distribuir(3); assert.equal(a.storage.size, 0);
  assert.match(a.avisos.at(-1), /Saída registrada.*atualização dos dados falhou/);
});
test('UI: historico consome origem fixada, em vez de redistribuir FIFO', () => {
  const a = ambiente(); a.nf('A', 5, 10); a.nf('B', 5, 20);
  a.ctx.distribuicoes.push({ id: 'd', codigo_catalogo: '000001', item_desc: 'MATERIAL', qtd: 3, data: hoje,
    estoque_efetivo_em: agora, origens: [{ tipo: 'nf', nota_id: 'B', item_idx: 0, qtd: 3 }] });
  const r = a.api.consolidarEstoque()[0];
  assert.equal(r.lotes.find(l => l.nota_id === 'A').qtd_disponivel, 5);
  assert.equal(r.lotes.find(l => l.nota_id === 'B').qtd_disponivel, 2);
  assert.equal(r.origensInconsistentes, false);
  assert.match(a.api._rotuloOrigensEstoque(a.ctx.distribuicoes[0].origens), /NF B \/ item 1: 3/);
});
test('UI: entrada posterior cobre deficit sem inventar NF na saida antiga', () => {
  const a = ambiente(); a.nf('A', 5, 10);
  const origens = [{ tipo: 'nf', nota_id: 'A', item_idx: 0, qtd: 5 }, { tipo: 'sem_origem', qtd: 3 }];
  a.ctx.distribuicoes.push({ id: 'd', codigo_catalogo: '000001', item_desc: 'MATERIAL', qtd: 8, data: hoje, estoque_efetivo_em: agora, origens });
  a.nf('NOVA', 5, 20, hoje, hoje + 'T16:00:00Z');
  const r = a.api.consolidarEstoque()[0];
  assert.equal(r.saldo, 2); assert.equal(r.lotes.find(l => l.nota_id === 'NOVA').qtd_disponivel, 2);
  assert.equal(origens[1].nota_id, undefined);
  assert.match(a.api._rotuloOrigensEstoque(origens), /Sem origem — conferir: 3/);
});
test('UI: origem inexistente fica sinalizada sem vincular a outra NF', () => {
  const a = ambiente(); a.nf('A', 5, 10);
  a.ctx.distribuicoes.push({ id: 'd', codigo_catalogo: '000001', item_desc: 'MATERIAL', qtd: 2, data: hoje,
    origens: [{ tipo: 'nf', nota_id: 'INEXISTENTE', item_idx: 0, qtd: 2 }] });
  assert.equal(a.api.consolidarEstoque()[0].origensInconsistentes, true);
});

test('UI: material sem custo orienta saida manual e exige preco positivo antes do envio', async () => {
  const a=ambiente(); a.nf('A',1,0); await a.distribuir(3);
  assert.equal(a.pedidos.length,0); assert.match(a.avisos.at(-1),/Use Saída manual/);
  await a.manual(1); assert.equal(a.pedidos.length,0); assert.match(a.avisos.at(-1),/custo unitário/);
  a.campos['saida-preco-manual']={value:'7.50'}; await a.manual(1);
  assert.equal(a.pedidos[0].p.p_preco_manual,7.5);
});
test('ponte: quantidade ou referencia invalida nas parcelas bloqueia estoque', async () => {
  const a=ponte(), get=a.ctx.sbGetAll;
  for(const invalida of [{tipo:'sem_origem',qtd:-3},{tipo:'sem_origem',qtd:'NaN'},{tipo:'nf',qtd:3,nota_id:'nf',item_idx:null}]) {
    a.ctx.sbGetAll=async t=>t==='estoque_saida_origens' ? [{company_id:'empresa',distribuicao_id:'d',...invalida}] : get(t);
    assert.equal(await a.api.loadDistribuicoes(),false);
  }
});
test('UI: resposta sem identificadores nao apaga pedido pendente', async () => {
  const a=ambiente();a.nf('A',5,10);
  a.ctx.sbRpcEstoque=async()=>({ok:true,dados:{status:'registrada'}});
  await a.distribuir(3);assert.equal(a.storage.size,1);assert.match(a.avisos.at(-1),/Resposta incompleta/);
});


test('ponte/UI: deadlock confirmado libera nova tentativa com recarga, sem prender pedido incerto', async () => {
  const a=ambiente(), b=ponte(), envios=[]; a.nf('A',5,10);
  b.ctx.fetch=async (url,opts)=>{
    const p=JSON.parse(opts.body);envios.push(p);
    if(envios.length===1)return {ok:false,status:500,json:async()=>({code:'40P01',message:'deadlock detected'})};
    return {ok:true,status:200,json:async()=>({operacao_id:p.p_operacao_id,status:'registrada',distribuicao_id:'d',lancamento_id:'l'})};
  };
  a.ctx.sbRpcEstoque=b.api.sbRpcEstoque;await a.distribuir(3);
  assert.equal(a.storage.size,0,'SQLSTATE 40P01 confirma rollback; primeira tentativa nao pode ficar presa');
  a.ctx.estoqueContratoAtual=()=>({contrato:2,habilitado:true,company_id:'empresa',hoje,agora:hoje+'T15:00:01Z'});
  await a.distribuir(3);assert.equal(a.storage.size,0);assert.notEqual(envios[0].p_operacao_id,envios[1].p_operacao_id);
  assert.notEqual(envios[0].p_efetivo_em,envios[1].p_efetivo_em);
});

function ponte() {
  const ctx = { console: { log() {}, warn() {} }, document: { currentScript: null, addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(infra + `\n_companyId='empresa'; globalThis.api={ loadDistribuicoes, estoqueModoAtomico, estoqueContratoAtual, sbRpcEstoque,
    dados:()=>distribuicoes, empresa:v=>{_companyId=v}, pendentes:estoqueCargasPendentes };`, ctx);
  const status = { contrato: 2, habilitado: true, company_id: 'empresa', hoje, agora };
  ctx.fetch = async () => ({ ok: true, json: async () => status });
  ctx.sbGetAll = async tabela => tabela === 'distribuicoes'
    ? [{ id: 'd', company_id: 'empresa', estoque_efetivo_em: agora, qtd: 3 }]
    : [{ id: 'o', company_id: 'empresa', distribuicao_id: 'd', tipo: 'sem_origem', qtd: 3 }];
  return { ctx, api: ctx.api, status };
}
test('ponte: modo ativo carrega parcelas e falha parcial preserva cache bloqueado', async () => {
  const a = ponte(); assert.equal(await a.api.loadDistribuicoes(), true);
  assert.equal(a.api.estoqueModoAtomico(), true); assert.equal(a.api.dados()[0].origens.length, 1);
  const snapshot = plain(a.api.dados()), get = a.ctx.sbGetAll;
  a.ctx.sbGetAll = async t => t === 'estoque_saida_origens' ? [] : get(t);
  assert.equal(await a.api.loadDistribuicoes(), false); assert.deepEqual(plain(a.api.dados()), snapshot);
  assert.equal(a.api.estoqueContratoAtual(), null);
});
test('ponte: apenas PGRST202 com 404 reconhece contrato ausente', async () => {
  const a = ponte(); a.ctx.sbGetAll = async () => [{ id: 'legada', qtd: 1 }];
  for (const [status, code, esperado] of [[404, 'PGRST202', true], [404, 'OUTRO', false], [500, 'PGRST202', false]]) {
    a.ctx.fetch = async () => ({ ok: false, status, json: async () => ({ code }) });
    assert.equal(await a.api.loadDistribuicoes(), esperado);
    assert.equal(a.api.estoqueModoAtomico(), false);
  }
});
test('ponte: modo desativado ainda carrega origens historicas', async () => {
  const a = ponte(); a.status.habilitado = false;
  assert.equal(await a.api.loadDistribuicoes(), true); assert.equal(a.api.estoqueModoAtomico(), false);
  assert.equal(a.api.dados()[0].origens.length, 1);
});
test('ponte: origem de outra empresa e troca de empresa durante carga bloqueiam resultado', async () => {
  const a = ponte(), get = a.ctx.sbGetAll;
  a.ctx.sbGetAll = async t => (await get(t)).map(o => ({ ...o, company_id: 'outra' }));
  assert.equal(await a.api.loadDistribuicoes(), false);
  a.ctx.sbGetAll = async t => { a.api.empresa('outra'); return get(t); };
  assert.equal(await a.api.loadDistribuicoes(), false); assert.equal(a.api.dados().length, 0);
});
test('ponte: rede, JSON ausente e erro de servidor conservam incerteza de gravacao', async () => {
  const a = ponte();
  for (const fetch of [async () => { throw Error('rede'); }, async () => ({ ok: true, json: async () => null }), async () => ({ ok: false, status: 400, json: async () => null }),
    async () => ({ ok: false, status: 503, json: async () => ({ message: 'indisponivel' }) })]) {
    a.ctx.fetch = fetch; const r = await a.api.sbRpcEstoque('registrar_saida_estoque_atomica', {});
    assert.equal(r.ok, false); assert.equal(r.incerto, true);
  }
});
test('devolucao: origens multiplas e deficit pendente bloqueiam devolucao; linhas repetidas somam', () => {
  const D = require('../js/edr-v2-devolucao.js');
  const origem = { id: 'nf', obra: 'EDR', cnpj: '123', itens: [{ codigo: '000001', desc: 'MATERIAL', qtd: 5, preco: 10, total: 50 }] };
  const args = { origem, notas: [], cnpjFornecedor: '123', itensDevolucao: [{ codigo: '000001', qtd: 3, preco: 10, total: 30 }] };
  assert.equal(D.validar({ ...args, distribuicoes: [{ qtd: 1, nota_id: null, origens: [{ tipo: 'nf', nota_id: 'nf' }] }] }).ok, false);
  assert.match(D.validar({ ...args, distribuicoes: [{ codigo_catalogo: '000001', item_desc: 'MATERIAL', qtd: 2, origens: [{ tipo: 'sem_origem', qtd: 2 }] }] }).erros.join(), /sem origem/);
  assert.equal(D.validar({ ...args, distribuicoes: [], itensDevolucao: [...args.itensDevolucao, ...args.itensDevolucao] }).ok, false);
  assert.equal(D.validar({ ...args, distribuicoes: [] }).ok, true);
});

async function conferencia(storage=new Map()) {
  const a=ambiente(storage),content={innerHTML:''};
  a.ctx.usuarioAtual.perfil='admin';
  a.ctx.estoqueContratoAtual=()=>({contrato:2,habilitado:true,regularizacao:1,company_id:'empresa',hoje,agora});
  a.ctx.sbGetAll=async()=>[];
  a.campos['hist-modal']={querySelector:()=>content};
  a.nf('NF123',5,20);
  a.ctx.distribuicoes=[{id:'d',data:hoje,estoque_efetivo_em:agora,obra_nome:'OBRA',qtd:3,valor:30,
    origens:[{id:'pend',tipo:'sem_origem',material_id:'material',company_id:'empresa',qtd:3,custo:30}]}];
  a.ctx.sbRpcEstoque=async(fn,p)=>{
    a.pedidos.push({fn,p:plain(p)});
    return {ok:true,dados:fn==='propor_regularizacao_estoque'?{revisao:'revisao1',company_id:'empresa',pendencia_id:p.p_pendencia_id,
      qtd:p.p_qtd,unidade:'UN',saldo_antes:2,saldo_depois:2,pendencia_restante:3-p.p_qtd,custo_mantido:p.p_qtd*10,custo_referencia:p.p_qtd*20,diferenca_referencia:p.p_qtd*10}:
      {status:'regularizada',operacao_id:p.p_operacao_id,company_id:'empresa',pendencia_id:p.p_pendencia_id}};
  };
  for(const [id,value] of Object.entries({'reg-qtd':'3','reg-busca':'','reg-evidencia':'Canhoto NF 123 anterior a saida','reg-motivo':'Conferido com responsavel pelo recebimento'}))a.campos[id]={value};
  for(const id of ['reg-fontes','reg-proposta','reg-selecionada'])a.campos[id]={innerHTML:'',textContent:''};
  a.campos['reg-custo']={checked:true};a.campos['reg-aplicar']={disabled:false};
  await a.ctx.abrirConferenciaEstoque('material');
  const preparar=async()=>{a.ctx.selecionarPendenciaEstoque(0);a.ctx.selecionarOrigemRegularizacao(0);await a.ctx.proporRegularizacaoEstoque();};
  return {...a,content,preparar};
}
test('REG UI: fila, proposta e aceite precedem a unica gravacao',async()=>{
 const a=await conferencia();assert.match(a.content.innerHTML,/3 UN sem origem/);assert.equal(a.pedidos.length,0);
 await a.preparar();assert.deepEqual(a.pedidos.map(p=>p.fn),['propor_regularizacao_estoque']);
 assert.match(a.campos['reg-proposta'].innerHTML,/Custo já lançado/);
 a.campos['reg-custo'].checked=false;await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.length,1);
 a.campos['reg-custo'].checked=true;await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.length,2);
 assert.equal(a.pedidos[1].p.p_tratamento_custo,'manter_custo_registrado');assert.equal(a.storage.size,0);
});
test('REG UI: perda da resposta e recarga recuperam exatamente a mesma operacao',async()=>{
 const a=await conferencia();await a.preparar();let original;
 a.ctx.sbRpcEstoque=async(fn,p)=>{original=plain(p);return{ok:false,incerto:true}};
 await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.storage.size,1);
 const b=await conferencia(a.storage);assert.match(b.content.innerHTML,/Conferir resultado anterior/);
 await b.ctx.recuperarRegularizacaoEstoque();assert.deepEqual(b.pedidos[0].p,original);assert.equal(b.storage.size,0);
});
test('REG UI: erro inicial definitivo libera proposta; erro apos incerteza preserva pedido',async()=>{
 const a=await conferencia();await a.preparar();const rpc=a.ctx.sbRpcEstoque;
 a.ctx.sbRpcEstoque=async()=>({ok:false,incerto:false,mensagem:'historico alterado'});
 await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.storage.size,0);assert.equal(a.campos['reg-proposta'].innerHTML,'');
 a.ctx.sbRpcEstoque=rpc;await a.preparar();a.ctx.sbRpcEstoque=async()=>({ok:false,incerto:true});await a.ctx.aplicarRegularizacaoEstoque();
 const valor=[...a.storage.values()][0];a.ctx.sbRpcEstoque=async()=>({ok:false,incerto:false});await a.ctx.recuperarRegularizacaoEstoque();assert.equal([...a.storage.values()][0],valor);
});
test('REG UI: duplo clique nao duplica e falha de recarga nao vira falha da gravacao',async()=>{
 const a=await conferencia();await a.preparar();a.ctx.loadDistribuicoes=async()=>false;
 await Promise.all([a.ctx.aplicarRegularizacaoEstoque(),a.ctx.aplicarRegularizacaoEstoque()]);
 assert.equal(a.pedidos.filter(p=>p.fn==='regularizar_origem_estoque').length,1);assert.equal(a.storage.size,0);
 assert.match(a.avisos.at(-1),/confirmada.*atualização dos dados falhou/);
});
test('REG UI: troca de empresa impede envio e conserva resultado incerto',async()=>{
 const a=await conferencia();await a.preparar();a.ctx._companyId='outra';await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.length,1);
 const b=await conferencia();await b.preparar();b.ctx.sbRpcEstoque=async(fn,p)=>{b.ctx._companyId='outra';return{ok:true,dados:{status:'regularizada',operacao_id:p.p_operacao_id,company_id:'empresa',pendencia_id:'pend'}}};
 await b.ctx.aplicarRegularizacaoEstoque();assert.equal(b.storage.size,1);assert.match(b.avisos.at(-1),/empresa de origem/);
});
test('REG UI: quantidade alterada invalida proposta e rejeita resposta tardia',async()=>{
 const a=await conferencia();await a.preparar();a.campos['reg-qtd'].value='2';a.ctx.invalidarPropostaEstoque();await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.length,1);
 const rpc=a.ctx.sbRpcEstoque;a.ctx.sbRpcEstoque=async(fn,p)=>{a.campos['reg-qtd'].value='1';return rpc(fn,p)};
 await a.ctx.proporRegularizacaoEstoque();await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.filter(p=>p.fn==='regularizar_origem_estoque').length,0);
});
test('REG UI: sem comprovante e justificativa nao envia; falha de armazenamento nao envia',async()=>{
 const a=await conferencia();await a.preparar();a.campos['reg-evidencia'].value='';await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.length,1);
 a.campos['reg-evidencia'].value='Comprovante valido';a.ctx.localStorage.setItem=()=>{throw Error('armazenamento indisponivel')};await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.pedidos.length,1);
});
test('REG UI: carga parcial, perfil e contrato indisponivel bloqueiam tela',async()=>{
 const a=await conferencia();a.ctx.loadNotas=async()=>false;await a.ctx.abrirConferenciaEstoque('material');assert.match(a.content.innerHTML,/não carregaram por completo/);
 a.ctx.loadNotas=async()=>true;a.ctx.estoqueContratoAtual=()=>({contrato:2});await a.ctx.abrirConferenciaEstoque('material');assert.match(a.content.innerHTML,/indisponível neste ambiente/);
 a.ctx.usuarioAtual.perfil='operacional';await a.ctx.abrirConferenciaEstoque('material');assert.match(a.avisos.at(-1),/administrador/);
});
test('REG UI: resposta de outra empresa fica pendente e evidencia e escapada na tela',async()=>{
 const a=await conferencia();await a.preparar();a.ctx.sbRpcEstoque=async(fn,p)=>({ok:true,dados:{status:'regularizada',operacao_id:p.p_operacao_id,company_id:'outra',pendencia_id:'pend'}});
 await a.ctx.aplicarRegularizacaoEstoque();assert.equal(a.storage.size,1);
 const b=await conferencia();b.ctx.sbGetAll=async()=>[{company_id:'empresa',material_id:'material',proposta:{qtd:1,custo_mantido:10,diferenca_referencia:2},pedido:{tipo:'nf',evidencia:'<script>alert(1)</script>',justificativa:'conferida'},ator:'ADMIN',criado_em:'2026-09-08'}];
 await b.ctx.abrirConferenciaEstoque('material');assert.ok(!b.content.innerHTML.includes('<script>'));assert.match(b.content.innerHTML,/&lt;script>/);
});
