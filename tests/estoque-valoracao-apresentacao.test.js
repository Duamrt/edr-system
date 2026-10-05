// Regressões locais de apresentação: código original, DOM e ExcelJS em memória.
// Sem rede, banco, arquivo Excel real ou alterações nas quantidades/custos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const estoqueFonte = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8');
const tabelaFonte = fs.readFileSync(require.resolve('../js/edr-v2-estoque-tabela.js'), 'utf8');
const custosFonte = require('./fixtures/custo-nota.cjs').fonte;
const moeda = v => 'R$ ' + Number(v || 0).toFixed(2);
const texto = html => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const snapshot = ctx => JSON.stringify({
  notas: ctx.notas, distribuicoes: ctx.distribuicoes, entradasDiretas: ctx.entradasDiretas,
  ajustesEstoque: ctx.ajustesEstoque, lancamentos: ctx.lancamentos, catalogoMateriais: ctx.catalogoMateriais,
});

function ambiente() {
  const campos = {}, planilhas = [], avisos = [], erros = [], gravacoes = [];
  const elemento = () => ({
    innerHTML: '', textContent: '', style: {}, dataset: {}, value: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, focus() {}, click() {}, remove() {}, querySelector() { return null; },
  });
  function anexar(el) {
    assert.notEqual(el.tagName, 'script', 'o teste nunca pode carregar dependência da rede');
    if (el.id) campos[el.id] = el;
  }
  const documento = {
    addEventListener() {}, getElementById: id => campos[id] || null, querySelectorAll: () => [],
    createElement(tag) { return { ...elemento(), tagName: tag }; },
    head: { appendChild: anexar }, body: { appendChild: anexar },
  };
  for (const id of ['estoque-lista', 'est-summary-valor', 'est-summary-itens',
    'est-summary-semcodigo', 'est-summary-negativos', 'estoque-loading', 'estoque-empty']) campos[id] = elemento();

  class Planilha {
    constructor(nome) { this.nome = nome; this.linhas = new Map(); this.dados = []; }
    mergeCells() {}
    getRow(numero) {
      if (!this.linhas.has(numero)) {
        const cells = new Map();
        this.linhas.set(numero, {
          values: [], getCell(indice) {
            if (!cells.has(indice)) cells.set(indice, { value: null });
            return cells.get(indice);
          },
        });
      }
      return this.linhas.get(numero);
    }
    getCell(endereco) {
      const [, letras, numero] = String(endereco).match(/^([A-Z]+)(\d+)$/);
      const coluna = [...letras].reduce((n, letra) => n * 26 + letra.charCodeAt(0) - 64, 0);
      return this.getRow(Number(numero)).getCell(coluna);
    }
    addRow(values) {
      const numero = Math.max(0, ...this.linhas.keys()) + 1;
      const row = this.getRow(numero);
      row.values = values;
      values.forEach((v, i) => { row.getCell(i + 1).value = v; });
      this.dados.push(row);
      return row;
    }
  }
  class Workbook {
    constructor() { this.xlsx = { writeBuffer: async () => new Uint8Array() }; }
    addWorksheet(nome) { const ws = new Planilha(nome); planilhas.push(ws); return ws; }
  }
  const ctx = {
    console: { log() {}, warn() {}, error: (...args) => erros.push(args.map(String).join(' ')) },
    document: documento, setTimeout() {}, clearTimeout() {},
    norm: s => String(s || '').toUpperCase().trim(), esc: s => String(s ?? ''),
    fmt: String, fmtR: moeda, fmtQtd: String, fmtData: String,
    parseItens: n => JSON.parse(n.itens || '[]'), hojeISO: () => '2026-10-05',
    confirmar: async () => true, confirm: () => true, showToast: msg => avisos.push(msg),
    closeModal() {}, fecharModal() {}, openModal() {}, renderDashboard() {},
    custoClassificacaoNovo: () => ({}), COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
    usuarioAtual: { id: 'usuario', perfil: 'admin' },
    notas: [], distribuicoes: [], entradasDiretas: [], ajustesEstoque: [], lancamentos: [],
    catalogoMateriais: [{ id: 'material', codigo: '000001', nome: 'MATERIAL', unidade: 'UN',
      categoria: '04_alven', movimenta_estoque: true }],
    obras: [{ id: 'obra', nome: 'OBRA' }],
    ExcelJS: { Workbook }, Blob: class {}, URL: { createObjectURL: () => 'blob:simulado', revokeObjectURL() {} },
    fetch: () => { throw new Error('REDE PROIBIDA NO TESTE'); },
    sbPatch: () => { throw new Error('PATCH PROIBIDO NO TESTE'); },
    sbDelete: () => { throw new Error('DELETE PROIBIDO NO TESTE'); },
    sbRpc: () => { throw new Error('RPC PROIBIDA NO TESTE'); },
    sbPost: async (tabela, payload) => {
      const registro = { id: 'registro-' + gravacoes.length, ...payload };
      gravacoes.push({ tabela, ...registro });
      if (tabela === 'lancamentos') ctx.lancamentos.push(registro);
      else if (tabela === 'distribuicoes') ctx.distribuicoes.push(registro);
      else throw new Error('GRAVACAO SIMULADA INESPERADA: ' + tabela);
      return registro;
    },
  };
  ctx.window = ctx;
  for (const nome of ['Notas', 'Lancamentos', 'Distribuicoes', 'EntradasDiretas', 'AjustesEstoque', 'Materiais'])
    ctx['load' + nome] = async () => true;
  vm.createContext(ctx);
  vm.runInContext(custosFonte + estoqueFonte + '\n' + tabelaFonte +
    '\nglobalThis.api = { EstoqueModule, consolidarEstoque, renderEstoque, exportarEstoqueExcel, confirmarDistribuicaoItem };', ctx);
  ctx.api.EstoqueModule.catalogoMateriais = ctx.catalogoMateriais;
  const nf = (id, qtd, preco, data = '2026-10-01', extra = {}) => ({
    id, numero_nf: id, obra: 'EDR', natureza: 'VENDA', data, ...extra,
    itens: JSON.stringify([{ codigo: '000001', desc: 'MATERIAL', unidade: 'UN', qtd, preco, total: qtd * preco }]),
  });
  async function apresentar() {
    const antes = snapshot(ctx);
    ctx.api.EstoqueModule.viewMode = 'tabela';
    ctx.api.renderEstoque();
    const itens = ctx.api.EstoqueModule._consolidado;
    // Inclui saldo zero nesta chamada direta ao render original da tabela.
    ctx.EstoqueTabela.render(itens, itens);
    const tabela = campos['estoque-lista'].innerHTML;
    const painel = campos['est-summary-valor'].textContent;
    ctx.EstoqueTabela.open(itens[0].chave);
    const drawer = campos['estk-drawer'].innerHTML;
    ctx.api.EstoqueModule.viewMode = 'cards';
    ctx.api.renderEstoque();
    const cards = campos['estoque-lista'].innerHTML;
    await ctx.api.exportarEstoqueExcel();
    assert.deepEqual(erros, [], 'export/render devem concluir sem erro capturado');
    assert.equal(planilhas.length, 1, 'exportação deve gerar a planilha com o mock local');
    assert.ok(avisos.some(v => /exportado com sucesso/i.test(v)), 'exportação deve completar');
    assert.equal(snapshot(ctx), antes, 'apresentação não pode alterar notas, baixas, custos, catálogo ou quantidades');
    return { item: itens[0], tabela, painel, drawer, cards, ws: planilhas[0] };
  }
  return { ctx, api: ctx.api, nf, apresentar, gravacoes, campos };
}

