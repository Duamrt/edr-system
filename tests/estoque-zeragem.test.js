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
assert.equal(_alvoAbsolutoAjuste({ tipo: 'contagem', motivo: 'sistema R$ 33,00, real R$ 0,00, dif -R$ 33,00' }), 0);
assert.equal(_alvoAbsolutoAjuste({ tipo: 'contagem', motivo: 'Contagem física · Real: 21 · Sistema: 9' }), 21);

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

// Regressão real: a MALHA tinha uma contagem antiga com quantidades formatadas
// como moeda. Sem reconhecer "real R$ 0,00" como saldo absoluto, o sistema
// voltava à zeragem de 02/06 e exibia -12 UN em vez de -5 UN.
contexto.catalogoMateriais.length = 0;
contexto.notas.length = 0;
contexto.distribuicoes.length = 0;
contexto.ajustesEstoque.length = 0;
contexto.catalogoMateriais.push({ codigo: '000050', nome: 'MALHA POP LEVE 3X2', unidade: 'UN', categoria: '04_alven' });
contexto.notas.push(
  { id: 'nf-antiga', numero_nf: 'ANTIGA', fornecedor: 'ACOMAIS LTDA', natureza: 'VENDA', obra: 'EDR', data: '2026-05-20', itens: JSON.stringify([{ codigo: '000050', desc: 'MALHA POP LEVE 3X2', qtd: 70, unidade: 'UN', preco: 28.5 }]) },
  { id: 'nf-219025', numero_nf: '219025/1', fornecedor: 'ACOMAIS LTDA', natureza: 'VENDA', obra: 'EDR', data: '2026-06-17', itens: JSON.stringify([{ codigo: '000050', desc: 'MALHA POP LEVE 3X2', qtd: 30, unidade: 'UN', preco: 28.5 }]) },
  { id: 'nf-226266', numero_nf: '226266/1', fornecedor: 'ACOMAIS LTDA', natureza: 'VENDA', obra: 'EDR', data: '2026-08-07', itens: JSON.stringify([{ codigo: '000050', desc: 'MALHA POP LEVE 3X2', qtd: 10, unidade: 'UN', preco: 28.89 }]) },
);
contexto.distribuicoes.push(
  { item_desc: 'MALHA POP LEVE 3X2', codigo_catalogo: '000050', obra_nome: 'DUAM', qtd: 4, data: '2026-06-10', criado_em: '2026-06-30T11:29:13Z' },
  { item_desc: 'MALHA POP LEVE 3X2', codigo_catalogo: '000050', obra_nome: 'MIRELI', qtd: 2, data: '2026-07-08' },
  { item_desc: 'MALHA POP LEVE 3X2', codigo_catalogo: '000050', obra_nome: 'MIRELI', qtd: 12, data: '2026-07-30' },
  { item_desc: 'MALHA POP LEVE 3X2', codigo_catalogo: '000050', obra_nome: 'MIRELI', qtd: 1, data: '2026-08-10' },
);
contexto.ajustesEstoque.push(
  { tipo: 'ajuste', item_desc: 'MALHA POP LEVE 3X2', codigo_catalogo: '000050', unidade: 'UN', qtd: 66, motivo: 'Zeragem manual 02/06/2026', criado_em: '2026-06-02T12:00:00Z' },
  { tipo: 'contagem', item_desc: 'MALHA POP LEVE 3X2', codigo_catalogo: '000050', unidade: 'UN', qtd: -33, motivo: 'sistema R$ 33,00, real R$ 0,00, dif -R$ 33,00', criado_em: '2026-06-27T12:00:00Z' },
);

const consolidadoMalha = consolidarEstoque();
assert.equal(consolidadoMalha.length, 1);
assert.equal(consolidadoMalha[0].ajustes, 0);
assert.equal(consolidadoMalha[0].saldo, -5);

abrirHistoricoMaterial(consolidadoMalha[0].chave);
assert.match(historicoContent.innerHTML, /Contagem física — saldo definido em 0 UN/);
assert.match(historicoContent.innerHTML, /Saldo definido em 0 UN · 2026-06-27/);
assert.match(historicoContent.innerHTML, /saldo-final-value[^>]*>-5 UN</);
assert.doesNotMatch(historicoContent.innerHTML, /-33 UN ajuste/);

// Regressão real: a NF foi emitida antes da contagem, mas o material só chegou
// depois. Sem o fallback para data_recebimento, as 30 UN somem do saldo.
contexto.catalogoMateriais.length = 0;
contexto.notas.length = 0;
contexto.distribuicoes.length = 0;
contexto.ajustesEstoque.length = 0;
contexto.catalogoMateriais.push({ codigo: '000287', nome: 'LUVA PVC ESGOTO 100MM', unidade: 'UN', categoria: '06_hidraulica' });
contexto.notas.push({
  id: 'nf-recebida-depois', numero_nf: 'LEGADA', fornecedor: 'FORNECEDOR', natureza: 'VENDA', obra: 'EDR',
  data: '2026-06-04', data_recebimento: '2026-06-29', data_efetiva_estoque: null,
  itens: JSON.stringify([{ codigo: '000287', desc: 'LUVA PVC ESGOTO 100MM', qtd: 30, unidade: 'UN', preco: 5 }]),
});
contexto.ajustesEstoque.push({
  tipo: 'contagem', item_desc: 'LUVA PVC ESGOTO 100MM', codigo_catalogo: '000287', unidade: 'UN', qtd: -11,
  motivo: 'Contagem fisica: sistema R$ 14,00, real R$ 3,00, dif R$ -11,00', criado_em: '2026-06-23T16:14:51Z',
});
contexto.distribuicoes.push({ item_desc: 'LUVA PVC ESGOTO 100MM', codigo_catalogo: '000287', obra_nome: 'DUAM', qtd: 14, data: '2026-07-01' });

