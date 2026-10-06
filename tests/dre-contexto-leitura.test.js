'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const raiz = path.resolve(__dirname, '..');
const atual = fs.readFileSync(path.join(raiz, 'js/edr-v2-dre.js'), 'utf8');
// Oraculo imutavel: motor anterior ao contexto, sem reproduzir suas formulas no teste.
const anterior = execFileSync('git', ['show', 'bb463bb:js/edr-v2-dre.js'], { cwd: raiz, encoding: 'utf8', windowsHide: true });
const simples = v => JSON.parse(JSON.stringify(v));

function foto() {
  return {
    obras: [{ id: 'a', nome: 'Casa QA Cliente A', area_m2: 100 }, { id: 'b', nome: 'Casa QA Cliente B', area_m2: 80 },
      { id: 'qa', nome: 'OBRA QA TESTE', area_m2: 999 }, { id: 'office', nome: 'ESCRITORIO QA', area_m2: 10 },
      { id: 'interna-id', nome: 'Unidade interna QA', area_m2: 20 }],
    obrasArquivadas: [{ id: 'arquivo', nome: 'Casa QA Arquivada', area_m2: 50 }, { id: 'sem-mov', nome: 'Casa QA Sem movimento', area_m2: 200 }],
    OBRAS_INTERNAS: ['interna-id', 'office'],
    repasses: [
      { obra_id: 'a', tipo: 'entrada', valor: 1000, data_credito: '2001-06-01' },
      { obra_id: 'a', tipo: 'pls', valor: '500', data_credito: '2001-06-02' },
      { obra_id: 'a', tipo: 'terreno', valor: 100, data_credito: '2001-06-03' },
      { obra_id: 'a', tipo: 'pls', valor: 80, data_credito: '2001-07-01' },
      { obra_id: 'b', tipo: 'pls', valor: 600, data_credito: '2001-06-02' },
      { obra_id: 'arquivo', tipo: 'pls', valor: 200, data_credito: '2001-06-02' },
      { obra_id: 'qa', tipo: 'pls', valor: 99999, data_credito: '2001-06-02' },
      { obra_id: 'interna-id', tipo: 'pls', valor: 300, data_credito: '2001-06-02' }],
    adicionais: [{ id: 'ad1', obra_id: 'a', status: 'aprovado' }, { id: 'ad2', obra_id: 'a', status: 'cancelado' }, { id: 'ad3', obra_id: 'b', status: 'pendente' }],
    pagamentosAdicionais: [{ adicional_id: 'ad1', data: '2001-06-01', valor: 150 }, { adicional_id: 'ad2', data: '2001-06-02', valor: 80 },
      { adicional_id: 'ad3', data: '2001-07-01', valor: 30 }, { adicional_id: 'ausente', data: '2001-06-02', valor: 500 }],
    lancamentos: [
      { obra_id: 'a', etapa: '28_mao', total: 200, data: '2001-06-01' },
      { obra_id: 'a', etapa: '01_material', total: '180', data: '2001-06-01' },
      { obra_id: 'a', etapa: '35_terreno', total: 50, data: '2001-06-01' },
      { obra_id: 'a', etapa: '24_imposto', total: 20, data: '2001-06-01' },
      { obra_id: 'b', etapa: '28_mao', total: 100, data: '2001-06-01' },
      { obra_id: 'b', etapa: '01_material', total: 120, data: '2001-06-01' },
      { obra_id: 'b', etapa: '', total: 25, data: '2001-06-01' },
      { obra_id: 'arquivo', etapa: '01_material', total: 60, data: '2001-06-01' },
      { obra_id: 'office', etapa: '03_alimentacao', total: 40, data: '2001-06-01' },
      { obra_id: 'office', etapa: '07_combustivel', total: 50, data: '2001-06-01' },
      { obra_id: 'office', etapa: '01_material', total: 200, data: '2001-06-01' },
      { obra_id: 'office', etapa: '24_imposto', total: 10, data: '2001-06-01' },
      { obra_id: 'interna-id', etapa: '24_imposto', total: 40, data: '2001-06-01' },
      { obra_id: 'interna-id', etapa: '01_material', total: 70, data: '2001-06-01' },
      { obra_id: 'qa', etapa: '24_imposto', total: 99999, data: '2001-06-01' },
      { obra_id: 'office', nota_id: 'nf-equivalente', descricao: '000123 - AGUA MINERAL', etapa: 'material', total: 30, data: '2001-07-01' }],
    contasPagar: [
      { id: 'avulsa', status: 'pago', valor: 100, data_pagamento: '2001-06-01' },
      { id: 'fallback-data', status: 'pago', valor: 30, data_vencimento: '2001-07-01' },
      { id: 'nf-estoque', status: 'pago', valor: 500, data_pagamento: '2001-06-01', nota_id: 'nf-estoque', nota_ref: '10' },
      { id: 'nf-legada', status: 'pago', descricao: 'GASOLINA', valor: 50, data_pagamento: '2001-06-01', nota_id: 'nf-office', nota_ref: '11' },
      { id: 'nf-duplicada', status: 'pago', descricao: 'ÁGUA MINERAL', valor: 30, data_pagamento: '2001-06-01', nota_id: 'nf-equivalente', nota_ref: '12' },
      { id: 'nf-pagamento', status: 'pago', descricao: 'NF 13 - FORNECEDOR', valor: 900, data_pagamento: '2001-06-01', nota_id: 'nf-office', nota_ref: '13' },
      { id: 'nf-marcada', status: 'pago', tipo: 'despesa_operacional_nf', valor: 25, data_pagamento: '2001-06-01', nota_id: 'nf-office', nota_ref: '14' },
      { id: 'nf-so-ref', status: 'pago', valor: 700, data_pagamento: '2001-06-01', nota_ref: '15' },
      { id: 'reembolso', status: 'pago', tipo: 'reembolso_fornecedor', valor: 200, data_pagamento: '2001-06-01' },
      { id: 'pendente', status: 'pendente', valor: 77, data_vencimento: '2001-06-01' },
      { id: 'cancelada', status: 'cancelado', valor: 90, data_vencimento: '2001-06-01' },
      { id: 'por-obra', obra_id: 'a', status: 'pago', valor: 333, data_pagamento: '2001-06-01' }],
    notas: [{ id: 'nf-estoque', obra: 'Casa QA Cliente A' }, { id: 'nf-office', destino: 'QA - ESCRITÓRIO' }, { id: 'nf-equivalente', obra: 'QA - ESCRITORIO' }]
  };
}

