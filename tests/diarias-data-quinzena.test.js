const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const diarias = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'edr-v2-diarias.js'),
  'utf8'
);

function carregarBuscaQuinzena() {
  const trecho = diarias.match(/function _diarEncontrarQuinzenaPorData\([\s\S]*?\n\}/);
  assert.ok(trecho, 'helper de busca da quinzena deve existir');
  const contexto = {};
  vm.createContext(contexto);
  vm.runInContext(`${trecho[0]}; globalThis.buscar = _diarEncontrarQuinzenaPorData;`, contexto);
  return contexto.buscar;
}

test('encontra período livre pela data, inclusive quando cruza o mês', () => {
  const buscar = carregarBuscaQuinzena();
  const quinzenas = [
    { id: 'pagamento-setembro', data_inicio: '2026-08-31', data_fim: '2026-09-09', fechada: false },
    { id: 'anterior', data_inicio: '2026-08-20', data_fim: '2026-08-30', fechada: false }
  ];
  assert.equal(buscar(quinzenas, '2026-08-31').id, 'pagamento-setembro');
  assert.equal(buscar(quinzenas, '2026-09-02').id, 'pagamento-setembro');
  assert.equal(buscar(quinzenas, '2026-09-09').id, 'pagamento-setembro');
  assert.equal(buscar(quinzenas, '2026-08-25').id, 'anterior');
  assert.equal(buscar(quinzenas, '2026-10-01'), null);
});

test('data escolhida sincroniza automaticamente o período antes de preencher o dia', () => {
  const posData = diarias.indexOf('_diarLista.data = d.value || null;');
  const posSync = diarias.indexOf('await _diarListaSincronizarPeriodo(_diarLista.data, true);', posData);
  const posPreenche = diarias.indexOf('await _diarListaPreencherDoDia();', posSync);
  assert.ok(posData >= 0, 'handler deve ler a data escolhida');
  assert.ok(posSync > posData, 'handler deve localizar o período da data');
  assert.ok(posPreenche > posSync, 'só deve carregar o dia depois de sincronizar o período');
});

test('calendário fica livre e não é limitado pela quinzena selecionada', () => {
  assert.doesNotMatch(diarias, /d\.min = q\.data_inicio/);
  assert.doesNotMatch(diarias, /d\.max = q\.data_fim/);
});

test('salvar resolve o período pela data e envia o id resolvido à RPC', () => {
  const posResolve = diarias.indexOf('const q = await _diarListaSincronizarPeriodo(data, true);');
  const posRpc = diarias.indexOf("sbRpc('diarias_apontar'");
  assert.ok(posResolve >= 0, 'salvar deve resolver o período');
  assert.ok(posRpc >= 0, 'chamada da RPC deve existir');
  assert.ok(posResolve < posRpc, 'período deve ser resolvido antes da RPC');
  assert.match(diarias.slice(posRpc, posRpc + 260), /p_quinzena_id: q\.id/);
});

test('novo período exige datas livres e não recria regra fixa de quinzena', () => {
  assert.match(diarias, /id="nq-inicio"[\s\S]*?type="date">/);
  assert.match(diarias, /id="nq-fim"[\s\S]*?type="date">/);
  assert.match(diarias, /const label = _diarLabelPeriodo\(\{ data_inicio: inicio, data_fim: fim \}\);/);
  assert.doesNotMatch(diarias, /function _diarCriarQuinzenaAuto/);
  assert.doesNotMatch(diarias, /h\.getDate\(\) <= 15/);
});

test('edição do período não pode excluir diária salva nem cruzar outro período', () => {
  assert.match(diarias, /DiariasModule\.registros\.find\(r => r\.data && \(r\.data < inicio \|\| r\.data > fim\)\)/);
  assert.match(diarias, /q\.id !== atual\.id && q\.data_inicio <= fim && q\.data_fim >= inicio/);
  assert.match(diarias, /\{ label: novoLabel, data_inicio: inicio, data_fim: fim \}/);
});
