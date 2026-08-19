const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fonte = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8') + `
globalThis.__estoqueZeragemTeste = { consolidarEstoque, abrirHistoricoMaterial, _alvoAbsolutoAjuste };`;

const historicoContent = { innerHTML: '' };
const contexto = {
  console: { log() {}, warn() {}, error() {} },
  document: {
    addEventListener() {},
    getElementById(id) {
      return id === 'hist-modal' ? { querySelector: seletor => seletor === '.modal' ? historicoContent : null } : null;
    },
    querySelectorAll() { return []; },
  },
  window: {}, setTimeout() {}, clearTimeout() {},
  norm: valor => String(valor || '').toUpperCase().trim(),
  esc: valor => String(valor || ''),
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
const { consolidarEstoque, abrirHistoricoMaterial, _alvoAbsolutoAjuste } = contexto.__estoqueZeragemTeste;

assert.equal(_alvoAbsolutoAjuste({ tipo: 'ajuste', motivo: 'Zeragem manual 02/06/2026', qtd: 12.95 }), 0);
assert.equal(_alvoAbsolutoAjuste({ tipo: 'correcao', motivo: 'Ajuste comum', qtd: 12.95 }), null);
assert.equal(_alvoAbsolutoAjuste({ tipo: 'contagem', motivo: 'sistema 19,64, real 0, dif -19,64' }), 0);

contexto.catalogoMateriais.push({ codigo: '000108', nome: 'BRITA 19', unidade: 'M3', categoria: '04_alven' });
contexto.notas.push(
  { id: 'nf-22463', numero_nf: '22463', fornecedor: 'BRITAR', natureza: 'VENDA', obra: 'EDR', data: '2026-03-21', itens: JSON.stringify([{ codigo: '000108', desc: 'BRITA 19', qtd: 14.57, unidade: 'M3', preco: 130.01 }]) },
  { id: 'nf-22759', numero_nf: '22759/1', fornecedor: 'BRITAR', natureza: 'VENDA', obra: 'EDR', data: '2026-05-14', itens: JSON.stringify([{ codigo: '000108', desc: 'BRITA 19', qtd: 19.64, unidade: 'M3', preco: 103.57 }]) },
  { id: 'nf-mireli', numero_nf: 'DIRETA', fornecedor: 'BRITAR', natureza: 'VENDA', obra: 'MIRELI', data: '2026-06-29', itens: JSON.stringify([{ codigo: '000108', desc: 'BRITA 19', qtd: 12, unidade: 'M3', preco: 135 }]) },
);
contexto.distribuicoes.push(
  { item_desc: 'BRITA 19', codigo_catalogo: '000108', obra_nome: 'DUAM', qtd: 14.57, data: '2026-03-23' },
  { item_desc: 'BRITA 19', codigo_catalogo: '000108', obra_nome: 'DUAM', qtd: 10.95, data: '2026-05-25' },
  { item_desc: 'BRITA 19', codigo_catalogo: '000108', obra_nome: 'PEDRO', qtd: 2, data: '2026-02-20' },
  { nota_id: 'nf-mireli', item_desc: 'BRITA 19', codigo_catalogo: '000108', obra_nome: 'MIRELI', qtd: 12, data: '2026-06-29' },
);
contexto.ajustesEstoque.push({
  tipo: 'ajuste', item_desc: 'BRITA 19', codigo_catalogo: '000108', unidade: 'M3', qtd: 12.95,
  motivo: 'Zeragem manual 02/06/2026', criado_em: '2026-06-02T12:00:00Z',
});

const consolidado = consolidarEstoque();
assert.equal(consolidado.length, 1);
assert.equal(consolidado[0].entradas, 34.21);
assert.equal(consolidado[0].saidas, 27.52);
assert.equal(consolidado[0].ajustes, 0);
assert.equal(consolidado[0].saldo, 0);

abrirHistoricoMaterial(consolidado[0].chave);
assert.match(historicoContent.innerHTML, /Zeragem — saldo definido em 0/);
assert.match(historicoContent.innerHTML, /Saldo definido em 0 M³ · 2026-06-02/);
assert.match(historicoContent.innerHTML, /saldo-final-value[^>]*>0 M³</);
assert.doesNotMatch(historicoContent.innerHTML, /\+12,95 M³ ajuste/);
assert.match(historicoContent.innerHTML, /Direto na obra → MIRELI/);

const fonteValidacao = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8');
assert.match(fonteValidacao, /ajusteTipoAtual === 'correcao' && qtd === 0/);
assert.doesNotMatch(fonteValidacao, /ajusteTipoAtual !== 'inventario' && qtd === 0/);

console.log('estoque-zeragem: 14 assertions passed');
