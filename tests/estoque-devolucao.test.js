const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fonte = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8') + `
globalThis.__estoqueTeste = { consolidarEstoque, EstoqueModule, abrirHistoricoMaterial };`;

const historicoContent = { innerHTML: '' };
const historicoModal = { querySelector: seletor => seletor === '.modal' ? historicoContent : null };

const contexto = {
  console: { log() {}, warn() {}, error() {} },
  document: { addEventListener() {}, getElementById(id) { return id === 'hist-modal' ? historicoModal : null; }, querySelectorAll() { return []; } },
  window: {}, setTimeout() {}, clearTimeout() {},
  norm: valor => String(valor || '').toUpperCase().trim(),
  esc: valor => String(valor || ''),
  fmt: valor => `R$ ${Number(valor || 0).toFixed(2)}`,
  fmtR: valor => `R$ ${Number(valor || 0).toFixed(2)}`,
  fmtQtd: valor => Number(valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 }),
  showToast() {}, openModal() {},
  parseItens: nota => JSON.parse(nota.itens || '[]'),
  _resolverCategoriaEstoque: valor => valor,
  _categoriaPorEtapas: () => '36_outros',
  COMPANY_DEFAULTS: { estoqueGeral: 'EDR' },
  notas: [], entradasDiretas: [], ajustesEstoque: [], distribuicoes: [], lancamentos: [], catalogoMateriais: [],
};

vm.runInNewContext(fonte, contexto, { filename: 'edr-v2-estoque.js' });
const { consolidarEstoque, EstoqueModule, abrirHistoricoMaterial } = contexto.__estoqueTeste;

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

// NF aplicada direto na obra aparece no histórico, mas não entra nem sai do almoxarifado.
contexto.notas.push({
  id: 'nf-direta', natureza: 'VENDA', obra: 'LUCIVANIA MACENA', data: '2026-08-19',
  itens: JSON.stringify([{ ...itemCompra, qtd: 11.5, qtd_estoque: 11.5, unidade: 'UN', total: 1552.5 }]),
});
contexto.distribuicoes = [{
  id: 'dist-direta', nota_id: 'nf-direta', item_desc: itemCompra.desc,
  codigo_catalogo: itemCompra.codigo, obra_nome: 'LUCIVANIA MACENA',
  qtd: 11.5, valor: 1552.5, etapa: '04_alven', data: '2026-08-19',
}];
consolidado = consolidarEstoque();
assert.equal(consolidado[0].saldo, 1);
abrirHistoricoMaterial(consolidado[0].chave);
assert.match(historicoContent.innerHTML, /Direto na obra → LUCIVANIA MACENA/);
assert.match(historicoContent.innerHTML, /Não passou pelo almoxarifado/);
assert.match(historicoContent.innerHTML, /11,5 UN direto à obra · fora do saldo/);
assert.match(historicoContent.innerHTML, /Saldo no almoxarifado/);
assert.match(historicoContent.innerHTML, /saldo-final-value[^>]*>1 UN</);
assert.match(historicoContent.innerHTML, /hist-qty neutral">11,5 UN</);
assert.doesNotMatch(historicoContent.innerHTML, /R\$ 1\.00 UN/);
assert.doesNotMatch(historicoContent.innerHTML, /Distribuicao → LUCIVANIA/);

console.log('estoque-devolucao: 16 assertions passed');
