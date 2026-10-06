'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const { criar } = require('../js/edr-v2-visao-financeira-estado.js');
const adiar = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
function snapshot(companyId = 'empresa-teste', valor = 20) {
  return { companyId,
    obras: [{ id: 'obra-a', company_id: companyId, nome: 'Obra sintetica A', valor_venda: 100, arquivada: false }],
    lancamentos: [{ id: 'l1', company_id: companyId, obra_id: 'obra-a', total: 10, data: '2001-06-06' }],
    repasses: [{ id: 'r1', company_id: companyId, obra_id: 'obra-a', valor, data_credito: '2001-06-06' }],
    adicionais: [], pagamentosAdicionais: [],
    ledger: { status: 'confirmado', estado: { company_id: companyId, contas: [], total_centavos: 0 } }
  };
}
function ambiente(carregar) {
  const atual = { company_id: 'empresa-teste', ator_id: 'ator-teste', perfil: 'admin' };
  const instancia = criar({ modelo, dados: { carregar: carregar || (async () => snapshot()) }, obterIdentidade: () => atual });
  return { atual, instancia };
}
test('filtros compartilhados recompõem a mesma leitura sem novas chamadas', async () => {
  let chamadas = 0;
  const { instancia } = ambiente(async () => { chamadas++; return snapshot(); });
  await instancia.carregar();
  assert.equal(instancia.setFiltro({ periodo: '2001-07' }).visao.totais.recebidoPeriodoCentavos, 0);
  assert.equal(instancia.ler().visao.totais.pendenteContratoCentavos, 8000);
  assert.equal(instancia.setFiltro({ situacao: 'arquivadas' }).visao.obras.length, 0);
  assert.equal(instancia.setFiltro({ periodo: '', situacao: 'ativas', obraId: 'obra-a' }).visao.obras.length, 1);
  assert.equal(chamadas, 1);
  assert.equal(instancia.ler().visao.saldo.status, 'sem_abertura');
});
test('filtro alterado durante carga vale para a resposta posterior', async () => {
  const consulta = adiar(); const { instancia } = ambiente(() => consulta.promise);
  const carga = instancia.carregar();
  assert.equal(instancia.setFiltro({ periodo: '2001-07' }).fase, 'carregando');
  consulta.resolve(snapshot()); await carga;
  assert.equal(instancia.ler().visao.filtro.periodo, '2001-07');
  assert.equal(instancia.ler().visao.totais.recebidoPeriodoCentavos, 0);
});
test('resposta antiga nao sobrescreve a consulta mais recente', async () => {
  const primeira = adiar(), segunda = adiar(); let chamadas = 0;
  const { instancia } = ambiente(() => (++chamadas === 1 ? primeira : segunda).promise);
  const p1 = instancia.carregar(), p2 = instancia.carregar();
  segunda.resolve(snapshot('empresa-teste', 40)); await p2;
  primeira.resolve(snapshot('empresa-teste', 90)); await p1;
  assert.equal(instancia.ler().visao.totais.recebidoAcumuladoCentavos, 4000);
});
for (const campo of ['company_id', 'ator_id', 'perfil']) {
  test(`mudanca de ${campo} invalida resposta pendente e filtros`, async () => {
    const consulta = adiar(); const { instancia, atual } = ambiente(() => consulta.promise);
    instancia.setFiltro({ periodo: '2001-06', obraId: 'obra-a', situacao: 'todas' });
    const carga = instancia.carregar(); atual[campo] = 'outro';
    consulta.resolve(snapshot()); await carga;
    assert.equal(instancia.ler().fase, 'invalidada');
    assert.equal(instancia.ler().visao, null);
    assert.deepEqual(instancia.ler().filtro, { periodo: '', obraId: '', situacao: 'ativas' });
  });
}
test('ler apos troca de empresa descarta a visao ja carregada', async () => {
  const { instancia, atual } = ambiente(); await instancia.carregar(); atual.company_id = 'outra-empresa';
  assert.equal(instancia.ler().visao, null);
  assert.equal(instancia.ler().fase, 'invalidada');
});
test('falha de recarga retira os valores anteriores e informa codigo', async () => {
  let chamadas = 0;
  const { instancia } = ambiente(async () => {
    if (++chamadas === 1) return snapshot();
    throw Object.assign(new Error('conteudo privado nao exposto'), { code: 'FONTE_INDISPONIVEL' });
  });
  await instancia.carregar(); await instancia.carregar();
  assert.equal(instancia.ler().visao, null);
  assert.deepEqual(instancia.ler().erro, { codigo: 'FONTE_INDISPONIVEL' });
});
test('snapshot de outra empresa nunca vira visao', async () => {
  const { instancia } = ambiente(async () => snapshot('outra-empresa'));
  await instancia.carregar();
  assert.equal(instancia.ler().fase, 'erro');
  assert.equal(instancia.ler().erro.codigo, 'EMPRESA_INVALIDA');
  assert.equal(instancia.ler().visao, null);
});
test('invalidacao explicita impede resposta em voo', async () => {
  const consulta = adiar(); const { instancia } = ambiente(() => consulta.promise);
  const carga = instancia.carregar(); instancia.invalidar(); consulta.resolve(snapshot()); await carga;
  assert.equal(instancia.ler().fase, 'invalidada'); assert.equal(instancia.ler().visao, null);
});
test('observadores recebem filtros e podem remover assinatura', async () => {
  const { instancia } = ambiente(); const eventos = [];
  const sair = instancia.assinar(estado => eventos.push(estado.fase));
  await instancia.carregar(); instancia.setFiltro({ periodo: '2001-06' }); sair(); instancia.invalidar();
  assert.deepEqual(eventos, ['inicial', 'carregando', 'pronta', 'pronta']);
});
test('erro no renderer nao muda a leitura e estado publicado e imutavel', async () => {
  const { instancia } = ambiente(); instancia.assinar(estado => { if (estado.fase === 'pronta') throw Error('renderer'); });
  await instancia.carregar(); const estado = instancia.ler();
  assert.equal(estado.fase, 'pronta');
  assert.throws(() => { estado.visao.totais.recebidoAcumuladoCentavos = 999; }, TypeError);
  assert.throws(() => { estado.filtro.periodo = '2001-07'; }, TypeError);
  assert.equal(instancia.ler().visao.totais.recebidoAcumuladoCentavos, 2000);
});
test('filtro invalido conserva a selecao atual', async () => {
  const { instancia } = ambiente(); await instancia.carregar();
  assert.throws(() => instancia.setFiltro({ periodo: '2001-13' }), RangeError);
  assert.equal(instancia.ler().filtro.periodo, '');
  assert.equal(instancia.ler().fase, 'pronta');
});
test('sem identidade nenhuma leitura e iniciada', async () => {
  let chamadas = 0;
  const instancia = criar({ modelo, dados: { carregar: async () => { chamadas++; return snapshot(); } }, obterIdentidade: () => null });
  await instancia.carregar(); assert.equal(chamadas, 0); assert.equal(instancia.ler().fase, 'invalidada');
});
