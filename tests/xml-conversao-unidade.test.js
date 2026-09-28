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

// NF 209169/1: quatro cabos faturados em rolos de 100 m. A quantidade
// recebida deve permanecer em RL quando o material do catalogo usa RL.
const cabosNFe = [
  { cor: 'PRETO', qtd: 2, preco: 155.56, total: 311.12 },
  { cor: 'VERDE', qtd: 3, preco: 162.97, total: 488.91 },
  { cor: 'AMARELO', qtd: 2, preco: 162.97, total: 325.94 },
  { cor: 'BRANCO', qtd: 2, preco: 162.97, total: 325.94 },
].map((cabo, idx) => ({
  item: { qtd_fiscal: cabo.qtd, unidade_fiscal: 'RL', preco_fiscal: cabo.preco, total_fiscal: cabo.total },
  materialRL: { id: `mat-cabo-${idx}`, unidade: 'RL', codigo: `cabo-${idx}`, nome: `CABO ${cabo.cor}` },
  materialM: { id: `mat-cabo-${idx}`, unidade: 'M', codigo: `cabo-${idx}`, nome: `CABO ${cabo.cor}` },
  ...cabo,
}));
assert.equal(cabosNFe.reduce((total, cabo) => total + cabo.total, 0).toFixed(2), '1451.91');
for (const cabo of cabosNFe) {
  const emRolos = resolverConversaoImportacao(cabo.item, cabo.materialRL, [], '2026-09-28');
  assert.equal(emRolos.status_conversao, 'igual');
  assert.equal(emRolos.qtd_fiscal, cabo.qtd);
  assert.equal(emRolos.unidade_fiscal, 'RL');
  assert.equal(emRolos.qtd_estoque, cabo.qtd);
  assert.equal(emRolos.unidade_estoque, 'RL');
  assert.equal(emRolos.preco_estoque, cabo.preco);
  assert.equal(emRolos.total_fiscal, cabo.total);

  const semRegraCabo = resolverConversaoImportacao(cabo.item, cabo.materialM, [], '2026-09-28');
  assert.equal(semRegraCabo.status_conversao, 'revisao_obrigatoria');
  assert.equal(semRegraCabo.qtd_estoque, null);

  // Um rolo de 100 m nao pode virar 1 m so porque ha uma regra antiga 1:1.
  const regra1 = {
    id: `regra-cabo-1-${cabo.cor}`, material_id: cabo.materialM.id,
    unidade_origem: 'RL', unidade_destino: 'M', fator: 1,
    vigente_de: '2026-09-28', vigente_ate: null,
  };
  const equivalenciaIncorreta = resolverConversaoImportacao(cabo.item, cabo.materialM, [regra1], '2026-09-28');
  assert.equal(equivalenciaIncorreta.status_conversao, 'revisao_obrigatoria');
  assert.equal(equivalenciaIncorreta.qtd_estoque, null);

  const regra100 = {
    id: `regra-cabo-${cabo.cor}`, material_id: cabo.materialM.id,
    unidade_origem: 'RL', unidade_destino: 'M', fator: 100,
    vigente_de: '2026-09-28', vigente_ate: null,
  };
  const emMetros = resolverConversaoImportacao(cabo.item, cabo.materialM, [regra100], '2026-09-28');
  assert.equal(emMetros.status_conversao, 'convertido');
  assert.equal(emMetros.qtd_estoque, cabo.qtd * 100);
  assert.equal(emMetros.unidade_estoque, 'M');
  assert.equal(emMetros.regra_conversao_id, regra100.id);
  assert.ok(Math.abs(emMetros.preco_estoque - cabo.total / (cabo.qtd * 100)) < 1e-12);
  assert.ok(Math.abs(emMetros.qtd_estoque * emMetros.preco_estoque - cabo.total) < 1e-9);
}

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
  qtd: 0.8, unidade: 'PC', preco: 999, total: 799.2, credito: true, confirmado: true,
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

function previewCabo(cabo, material) {
  const conversao = resolverConversaoImportacao(cabo.item, material, ImportModule._conversoesCache, '2026-09-28');
  return {
    ...cabo.item, ...conversao,
    descricao_fiscal: `CABO FLEXIVEL ${cabo.cor} ROLO-100M`,
    descOriginal: `CABO FLEXIVEL ${cabo.cor} ROLO-100M`,
    descFinal: material.nome, codigoCat: material.codigo, material_id: material.id,
    qtd: conversao.qtd_estoque ?? cabo.qtd, unidade: material.unidade,
    preco: conversao.preco_estoque ?? cabo.preco, total: cabo.total,
    credito: true, creditoCat: 'Material', confirmado: true,
    match: { material, score: 100, tipo: 'manual' },
  };
}