const consolidadoRecebimento = consolidarEstoque();
assert.equal(consolidadoRecebimento.length, 1);
assert.equal(consolidadoRecebimento[0].lotes[0].data, '2026-06-29');
assert.equal(consolidadoRecebimento[0].saldo, 19);

// O mesmo corte vale para devolução legada: se a mercadoria saiu fisicamente
// depois da contagem, ela precisa reduzir o saldo a partir do recebimento.
contexto.catalogoMateriais.length = 0;
contexto.notas.length = 0;
contexto.distribuicoes.length = 0;
contexto.ajustesEstoque.length = 0;
contexto.catalogoMateriais.push({ codigo: '000006', nome: 'CAIXA DAGUA FORTLEV 1000L POLIETILENO', unidade: 'UN', categoria: '04_alven' });
contexto.notas.push(
  {
    id: 'nf-caixa-origem', numero_nf: 'COMPRA', fornecedor: 'FORNECEDOR', natureza: 'VENDA', obra: 'EDR', data: '2026-05-01',
    itens: JSON.stringify([{ codigo: '000006', desc: 'CAIXA DAGUA FORTLEV 1000L POLIETILENO', qtd: 5, unidade: 'UN', preco: 100 }]),
  },
  {
    id: 'nf-caixa-devolucao', nota_origem_id: 'nf-caixa-origem', numero_nf: 'DEVOLUCAO', fornecedor: 'FORNECEDOR', natureza: 'DEVOLUCAO', obra: 'EDR',
    data: '2026-05-30', data_recebimento: '2026-06-10', data_efetiva_estoque: null,
    itens: JSON.stringify([{ codigo: '000006', desc: 'CAIXA DAGUA FORTLEV 1000L POLIETILENO', qtd: 2, unidade: 'UN', preco: 100, item_idx_origem: 0 }]),
  },
);
contexto.ajustesEstoque.push({
  tipo: 'ajuste', item_desc: 'CAIXA DAGUA FORTLEV 1000L POLIETILENO', codigo_catalogo: '000006', unidade: 'UN', qtd: 0,
  motivo: 'Zeragem manual 02/06/2026', criado_em: '2026-06-02T13:01:28Z',
});

const consolidadoDevolucaoLegada = consolidarEstoque();
assert.equal(consolidadoDevolucaoLegada.length, 1);
assert.equal(consolidadoDevolucaoLegada[0].saldo, -2);

// Regressão real: contagens de março usavam "Real:". O alvo absoluto deve
// descartar entradas/saídas anteriores e aplicar apenas movimentos posteriores.
contexto.catalogoMateriais.length = 0;
contexto.notas.length = 0;
contexto.distribuicoes.length = 0;
contexto.ajustesEstoque.length = 0;
contexto.catalogoMateriais.push({ codigo: '000414', nome: 'TUBO SOLD PVC 50MM 6M', unidade: 'UN', categoria: '06_hidraulica' });
contexto.notas.push({
  id: 'nf-tubo-antiga', numero_nf: 'ANTIGA', fornecedor: 'FORNECEDOR', natureza: 'VENDA', obra: 'EDR', data: '2026-03-01',
  itens: JSON.stringify([{ codigo: '000414', desc: 'TUBO SOLD PVC 50MM 6M', qtd: 9, unidade: 'UN', preco: 10 }]),
});
contexto.distribuicoes.push(
  { item_desc: 'TUBO SOLD PVC 50MM 6M', codigo_catalogo: '000414', obra_nome: 'DUAM', qtd: 11, data: '2026-03-20' },
  { item_desc: 'TUBO SOLD PVC 50MM 6M', codigo_catalogo: '000414', obra_nome: 'DUAM', qtd: 4, data: '2026-04-02' },
);
contexto.ajustesEstoque.push({
  tipo: 'contagem', item_desc: 'TUBO SOLD PVC 50MM 6M', codigo_catalogo: '000414', unidade: 'UN', qtd: 12,
  motivo: 'Contagem física · Real: 21 · Sistema: 9', criado_em: '2026-03-31T17:25:48Z',
});

const consolidadoDoisPontos = consolidarEstoque();
assert.equal(consolidadoDoisPontos.length, 1);
assert.equal(consolidadoDoisPontos[0].ajustes, 0);
assert.equal(consolidadoDoisPontos[0].saldo, 17);

const fonteValidacao = fs.readFileSync(require.resolve('../js/edr-v2-estoque.js'), 'utf8');
assert.match(fonteValidacao, /ajusteTipoAtual === 'correcao' && qtd === 0/);
assert.doesNotMatch(fonteValidacao, /ajusteTipoAtual !== 'inventario' && qtd === 0/);

console.log('estoque-zeragem: 32 assertions passed');
