const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fonte = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8') + `
globalThis.__estoqueTeste = { consolidarEstoque, EstoqueModule };`;

const contexto = {
  console: { log() {}, warn() {}, error() {} },
  document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  window: {}, setTimeout() {}, clearTimeout() {},
  norm: valor => String(valor || '').toUpperCase().trim(),
  parseItens: nota => JSON.parse(nota.itens || '[]'),
  _resolverCategoriaEstoque: valor => valor,
  _categoriaPorEtapas: () => '36_outros',
  COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
  notas: [], entradasDiretas: [], ajustesEstoque: [], distribuicoes: [], lancamentos: [], catalogoMateriais: [],
};

vm.runInNewContext(fonte, contexto, { filename: 'edr-v2-estoque.js' });
const { consolidarEstoque, EstoqueModule } = contexto.__estoqueTeste;

const itemCompra = { codigo_produto_fiscal: '559', codigo: '000559', desc: 'CAIXA DAGUA FORTLEV 1000L', qtd: 2, qtd_estoque: 2, unidade: 'UN', preco: 396.45, total: 792.90 };
const itemDevolucao = { ...itemCompra, qtd: 1, qtd_estoque: 1, total: 396.45, item_idx_origem: 0 };
contexto.notas = [
  { id: 'compra', natureza: 'VENDA', obra: 'EDR', data: '2026-08-04', itens: JSON.stringify([itemCompra]) },
  { id: 'devolucao', natureza: 'DEVOLUCAO', obra: 'EDR', nota_origem_id: 'compra', data: '2026-08-07', itens: JSON.stringify([itemDevolucao]) },
];

let consolidado = consolidarEstoque();
assert.equal(consolidado.length, 1);
assert.equal(consolidado[0].saldo, 1);
assert.equal(consolidado[0].valorMedio, 396.45);
assert.equal(consolidado[0].valorEstoque, 396.45);
assert.equal(consolidado[0].lotes[0].qtd_disponivel, 1);

// A devolução depois de uma contagem física também precisa reduzir o saldo.
contexto.ajustesEstoque = [{ tipo: 'contagem', item_desc: itemCompra.desc, codigo_catalogo: '000559', qtd: 0, motivo: 'sistema 2, real 2, dif 0', criado_em: '2026-08-05T10:00:00Z' }];
consolidado = consolidarEstoque();
assert.equal(consolidado[0].saldo, 1);
assert.equal(EstoqueModule._consolidado[0].saldo, 1);

console.log('estoque-devolucao: 7 assertions passed');