function totalTabela(html) {
  const match = html.match(/class="estk-total[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(match, 'a tabela deve renderizar sua célula de total');
  return texto(match[1]);
}
function totalKpi(html) {
  const match = html.match(/class="estk-kpi k-total[^"]*"[\s\S]*?class="estk-kn">([\s\S]*?)<\/span>/);
  assert.ok(match, 'a tabela deve renderizar seu KPI de valor conhecido');
  return texto(match[1]);
}
function totalDrawer(html) {
  const match = html.match(/class="estk-cell hero"[\s\S]*?class="v">([\s\S]*?)<\/div>/);
  assert.ok(match, 'o detalhe deve renderizar o total real');
  return texto(match[1]);
}
function conferirTotais(r, total, totalPositivo = Math.max(0, total)) {
  assert.equal(r.item.valorEstoque, total);
  assert.equal(Number(totalTabela(r.tabela).replace('R$ ', '')), total);
  assert.equal(totalKpi(r.tabela), moeda(totalPositivo));
  assert.equal(totalDrawer(r.drawer), moeda(total));
  assert.equal(r.painel, moeda(totalPositivo));
  assert.equal(r.ws.dados[0].getCell(7).value, total, 'Excel G deve usar o valor real de estoque');
  assert.equal(r.ws.dados[0].getCell(8).value, r.item.saldo, 'Excel H conserva o saldo');
  assert.match(texto(r.tabela), new RegExp('valor (?:(?:real|conhecido) )?exibido\\s+' + moeda(totalPositivo).replace('$', '\\$')), 'rodapé deve acompanhar o total real');
}

test('FIFO: tabela, KPI, detalhe, cards, painel e Excel conservam compra 300 = consumo 100 + estoque 200', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('A', 10, 10), a.nf('B', 10, 20, '2026-10-02'));
  const inicial = a.api.consolidarEstoque()[0];
  assert.equal(inicial.valorEstoque, 300);
  await a.api.confirmarDistribuicaoItem(inicial.chave, 'obra', '04_alven', 10, '2026-10-05');
  const custoObra = a.ctx.lancamentos.reduce((s, l) => s + l.total, 0);
  assert.equal(custoObra, 100, 'saída original deve consumir o lote antigo');
  const r = await a.apresentar();
  conferirTotais(r, 200);
  assert.equal(r.item.saldo, 10);
  assert.equal(r.item.valorMedio, 15, 'média histórica continua informativa');
  assert.equal(custoObra + r.item.valorEstoque, 300);
  assert.match(r.tabela, /class="estk-vmed"[^>]*>R\$ 15\.00/);
  assert.match(texto(r.drawer), /(?:médio|média).*R\$ 15\.00/i);
  assert.match(texto(r.cards), /Total:\s*R\$ 200\.00/);
  assert.equal(r.ws.dados[0].getCell(6).value, 15, 'Excel F mantém a média histórica');
  assert.match(texto(r.ws.getRow(5).values.join(' ')), /m[eé]di[oa]/i);
  assert.match(String(r.ws.getCell('G5').note || ''), /FIFO|lote/i, 'Excel explica avaliação real');
});