node('f-recebimento').value = '2026-09-28';
enviados.length = 0;
avisos.length = 0;
ImportModule._conversoesCache = cabosNFe.map(cabo => ({
  id: `regra-cabo-1-${cabo.cor}`, material_id: cabo.materialM.id,
  unidade_origem: 'RL', unidade_destino: 'M', fator: 1,
  vigente_de: '2026-09-28', vigente_ate: null,
}));
ImportModule.itensPreview = [previewCabo(cabosNFe[1], cabosNFe[1].materialM)];
ImportModule._renderPreview();
const previewRoloPendente = node('import-preview-v2').innerHTML;
assert.match(previewRoloPendente, /XML: 3 RL/);
assert.match(previewRoloPendente, /total R\$ 488,91/);
assert.match(previewRoloPendente, /QTD ESTOQUE<\/label>\s*<input type="number" value=""/);
assert.match(previewRoloPendente, /PRECO ESTOQUE<\/label>\s*<input type="number" value=""/);
assert.match(previewRoloPendente, /id="import-fator-0"[^>]*value=""/);
ImportModule.itensPreview = cabosNFe.map(cabo => previewCabo(cabo, cabo.materialM));
await ImportModule.confirmarImport();
assert.equal(enviados.length, 0);
assert.equal(ImportModule.itensPreview.filter(item => item.status_conversao === 'revisao_obrigatoria').length, 4);
assert.match(avisos.at(-1), /4 item\(ns\) precisam de regra de conversao/);

// A falha de leitura das regras tambem deve manter o bloqueio da divergencia.
global.sbGetAll = async (tabela, consulta, opcoes) => {
  assert.equal(tabela, 'material_conversao');
  assert.match(consulta, /order=id\.asc/);
  assert.equal(opcoes.throwOnError, true);
  throw new Error('falha simulada ao ler material_conversao');
};
await ImportModule._carregarConversoes();
assert.deepEqual(ImportModule._conversoesCache, []);
assert.equal(ImportModule._conversoesFalharam, true);
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(enviados.length, 0);
assert.match(avisos.at(-1), /Não foi possível conferir as conversões/);

global.sbGetAll = async (tabela, consulta, opcoes) => {
  assert.equal(tabela, 'material_conversao');
  assert.match(consulta, /order=id\.asc/);
  assert.equal(opcoes.throwOnError, true);
  return [...regrasSalvas];
};
await ImportModule._carregarConversoes();
assert.equal(ImportModule._conversoesFalharam, false);

ImportModule._conversoesCache = [];
ImportModule.itensPreview = cabosNFe.map(cabo => previewCabo(cabo, cabo.materialRL));
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(enviados.length, 4);
assert.equal(enviados.reduce((total, item) => total + item.qtd_estoque, 0), 9);
assert.equal(enviados.reduce((total, item) => total + item.total_fiscal, 0).toFixed(2), '1451.91');
for (let idx = 0; idx < enviados.length; idx++) {
  assert.equal(enviados[idx].qtd_fiscal, cabosNFe[idx].qtd);
  assert.equal(enviados[idx].unidade_fiscal, 'RL');
  assert.equal(enviados[idx].qtd_estoque, cabosNFe[idx].qtd);
  assert.equal(enviados[idx].unidade_estoque, 'RL');
  assert.equal(enviados[idx].regra_conversao_id, null);
}