function carregar(codigo, snapshot = foto()) {
  const chamadas = [];
  const env = { window: { OBRAS_INTERNAS: simples(snapshot.OBRAS_INTERNAS) }, console,
    obras: simples(snapshot.obras), obrasArquivadas: simples(snapshot.obrasArquivadas || []),
    lancamentos: simples(snapshot.lancamentos), repassesCef: simples(snapshot.repasses), obrasAdicionais: simples(snapshot.adicionais),
    adicionaisPgtos: simples(snapshot.pagamentosAdicionais), notas: simples(snapshot.notas),
    sbGet: async (...args) => { chamadas.push(args); return simples(snapshot.contasPagar.filter(c => c.status === 'pago' && !c.obra_id)); }
  };
  vm.createContext(env); vm.runInContext(codigo, env);
  return { env, modulo: env.window.DREModule, chamadas };
}

test('DRE contexto: todos os resultados equivalem ao motor bb463bb por obra, consolidado, overhead e períodos', async () => {
  const snapshot = foto(), base = carregar(anterior, snapshot), novo = carregar(atual, snapshot);
  await base.modulo.garantirContasAdmin(); await novo.modulo.garantirContasAdmin();
  const leitura = novo.modulo.criarContextoLeitura(snapshot);
  for (const per of [undefined, '', '2001-06', '2001-07', '2001-08']) {
    assert.deepEqual(simples(leitura.calcGerencialConsolidado(per)), simples(base.modulo.calcGerencialConsolidado(per)));
    assert.deepEqual(simples(novo.modulo.calcGerencialConsolidado(per)), simples(base.modulo.calcGerencialConsolidado(per)));
    assert.deepEqual(simples(leitura.calcGerencialOverhead(per)), simples(base.modulo.calcGerencialOverhead(per)));
    for (const id of ['a', 'b', 'arquivo', 'qa', 'office', 'interna-id', 'ausente']) {
      assert.deepEqual(simples(leitura.calcGerencialPorObra(id, per)), simples(base.modulo.calcGerencialPorObra(id, per)));
    }
  }
  assert.deepEqual(simples(leitura.listarObrasReais()), simples(base.modulo.listarObrasReais()));
  assert.equal(leitura.calcGerencialConsolidado('2001-06').despAdmin, 175);
  assert.equal(leitura.calcGerencialConsolidado('2001-07').despAdmin, 30);
  assert.equal(leitura.calcGerencialPorObra('a', '2001-06').recAdic, 230, 'Recebimento de adicional cancelado preserva a regra vigente');
});

