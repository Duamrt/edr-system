const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fonte = fs.readFileSync(require.resolve('../js/edr-v2-infra.js'), 'utf8') + `
globalThis.__infraTeste = {
  sbGet, loadNotas, loadLancamentos, loadDistribuicoes, loadEntradasDiretas,
  loadAjustesEstoque, _marcarCargaEstoque, estoqueDadosCompletos,
  estoqueCargasPendentes, getNotas: () => notas,
};`;

const contexto = {
  console: { log() {}, warn() {} },
  document: { currentScript: null, addEventListener() {} },
  fetch: async () => ({ ok: true, json: async () => [{ id: 'nf-valida' }] }),
};
(async () => {
  vm.runInNewContext(fonte, contexto, { filename: 'edr-v2-infra.js' });
  const infra = contexto.__infraTeste;

  assert.equal(await infra.loadNotas(), true);
  assert.equal(JSON.stringify(infra.getNotas()), JSON.stringify([{ id: 'nf-valida' }]));

  for (const chave of ['lancamentos', 'distribuicoes', 'entradasDiretas', 'ajustesEstoque']) {
    infra._marcarCargaEstoque(chave, true);
  }
  assert.equal(infra.estoqueDadosCompletos(), true);

  contexto.fetch = async () => ({ ok: false, status: 503 });
  assert.equal(await infra.loadNotas(), false);
  assert.equal(JSON.stringify(infra.getNotas()), JSON.stringify([{ id: 'nf-valida' }]));
  assert.equal(infra.estoqueDadosCompletos(), false);
  assert.equal(Array.from(infra.estoqueCargasPendentes()).join(','), 'notas');
  await assert.rejects(() => infra.sbGet('notas_fiscais', '', { throwOnError: true }), /503/);

  const cargas = [
    ['notas', infra.loadNotas],
    ['lancamentos', infra.loadLancamentos],
    ['distribuicoes', infra.loadDistribuicoes],
    ['entradasDiretas', infra.loadEntradasDiretas],
    ['ajustesEstoque', infra.loadAjustesEstoque],
  ];
  for (const [chave, carregar] of cargas) {
    for (const [outraChave] of cargas) infra._marcarCargaEstoque(outraChave, true);
    assert.equal(await carregar(), false, `${chave} deveria falhar sem virar lista vazia`);
    assert.equal(Array.from(infra.estoqueCargasPendentes()).join(','), chave);
  }

  console.log('estoque-carga-segura: 18 assertions passed');
})().catch(erro => {
  console.error(erro);
  process.exitCode = 1;
});