// Caminho alternativo explicito: usuario escolhe catalogo em M e informa 100 M/RL.
const caboPreto = cabosNFe[0];
ImportModule._conversoesCache = [];
ImportModule.itensPreview = [previewCabo(caboPreto, caboPreto.materialM)];
ImportModule._renderPreview();
assert.match(node('import-preview-v2').innerHTML, /id="import-fator-0"/);
assert.match(node('import-preview-v2').innerHTML, /salvarFatorConversao\(0\)/);
assert.doesNotMatch(node('import-preview-v2').innerHTML, /Usar M e memorizar 1:1/);
node('import-fator-0').value = '1';
const regrasAntes = regrasSalvas.length;
await ImportModule.salvarFatorConversao(0);
assert.equal(regrasSalvas.length, regrasAntes);
assert.equal(ImportModule.itensPreview[0].status_conversao, 'revisao_obrigatoria');
node('import-fator-0').value = '100';
await ImportModule.salvarFatorConversao(0);
assert.equal(regrasSalvas.length, regrasAntes + 1);
assert.equal(regrasSalvas.at(-1).fator, 100);
assert.equal(regrasSalvas.at(-1).unidade_origem, 'RL');
assert.equal(regrasSalvas.at(-1).unidade_destino, 'M');
assert.equal(ImportModule.itensPreview[0].qtd_estoque, 200);
assert.equal(ImportModule.itensPreview[0].unidade_estoque, 'M');
assert.ok(Math.abs(ImportModule.itensPreview[0].preco_estoque - 1.5556) < 1e-12);
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(enviados.length, 1);
assert.equal(enviados[0].qtd_fiscal, 2);
assert.equal(enviados[0].unidade_fiscal, 'RL');
assert.equal(enviados[0].qtd_estoque, 200);
assert.equal(enviados[0].unidade_estoque, 'M');
assert.equal(enviados[0].total_fiscal, 311.12);
assert.ok(Math.abs(enviados[0].qtd_estoque * enviados[0].preco_estoque - enviados[0].total_fiscal) < 1e-9);

// Ao escolher RL, o cadastro rapido deve sugerir RL e vincular o novo item
// somente apos o callback de salvamento; cancelar preserva o vinculo anterior.
const novoCaboRL = {
  ...caboPreto.materialRL, id: 'mat-cabo-preto-rl', codigo: 'cabo-preto-rl',
  nome: 'CABO FLEXIVEL PRETO ROLO-100M',
};
global.catalogoMateriais = [caboPreto.materialM, novoCaboRL];
global.classificarItemSync = () => ({ cat: 'Material', credito: true });
let sugestaoCadastro = null;
global.cadastroRapidoMaterial = (...args) => { sugestaoCadastro = args; };
ImportModule._conversoesCache = [];
ImportModule.itensPreview = [previewCabo(caboPreto, caboPreto.materialM)];
ImportModule._renderPreview();
assert.match(node('import-preview-v2').innerHTML, /value="fiscal">RL \(novo item\)/);
ImportModule.escolherUnidadeEstoque(0, 'fiscal');
assert.equal(sugestaoCadastro[1], 'import');
assert.equal(sugestaoCadastro[2], 'RL');
assert.equal(ImportModule.itensPreview[0].match.material.unidade, 'M');
ImportModule.posicaoRapidoCallback(novoCaboRL.codigo);
assert.equal(ImportModule.itensPreview[0].match.material.id, novoCaboRL.id);
assert.equal(ImportModule.itensPreview[0].status_conversao, 'igual');
assert.equal(ImportModule.itensPreview[0].qtd_estoque, 2);
assert.equal(ImportModule.itensPreview[0].unidade_estoque, 'RL');
assert.equal(ImportModule.itensPreview[0].credito, true);
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(enviados.length, 1);
assert.equal(enviados[0].qtd_estoque, 2);
assert.equal(enviados[0].unidade_estoque, 'RL');

// Match automatico fraco nao vincula material nem aplica uma regra deste
// material: a NF segue com as unidades fiscais ate o usuario escolher item.
ImportModule._conversoesCache = [{
  id: 'regra-cabo-metros', material_id: caboPreto.materialM.id,
  unidade_origem: 'RL', unidade_destino: 'M', fator: 100,
  vigente_de: '2026-09-28', vigente_ate: null,
}];
const caboMatchFraco = previewCabo(caboPreto, caboPreto.materialM);
caboMatchFraco.match = { material: caboPreto.materialM, score: 40, tipo: 'auto' };
caboMatchFraco.confirmado = false;
caboMatchFraco.codigoCat = null;
ImportModule.itensPreview = [caboMatchFraco];
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(enviados.length, 1);
assert.equal(enviados[0].codigo, '');
assert.equal(enviados[0].material_id, null);
assert.equal(enviados[0].regra_conversao_id, null);
assert.equal(enviados[0].status_conversao, 'sem_catalogo');
assert.equal(enviados[0].qtd_estoque, 2);
assert.equal(enviados[0].unidade_estoque, 'RL');
assert.equal(enviados[0].total_fiscal, 311.12);