test('custo desconhecido conserva zero real e orienta conferência, sem estimar pela média', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('SEM-PRECO', 10, 0));
  const r = await a.apresentar();
  conferirTotais(r, 0);
  assert.equal(r.item.saldo, 10);
  assert.equal(r.item.valorMedio, 0);
  assert.match(texto(r.tabela), /SEM VALOR/);
  assert.match(texto(r.drawer), /(?:não registrou preço|sem (?:preço|custo)|desconhecido)/i);
  assert.equal(r.ws.dados[0].getCell(6).value, 0);
});

test('referência manual fica identificada como estimativa e fora dos totais reais', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('SEM-PRECO', 10, 0));
  Object.assign(a.ctx.catalogoMateriais[0], { valor_referencia_manual: 7, valor_ref_fonte: 'manual' });
  const r = await a.apresentar();
  conferirTotais(r, 0);
  assert.equal(r.item.valorMedio, 0, 'referência manual não altera o custo histórico');
  assert.match(texto(r.tabela), /estim/i);
  assert.match(texto(r.tabela), /R\$ 70\.00/);
  assert.match(texto(r.drawer), /estim/i);
  assert.match(texto(r.drawer), /R\$ 70\.00/);
  assert.equal(r.ws.dados[0].getCell(6).value, 0);
  assert.match(String(r.ws.dados[0].getCell(7).note || ''), /estim/i);
  assert.match(String(r.ws.dados[0].getCell(7).note || ''), /70(?:[,.]00)?/);
});