test('DRE contexto: imposto real maior e menor que estimativa preserva a escolha vigente', async () => {
  for (const imposto of [0, 1000]) {
    const snapshot = foto(); snapshot.lancamentos.push({ obra_id: 'office', etapa: '24_imposto', total: imposto, data: '2001-06-15' });
    const base = carregar(anterior, snapshot), novo = carregar(atual, snapshot);
    await base.modulo.garantirContasAdmin();
    const leitura = novo.modulo.criarContextoLeitura(snapshot);
    assert.deepEqual(simples(leitura.calcGerencialConsolidado('2001-06')), simples(base.modulo.calcGerencialConsolidado('2001-06')));
    assert.equal(leitura.calcGerencialConsolidado('2001-06').impostoEst, imposto === 0);
    assert.equal(novo.chamadas.length, 0);
  }
});

test('DRE contexto: cópia privada não lê globals, cache administrativo ou backend após criar', async () => {
  const snapshot = foto(), novo = carregar(atual), leitura = novo.modulo.criarContextoLeitura(snapshot);
  const resultado = simples(leitura.calcGerencialConsolidado());
  const obra = simples(leitura.calcGerencialPorObra('a'));
  const overhead = simples(leitura.calcGerencialOverhead());
  snapshot.repasses[0].valor = 999999; snapshot.contasPagar[0].valor = 999999;
  snapshot.obras[0].area_m2 = 999999; snapshot.lancamentos.splice(0); snapshot.notas[1].destino = 'Outra empresa'; snapshot.OBRAS_INTERNAS.splice(0);
  for (const nome of ['obras', 'obrasArquivadas', 'lancamentos', 'repassesCef', 'obrasAdicionais', 'adicionaisPgtos', 'notas', 'sbGet']) {
    Object.defineProperty(novo.env, nome, { configurable: true, get() { throw Error('Leitura viva proibida: ' + nome); } });
  }
  Object.defineProperty(novo.env.window, 'OBRAS_INTERNAS', { get() { throw Error('Internas vivas proibidas'); } });
  assert.deepEqual(simples(leitura.calcGerencialConsolidado()), resultado);
  assert.deepEqual(simples(leitura.calcGerencialPorObra('a')), obra);
  assert.deepEqual(simples(leitura.calcGerencialOverhead()), overhead);
  assert.deepEqual(simples(leitura.listarObrasReais()).map(o => o.id), ['a', 'b', 'arquivo', 'sem-mov']);
  assert.equal(novo.chamadas.length, 0);
  assert.equal(Object.isFrozen(leitura), true);
  const expostas = leitura.listarObrasReais();
  assert.throws(() => { expostas[0].area_m2 = 123; }, TypeError);
  expostas.splice(0);
  assert.deepEqual(simples(leitura.calcGerencialConsolidado()), resultado);
});