// De-para compartilhado: uma falha de leitura nao pode liberar o XML usando
// apenas cache local, pois o vinculo com o catalogo pode estar desatualizado.
const cnpjFornecedor = '35428312000266';
const itemDePara = previewCabo(caboPreto, novoCaboRL);
itemDePara.cProd = 'CABO-PRETO-100M';
itemDePara._cnpj = cnpjFornecedor;
ImportModule._conversoesCache = [];
ImportModule._deParaCache = {};
ImportModule.itensPreview = [itemDePara];
global.sbGetAll = async (tabela, consulta, opcoes) => {
  assert.equal(tabela, 'material_depara');
  assert.match(consulta, /order=cnpj\.asc,cprod\.asc/);
  assert.equal(opcoes.throwOnError, true);
  throw new Error('falha simulada na leitura do de-para');
};
assert.equal(await ImportModule._carregarDePara(), false);
assert.equal(ImportModule._deParaFalharam, true);
node('modal-import-v2').style.display = 'flex';
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(enviados.length, 0);
assert.equal(ImportModule.itensPreview.length, 1);
assert.equal(node('modal-import-v2').style.display, 'flex');

global.sbGetAll = async (tabela, consulta, opcoes) => {
  assert.equal(tabela, 'material_depara');
  assert.match(consulta, /order=cnpj\.asc,cprod\.asc/);
  assert.equal(opcoes.throwOnError, true);
  return [];
};
assert.equal(await ImportModule._carregarDePara(), true);
assert.equal(ImportModule._deParaFalharam, false);

// A NF tem dois codigos de produto. A confirmacao espera ambas as gravacoes
// antes de entregar os itens; falha do de-para gera aviso sem perder a NF.
const itemDeParaVerde = previewCabo(cabosNFe[1], cabosNFe[1].materialRL);
itemDeParaVerde.cProd = 'CABO-VERDE-100M';
itemDeParaVerde._cnpj = cnpjFornecedor;
ImportModule.itensPreview = [itemDePara, itemDeParaVerde];
ImportModule._deParaCache = {};
const gravacoesPendentes = [];
global.sbPost = (tabela, body) => {
  assert.equal(tabela, 'material_depara');
  return new Promise(resolve => gravacoesPendentes.push({ body, resolve }));
};
node('modal-import-v2').style.display = 'flex';
enviados.length = 0;
const confirmacaoDePara = ImportModule.confirmarImport();
await ImportModule.confirmarImport(); // duplo clique enquanto a primeira escrita aguarda
assert.equal(gravacoesPendentes.length, 1);
assert.equal(enviados.length, 0);
assert.equal(node('modal-import-v2').style.display, 'flex');
gravacoesPendentes[0].resolve({ id: 'depara-preto' });
await new Promise(resolve => setImmediate(resolve));
assert.equal(gravacoesPendentes.length, 2);
assert.equal(enviados.length, 0);
assert.equal(node('modal-import-v2').style.display, 'flex');
gravacoesPendentes[1].resolve(null);
await confirmacaoDePara;
assert.equal(enviados.length, 2);
assert.equal(ImportModule.itensPreview.length, 0);
assert.equal(node('modal-import-v2').style.display, 'none');
assert.match(avisos.at(-1), /1 vínculo\(s\) do fornecedor não foram salvos/);
assert.equal(ImportModule._deParaCache[ImportModule._deParaKey(cnpjFornecedor, itemDePara.cProd)], itemDePara.codigoCat);
assert.equal(ImportModule._deParaCache[ImportModule._deParaKey(cnpjFornecedor, itemDeParaVerde.cProd)], undefined);

// Quando ambas as escritas terminam com sucesso, os itens sao entregues e o
// modal fecha com os dois vinculos disponiveis no cache.
const gravacoesConcluidas = [];
global.sbPost = async (tabela, body) => {
  assert.equal(tabela, 'material_depara');
  gravacoesConcluidas.push(body);
  return { id: `depara-${gravacoesConcluidas.length}`, ...body };
};
ImportModule._deParaCache = {};
ImportModule.itensPreview = [itemDePara, itemDeParaVerde];
node('modal-import-v2').style.display = 'flex';
enviados.length = 0;
await ImportModule.confirmarImport();
assert.equal(gravacoesConcluidas.length, 2);
assert.equal(enviados.length, 2);
assert.equal(node('modal-import-v2').style.display, 'none');
assert.equal(ImportModule._deParaCache[ImportModule._deParaKey(cnpjFornecedor, itemDePara.cProd)], itemDePara.codigoCat);
assert.equal(ImportModule._deParaCache[ImportModule._deParaKey(cnpjFornecedor, itemDeParaVerde.cProd)], itemDeParaVerde.codigoCat);

console.log('xml-conversao-unidade: cenarios de regressao passaram');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
