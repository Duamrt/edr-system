const assert = require('node:assert/strict');
const {
  normalizarUnidadeImportacao,
  dataNoIntervaloSemiaberto,
  resolverConversaoImportacao,
  classificarNaturezaNFe,
  ImportModule,
} = require('../js/edr-v2-importar.js');

(async () => {
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, innerHTML: '', value: '', style: {},
    classList: { add() {}, remove() {} },
    querySelector() { return { style: {}, title: '' }; },
  });
  return nodes.get(id);
}
global.document = { getElementById: node };
const avisos = [];
global.showToast = mensagem => avisos.push(mensagem);
global.classificarItemSync = () => ({ cat: 'Material' });
const enviados = [];
global.adicionarItem = item => enviados.push(item);
const regrasSalvas = [];
global.confirmar = async () => true;
global.sbPost = async (tabela, body) => {
  assert.equal(tabela, 'material_conversao');
  const regra = { id: `regra-${regrasSalvas.length + 1}`, ...body };
  regrasSalvas.push(regra);
  return regra;
};
node('f-recebimento').value = '2026-07-24';

const telha = { id: 'mat-telha', unidade: 'PC' };
const itemMilheiro = {
  qtd_fiscal: 0.8,
  unidade_fiscal: 'MI',
  preco_fiscal: 999,
  total_fiscal: 799.2,
};

assert.equal(normalizarUnidadeImportacao('UND'), 'UN');
assert.equal(normalizarUnidadeImportacao('m2'), 'M²');
assert.equal(dataNoIntervaloSemiaberto('2026-07-24', '2026-07-24', null), true);
assert.equal(dataNoIntervaloSemiaberto('2026-07-24', '2026-01-01', '2026-07-24'), false);
assert.equal(classificarNaturezaNFe({ natureza: 'DEV. DE MERCADORIA', finalidade: '4' }), 'DEVOLUCAO');
assert.equal(classificarNaturezaNFe({ natureza: 'DEV. DE MERCADORIA' }), 'DEVOLUCAO');
assert.equal(classificarNaturezaNFe({ natureza: 'VENDA DE MERCADORIAS', finalidade: '1' }), 'VENDA');

const convertido = resolverConversaoImportacao(itemMilheiro, telha, [{
  id: 'regra-mi-pc', material_id: 'mat-telha', unidade_origem: 'MI', unidade_destino: 'PC',
  fator: 1000, vigente_de: '2026-07-24', vigente_ate: null,
}], '2026-07-24');
assert.equal(convertido.status_conversao, 'convertido');
assert.equal(convertido.qtd_estoque, 800);
assert.ok(Math.abs(convertido.preco_estoque - 0.999) < 1e-12);
assert.ok(Math.abs((convertido.qtd_estoque * convertido.preco_estoque) - 799.2) < 1e-9);

const semRegra = resolverConversaoImportacao(itemMilheiro, telha, [], '2026-07-24');
assert.equal(semRegra.status_conversao, 'revisao_obrigatoria');
assert.equal(semRegra.qtd_estoque, null);

const sinonimo = resolverConversaoImportacao({ qtd_fiscal: 3, unidade_fiscal: 'UND', total_fiscal: 30 }, { id: 'mat-un', unidade: 'UN' }, [], '2026-07-24');
assert.equal(sinonimo.status_conversao, 'igual');
assert.equal(sinonimo.qtd_estoque, 3);

const semCatalogo = resolverConversaoImportacao(itemMilheiro, null, [], '2026-07-24');
assert.equal(semCatalogo.status_conversao, 'sem_catalogo');
assert.equal(semCatalogo.unidade_estoque, 'MI');