test('referência manual nunca substitui custo real conhecido', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('A', 10, 10));
  Object.assign(a.ctx.catalogoMateriais[0], { valor_referencia_manual: 999, valor_ref_fonte: 'manual' });
  const r = await a.apresentar();
  conferirTotais(r, 100);
  assert.equal(r.item.valorMedio, 10);
  assert.equal(r.ws.dados[0].getCell(6).value, 10);
  assert.doesNotMatch(totalTabela(r.tabela), /999/);
});

test('saldo zero não conserva valor dos lotes já consumidos e preserva a média histórica', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('A', 10, 10), a.nf('B', 10, 20, '2026-10-02'));
  for (let i = 0; i < 2; i++) {
    const item = a.api.consolidarEstoque()[0];
    await a.api.confirmarDistribuicaoItem(item.chave, 'obra', '04_alven', 10, '2026-10-05');
  }
  assert.equal(a.ctx.lancamentos.reduce((s, l) => s + l.total, 0), 300);
  const r = await a.apresentar();
  conferirTotais(r, 0);
  assert.equal(r.item.saldo, 0);
  assert.equal(r.item.valorMedio, 15);
  assert.match(texto(r.tabela), /ZERADO/);
  assert.equal(r.ws.dados[0].getCell(6).value, 15);
});

test('saldo negativo mantém sinal no item e Excel e fica fora do valor positivo do painel/KPI', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('A', 10, 10));
  a.ctx.lancamentos.push({ id: 'lc', obra_id: 'obra', qtd: 12, total: 120 });
  a.ctx.distribuicoes.push({ id: 'saida', lancamento_id: 'lc', codigo_catalogo: '000001',
    item_desc: 'MATERIAL', obra_id: 'obra', qtd: 12, data: '2026-10-03' });
  const r = await a.apresentar();
  conferirTotais(r, -20);
  assert.equal(r.item.saldo, -2);
  assert.match(texto(r.tabela), /NEGATIVO/);
});

test('Excel conserva valorização dos itens órfãos que não estão no catálogo', async () => {
  const a = ambiente();
  a.ctx.catalogoMateriais.length = 0;
  const nf = a.nf('ORFA', 10, 10);
  const itens = JSON.parse(nf.itens);
  delete itens[0].codigo;
  nf.itens = JSON.stringify(itens);
  a.ctx.notas.push(nf);
  const r = await a.apresentar();
  conferirTotais(r, 100);
  assert.equal(r.item.codigo, null);
  assert.equal(r.ws.dados[0].getCell(2).value, '');
  assert.equal(r.ws.dados[0].getCell(6).value, 10);
});



test('valor real zero com média histórica positiva não recai no saldo vezes média', async () => {
  const a = ambiente();
  a.ctx.notas.push(a.nf('COM-PRECO', 10, 10), a.nf('SEM-PRECO', 10, 0, '2026-10-02'));
  const inicial = a.api.consolidarEstoque()[0];
  await a.api.confirmarDistribuicaoItem(inicial.chave, 'obra', '04_alven', 10, '2026-10-05');
  const r = await a.apresentar();
  conferirTotais(r, 0);
  assert.equal(r.item.saldo, 10);
  assert.equal(r.item.valorMedio, 5);
  assert.equal(r.ws.dados[0].getCell(6).value, 5);
  assert.match(r.tabela, /class="estk-vmed"[^>]*>R\$ 5\.00/);
});