test('DRE contexto: duas fotos independentes não contaminam chamadas legadas nem omitem despesa admin', async () => {
  const novo = carregar(atual), a = foto(), b = foto();
  b.repasses = [{ obra_id: 'a', valor: 5, data_credito: '2001-06-01' }]; b.contasPagar = [{ status: 'pago', valor: 999, data_pagamento: '2001-06-01' }];
  const ca = novo.modulo.criarContextoLeitura(a), cb = novo.modulo.criarContextoLeitura(b);
  assert.equal(novo.modulo.calcGerencialConsolidado('2001-06').despAdmin, 0, 'Cache legado mantém seu contrato antes de carregar');
  assert.equal(ca.calcGerencialConsolidado('2001-06').despAdmin, 175);
  assert.equal(cb.calcGerencialConsolidado('2001-06').despAdmin, 999);
  await novo.modulo.garantirContasAdmin(); await novo.modulo.garantirContasAdmin();
  assert.deepEqual(novo.chamadas, [['contas_pagar', '?status=eq.pago&obra_id=is.null&order=data_pagamento.desc']]);
  assert.deepEqual(simples(novo.modulo.calcGerencialConsolidado('2001-06')), simples(ca.calcGerencialConsolidado('2001-06')));
  assert.equal(cb.calcGerencialConsolidado('2001-06').despAdmin, 999);
  novo.env.repassesCef.push({ obra_id: 'a', valor: 17, data_credito: '2001-06-03' });
  assert.equal(novo.modulo.calcGerencialPorObra('a', '2001-06').recMed, ca.calcGerencialPorObra('a', '2001-06').recMed + 17);
});

test('DRE contexto: snapshot vazio explícito calcula zero e obras arquivadas separadas são opcionais', () => {
  const novo = carregar(atual), snapshot = { obras: [], lancamentos: [], repasses: [], adicionais: [], pagamentosAdicionais: [], contasPagar: [], notas: [], OBRAS_INTERNAS: [] };
  const leitura = novo.modulo.criarContextoLeitura(snapshot);
  assert.equal(leitura.calcGerencialConsolidado().resultado, 0);
  assert.equal(leitura.calcGerencialPorObra('ausente').margem, 0);
  assert.equal(leitura.calcGerencialOverhead(), null);
  assert.deepEqual(simples(leitura.listarObrasReais()), []);
  const completa = foto(), juntas = foto(); juntas.obras.push(...juntas.obrasArquivadas); delete juntas.obrasArquivadas;
  assert.deepEqual(simples(novo.modulo.criarContextoLeitura(juntas).calcGerencialConsolidado()), simples(novo.modulo.criarContextoLeitura(completa).calcGerencialConsolidado()));
});

test('DRE contexto: fonte ausente/inválida nunca usa globals como fallback nem consulta backend', () => {
  const novo = carregar(atual);
  for (const campo of ['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais', 'contasPagar', 'notas', 'OBRAS_INTERNAS']) {
    for (const valor of [undefined, null, {}]) {
      const snapshot = foto(); snapshot[campo] = valor;
      assert.throws(() => novo.modulo.criarContextoLeitura(snapshot), new RegExp('array explicito: ' + campo));
    }
  }
  for (const valor of [null, [], 'snapshot']) assert.throws(() => novo.modulo.criarContextoLeitura(valor), /Snapshot DRE deve ser um objeto/);
  const invalida = foto(); invalida.obrasArquivadas = null;
  assert.throws(() => novo.modulo.criarContextoLeitura(invalida), /array explicito: obrasArquivadas/);
  assert.equal(novo.chamadas.length, 0);
});

test('DRE contexto: rejeita registros incompletos e dados não serializáveis em vez de resultado silencioso', () => {
  const novo = carregar(atual);
  for (const valor of [null, 12, []]) {
    const snapshot = foto(); snapshot.contasPagar.push(valor);
    assert.throws(() => novo.modulo.criarContextoLeitura(snapshot), /exige registros: contasPagar/);
  }
  const idInvalido = foto(); idInvalido.OBRAS_INTERNAS = [{}];
  assert.throws(() => novo.modulo.criarContextoLeitura(idInvalido), /OBRAS_INTERNAS deve conter IDs/);
  for (const valor of [NaN, Infinity, 1n, () => 5, new Date()]) {
    const snapshot = foto(); snapshot.repasses[0].valor = valor;
    assert.throws(() => novo.modulo.criarContextoLeitura(snapshot), /dados simples, finitos e sem ciclos/);
  }
  const ciclica = foto(); ciclica.obras[0].meta = ciclica.obras[0];
  assert.throws(() => novo.modulo.criarContextoLeitura(ciclica), /dados simples, finitos e sem ciclos/);
  assert.equal(novo.chamadas.length, 0);
});