const convertidoTela = resolverConversaoImportacao(itemMilheiro, telha, [{
  id: 'regra-mi-pc', material_id: 'mat-telha', unidade_origem: 'MI', unidade_destino: 'PC',
  fator: 1000, vigente_de: '2026-07-24', vigente_ate: null,
}], '2026-07-24');
ImportModule._conversoesCache = [{
  id: 'regra-mi-pc', material_id: 'mat-telha', unidade_origem: 'MI', unidade_destino: 'PC',
  fator: 1000, vigente_de: '2026-07-24', vigente_ate: null,
}];
ImportModule.itensPreview = [{
  ...itemMilheiro, ...convertidoTela,
  descricao_fiscal: 'TELHA SEXTAVADA 1', codigo_produto_fiscal: '123',
  descOriginal: 'TELHA SEXTAVADA 1', descFinal: 'TELHA CERAMICA QUADRADA',
  codigoCat: '000140', material_id: 'mat-telha', qtd: 800, unidade: 'PC', preco: convertidoTela.preco_estoque,
  total: 799.2, credito: true, creditoCat: 'Material', confirmado: true,
  match: { material: telha, score: 100, tipo: 'manual' },
}];
ImportModule._renderPreview();
assert.match(node('import-preview-v2').innerHTML, /XML: 0\.8 MI/);
assert.match(node('import-preview-v2').innerHTML, /QTD ESTOQUE/);
assert.match(node('import-preview-v2').innerHTML, /readonly/);
assert.match(node('import-preview-v2').innerHTML, /value="0\.999"/);
assert.doesNotMatch(node('import-preview-v2').innerHTML, /0\.9990000000000001/);

await ImportModule.confirmarImport();
assert.equal(enviados.length, 1);
assert.equal(enviados[0].qtd_estoque, 800);
assert.equal(enviados[0].preco_estoque, convertidoTela.preco_estoque);
assert.equal(enviados[0].unidade_fiscal, 'MI');
assert.equal(enviados[0].regra_conversao_id, 'regra-mi-pc');

enviados.length = 0;
avisos.length = 0;
ImportModule._conversoesCache = [];
ImportModule.itensPreview = [{
  ...itemMilheiro, ...semRegra,
  descricao_fiscal: 'TELHA SEXTAVADA 1', descOriginal: 'TELHA SEXTAVADA 1',
  descFinal: 'TELHA CERAMICA QUADRADA', codigoCat: '000140', material_id: 'mat-telha',
  qtd: 0.8, unidade: 'PC', preco: 999, total: 799.2, credito: true,
  match: { material: telha, score: 100, tipo: 'manual' },
}];
await ImportModule.confirmarImport();
assert.equal(enviados.length, 0);
assert.match(avisos.at(-1), /precisam de regra de conversao/);

const brita = { id: 'mat-brita', codigo: '000108', nome: 'BRITA 19', unidade: 'M³' };
const itemBrita = {
  qtd_fiscal: 11.5,
  unidade_fiscal: 'MT',
  preco_fiscal: 135,
  total_fiscal: 1552.5,
};
const britaPendente = resolverConversaoImportacao(itemBrita, brita, [], '2026-08-19');
assert.equal(britaPendente.status_conversao, 'revisao_obrigatoria');
node('f-recebimento').value = '2026-08-19';
ImportModule._conversoesCache = [];
ImportModule.itensPreview = [{
  ...itemBrita, ...britaPendente,
  descricao_fiscal: 'BRITA 19mm', descOriginal: 'BRITA 19mm', descFinal: 'BRITA 19',
  codigoCat: '000108', material_id: 'mat-brita', qtd: 11.5, unidade: 'M³', preco: 135,
  total: 1552.5, credito: true, creditoCat: 'Material', confirmado: true,
  match: { material: brita, score: 100, tipo: 'manual' },
}];
ImportModule._renderPreview();
assert.match(node('import-preview-v2').innerHTML, /Usar M³ e memorizar 1:1/);
await ImportModule.aprenderConversaoUnidade(0);
assert.equal(regrasSalvas.length, 1);
assert.deepEqual(
  { origem: regrasSalvas[0].unidade_origem, destino: regrasSalvas[0].unidade_destino, fator: regrasSalvas[0].fator },
  { origem: 'MT', destino: 'M³', fator: 1 }
);
assert.equal(ImportModule.itensPreview[0].status_conversao, 'convertido');
assert.equal(ImportModule.itensPreview[0].qtd_estoque, 11.5);
assert.equal(ImportModule.itensPreview[0].preco_estoque, 135);
assert.doesNotMatch(node('import-preview-v2').innerHTML, /REVISAO OBRIGATORIA/);

console.log('xml-conversao-unidade: 36 assertions passed');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
