// Auditoria somente local: codigo real, persistencia e DOM simulados.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const repo = path.resolve(__dirname, '../..');

function ambiente() {
  const campos = {}, avisos = [], erros = [], gravacoes = [];
  const ctx = {
    console: { log() {}, warn() {}, error: (...a) => erros.push(a.map(String).join(' ')) },
    _companyId: 'empresa', usuarioAtual: {id:'usuario'}, crypto: require('node:crypto').webcrypto,
    localStorage: new (class { constructor(){this.dados=new Map()} getItem(k){return this.dados.get(k)||null} setItem(k,v){this.dados.set(k,v)} removeItem(k){this.dados.delete(k)} })(),
    window: {}, document: { addEventListener() {}, getElementById: id => campos[id] || null, querySelectorAll: () => [] },
    setTimeout() {}, clearTimeout() {}, norm: s => String(s || '').toUpperCase().trim(), esc: String,
    fmt: String, fmtR: String, fmtQtd: String, fmtData: String, parseItens: n => JSON.parse(n.itens || '[]'),
    confirmar: async () => true, confirm: () => true, hojeISO: () => '2026-09-08',
    showToast: m => avisos.push(m), closeModal() {}, fecharModal() {}, openModal() {},
    custoClassificacaoNovo: () => ({}), COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
    notas: [], distribuicoes: [], entradasDiretas: [], ajustesEstoque: [], lancamentos: [], obrasArquivadas: [],
    catalogoMateriais: [{ codigo: '000001', nome: 'MATERIAL', unidade: 'UN', categoria: '04_alven', movimenta_estoque: true }],
    obras: [{ id: 'obra', nome: 'OBRA' }], ImportModule: {},
    sbPost: async (tabela, payload) => {
      if (ctx.falhaPost === tabela) return null;
      const registro = { id: 'id-' + gravacoes.length, ...payload };
      gravacoes.push({ tabela, ...registro });
      return registro;
    },
    sbDelete: async tabela => ctx.falhaDelete === tabela ? 0 : 1,
    renderDashboard() {}, filtrarLanc() {}
  };
  ctx.loadDistribuicoes=async()=>{ctx.distribuicoes=[...new Map([...ctx.distribuicoes,...gravacoes.filter(g=>g.tabela==='distribuicoes')].map(g=>[g.id,g])).values()];return true;};
  ctx.loadLancamentos=async()=>{ctx.lancamentos=[...new Map([...ctx.lancamentos,...gravacoes.filter(g=>g.tabela==='lancamentos')].map(g=>[g.id,g])).values()];return true;};
  vm.createContext(ctx);
  const arquivo = modulo => path.join(repo, 'js/edr-v2-' + modulo + '.js');
  vm.runInContext(fs.readFileSync(arquivo('utils-extras'), 'utf8'),ctx);
  vm.runInContext(fs.readFileSync(arquivo('estoque'), 'utf8') + '\nrenderEstoque=()=>{}; globalThis.api={consolidarEstoque,confirmarDistribuicaoItem,salvarSaidaMaterial,salvarEntradaDireta,EstoqueModule};', ctx);
  ctx.api.EstoqueModule.catalogoMateriais = ctx.catalogoMateriais;
  vm.runInContext(fs.readFileSync(arquivo('notas'), 'utf8') + '\nresetForm=()=>{};renderNotas=()=>{};_notasShowLista=()=>{};autocadastrarMateriais=async()=>({novos:[],falhas:0});', ctx);
  const nf = (id, qtd, preco, extra={}) => ({ id, obra: 'EDR', natureza: 'VENDA', data: '2026-09-01', ...extra, itens: JSON.stringify([{ codigo:'000001',desc:'MATERIAL',unidade:'UN',qtd,preco,total:qtd*preco }]) });
  function preencher(valores) { for (const [id,value] of Object.entries(valores)) campos[id] = { value, focus() {} }; }
  async function salvarNF({destino='EDR',desconto=0,frete=0,outras=0}={}) {
    const total = 400-desconto+frete+outras;
    ctx.ImportModule._xmlCtx = {chaveAcesso:'0'.repeat(20)+'55'+'0'.repeat(22),fornecedorCnpj:'12345678000100',numero:'123',qtdItens:1,vNF:total,desconto};
    const ok = await ctx.salvarNota({numero:'123',fornecedor:'FORNECEDOR',emissao:'2026-09-01',recebimento:'2026-09-01',cnpj:'12345678000100',obra:destino,natureza:'VENDA',frete,outras,itens:JSON.parse(nf('x',10,40).itens)});
    return ok;
  }
  async function saida(modo='distribuir',qtd=3) {
    const item=ctx.api.consolidarEstoque().find(i=>i.codigo==='000001');
    if(modo==='distribuir') await ctx.api.confirmarDistribuicaoItem(item.chave,'obra','04_alven',qtd,'2026-09-08');
    else {
      preencher({'saida-desc':'MATERIAL','saida-qtd':String(qtd),'saida-unidade':'UN','saida-data':'2026-09-08','saida-obra':'obra','saida-etapa':'04_alven','saida-obs':''});
      await ctx.api.salvarSaidaMaterial();
    }
    assert.ok(gravacoes.some(g=>g.tabela==='distribuicoes'),JSON.stringify({avisos,erros}));
  }
  function entradaCampos(destino='EDR') {
    preencher({'entrada-desc':'MATERIAL','entrada-qtd':'10','entrada-unidade':'UN','entrada-preco':'40','entrada-fornecedor':'FORNECEDOR','entrada-data':'2026-09-01','entrada-obs':'','entrada-obra-id':destino==='EDR'?'':'obra','entrada-etapa':'04_alven'});
    campos['btn-destino-estoque']={dataset:{ativo:destino==='EDR'?'1':'0'}};
  }
  const saldo=()=>ctx.api.consolidarEstoque().find(i=>i.codigo==='000001')?.saldo||0;
  const custo=()=>gravacoes.filter(g=>g.tabela==='lancamentos').reduce((s,g)=>s+g.total,0);
  return {ctx,gravacoes,avisos,erros,nf,salvarNF,saida,entradaCampos,saldo,custo,campos};
}
module.exports={ambiente};
