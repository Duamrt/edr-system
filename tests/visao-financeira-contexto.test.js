'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const { construir } = require('../js/edr-v2-visao-financeira-contexto.js');
const COMPANY = 'tenant-sintetico';
function registro(id, more) { return { id, company_id: COMPANY, ...more }; }
function movimento(id, tipo, valor, data, more) {
  return { id, operacao_id: 'op-' + id, tipo, valor_centavos: valor, data_efetiva: data,
    afeta_saldo: true, cancelado_em: null, decisao_corte: 'apos_corte', conta_id: 'banco',
    destino_id: null, descricao: 'Movimento sintetico', ...more };
}
function snapshot() {
  const s = {
    companyId: COMPANY, company_id: COMPANY,
    planosEntrada: { status: 'confirmada', company_id: COMPANY, planos: [] },
    obras: [registro('a', { nome: 'Casa A', valor_venda: 1000, area_m2: 50, arquivada: false }),
      registro('b', { nome: 'Casa B', valor_venda: 2000, area_m2: 80, arquivada: true })],
    lancamentos: [registro('l1', { obra_id: 'a', total: 100, data: '2026-09-15', etapa: '28_mao', obs: null }),
      registro('l2', { obra_id: 'a', total: 150, data: '2026-10-05', etapa: '02_aco', obs: null })],
    repasses: [registro('r1', { obra_id: 'a', valor: 100, data_credito: '2026-09-10' }),
      registro('r2', { obra_id: 'a', valor: 200, data_credito: '2026-10-10' })],
    adicionais: [registro('ad1', { obra_id: 'a', valor: 100, status: 'aprovado' })],
    pagamentosAdicionais: [registro('p1', { adicional_id: 'ad1', valor: 50, data: '2026-09-20' }),
      registro('p2', { adicional_id: 'ad1', valor: 25, data: '2026-10-20' })],
    contasPagar: [
      registro('cp1', { obra_id: 'a', valor: 4, status: 'pendente', tipo: 'avulsa', data_vencimento: '2026-09-01' }),
      registro('cp2', { obra_id: 'a', valor: 1, status: 'pago', tipo: 'avulsa' }),
      registro('cp3', { obra_id: 'a', valor: 2, status: 'cancelado', tipo: 'avulsa' }),
      registro('cp4', { obra_id: 'a', valor: 3, status: 'pendente', tipo: 'reembolso_fornecedor' }),
      registro('cp5', { obra_id: 'b', valor: 9, status: 'pendente', tipo: 'avulsa' }),
      registro('cp6', { obra_id: null, valor: 10, status: 'pendente', tipo: 'avulsa' })
    ],
    fontes: Object.fromEntries(['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais',
      'contasPagar', 'dre', 'ledger'].map(n => [n, { status: 'confirmada' }])),
    dre: {
      status: 'confirmada',
      calcGerencialPorObra: (oid, periodo) => ({ cMao: oid === 'a' ? 40.10 : 10, cMat: oid === 'a' ? 60.20 : 20,
        cTerr: 999, cDesp: 777, custoConstr: oid === 'a' ? 100.30 : 30, periodo }),
      calcGerencialConsolidado: periodo => ({ recBruta: 225, imposto: 13.50, resultado: 111.20, periodo })
    }
  };
  s.ledger = { status: 'confirmada', estado: { company_id: COMPANY, total_centavos: 15950,
    contas: [
      { id: 'banco', codigo: 'banco', nome: 'Banco sintetico', abertura_centavos: 10000, saldo_centavos: 10050, corte_em: '2026-09-01T12:00:00Z', fuso: 'America/Sao_Paulo' },
      { id: 'dinheiro', codigo: 'dinheiro', nome: 'Dinheiro sintetico', abertura_centavos: 5000, saldo_centavos: 5900, corte_em: '2026-09-01T12:00:00Z', fuso: 'America/Sao_Paulo' }
    ],
    movimentos: [
      movimento('m0', 'entrada', 500, '2026-09-10'),
      movimento('m1', 'entrada', 1000, '2026-10-10', { criado_em: '2026-11-01T10:00:00Z' }),
      movimento('m2', 'saida', 200, '2026-10-11'),
      movimento('m3', 'pagamento', 350, '2026-10-12', { conta_pagar_id: 'cp1' }),
      movimento('m4', 'transferencia', 900, '2026-10-13', { destino_id: 'dinheiro' }),
      movimento('m5', 'entrada', 999, '2026-10-15', { cancelado_em: '2026-10-16T10:00:00Z', afeta_saldo: false }),
      movimento('m6', 'saida', 999, '2026-10-01', { afeta_saldo: false, decisao_corte: 'incluido_abertura' })
    ],
    pagamentos: [
      { conta_pagar_id: 'cp1', pago_centavos: 150, restante_centavos: 250 },
      { conta_pagar_id: 'cp2', pago_centavos: 100, restante_centavos: 0 },
      { conta_pagar_id: 'cp3', pago_centavos: 0, restante_centavos: 0 },
      { conta_pagar_id: 'cp5', pago_centavos: 100, restante_centavos: 800 },
      { conta_pagar_id: 'cp6', pago_centavos: 0, restante_centavos: 1000 }
    ] } };
  return s;
}
function envelope(s = snapshot(), filtro = { periodo: '2026-10', situacao: 'ativas' }) {
  const f = modelo.normalizarFiltro(filtro);
  return { fase: 'pronta', snapshot: s, visao: modelo.construir(s, f), filtro: f,
    folha: { cobertura: 'confirmada', estado: 'sem_pendencia_identificada', comprovaPagamento: false } };
}
function congelar(v) { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; }

test('contexto pronto tem campos acordados e acumulada com mesma obra/situacao', () => {
  const c = construir(envelope());
  assert.equal(c.periodoNome, 'Outubro de 2026');
  assert.strictEqual(c.obras, c.visao.obras);
  assert.strictEqual(c.totais, c.visao.totais);
  assert.strictEqual(c.snapshot, c.envelope.snapshot);
  assert.equal(c.totais.recebidoPeriodoCentavos, 22500);
  assert.equal(c.acumulada.totais.recebidoPeriodoCentavos, 37500);
  assert.equal(c.acumulada.totais.custoPeriodoCentavos, 25000);
  assert.equal(c.acumulada.filtro.periodo, '');
  assert.equal(c.acumulada.filtro.situacao, 'ativas');
  assert.equal(c.folha.comprovaPagamento, false);
});

test('fases inicial/carregando/erro/invalidada e envelope nulo nao produzem contexto', () => {
  for (const fase of ['inicial', 'carregando', 'erro', 'invalidada']) assert.equal(construir({ ...envelope(), fase }), null);
  assert.equal(construir(null), null);
  assert.equal(construir({ fase: 'pronta' }), null);
});

test('envelope de outra empresa, aliases divergentes e filtro obsoleto sao rejeitados', () => {
  const e = envelope(); e.visao.companyId = 'outro-tenant';
  assert.equal(construir(e), null);
  const a = envelope(); a.snapshot.company_id = 'outro-tenant';
  assert.equal(construir(a), null);
  const b = envelope(); b.filtro.periodo = '2026-09';
  assert.equal(construir(b), null);
});

test('periodo invalido nao vira acumulado ou mes atual e nome usa calendario civil', () => {
  const e = envelope(); e.filtro.periodo = '2026-13';
  assert.equal(construir(e), null);
  assert.equal(construir(envelope(snapshot(), { periodo: '2026-03' })).periodoNome, 'Março de 2026');
  assert.equal(construir(envelope(snapshot(), { periodo: '' })).periodoNome, 'Acumulado');
});

test('custo DRE soma cMao/cMat selecionados em centavos sem terreno/despesas', () => {
  const c = construir(envelope());
  assert.deepEqual(c.custoDre, { status: 'confirmada', escopo: 'obras_selecionadas_periodo',
    maoCentavos: 4010, materialServicosCentavos: 6020, totalCentavos: 10030 });
  const arq = construir(envelope(snapshot(), { periodo: '2026-10', situacao: 'arquivadas' }));
  assert.equal(arq.custoDre.totalCentavos, 3000);
  const todas = construir(envelope(snapshot(), { periodo: '2026-10', situacao: 'todas' }));
  assert.equal(todas.custoDre.totalCentavos, 13030);
  assert.equal(c.visao.dre.empresa.dados.resultado, 111.20);
});

test('DRE indisponivel ou campo invalido permanece desconhecido, nao zero', () => {
  const s = snapshot(); s.dre.status = 'indisponivel';
  assert.equal(construir(envelope(s)).custoDre.totalCentavos, null);
  const e = envelope(); e.visao.obras[0].dre.dados.cMat = null;
  const c = construir(e);
  assert.equal(c.custoDre.maoCentavos, 4010);
  assert.equal(c.custoDre.materialServicosCentavos, null);
  assert.equal(c.custoDre.totalCentavos, null);
  assert.equal(c.custoDre.status, 'parcial');
});

test('selecao vazia confirma zero de custo apenas com engine confirmado', () => {
  const e = envelope(snapshot(), { obraId: 'b', situacao: 'ativas' });
  assert.equal(construir(e).custoDre.totalCentavos, 0);
  e.snapshot.dre.status = 'indisponivel';
  assert.equal(construir(e).custoDre.totalCentavos, null);
});

test('obrigacoes usam restante parcial e escopo atual da obra, sem filtro vencimento', () => {
  const c = construir(envelope());
  assert.equal(c.obrigacoes.status, 'confirmada');
  assert.equal(c.obrigacoes.escopo, 'obras_selecionadas_atual');
  assert.equal(c.obrigacoes.totalCentavos, 250);
  assert.equal(c.obrigacoes.rows.length, 1);
  assert.equal(c.obrigacoes.rows[0].id, 'cp1');
  assert.equal(c.obrigacoes.rows[0].valor, 4);
  assert.equal(c.obrigacoes.rows[0].restanteCentavos, 250);
  assert.equal(c.obrigacoes.rows[0].restante_centavos, 250);
  assert.equal(c.obrigacoes.rows[0].pagoCentavos, 150);
  assert.equal(c.obrigacoes.rows[0].data_vencimento, '2026-09-01');
  assert.equal(c.visao.saldo.totalCentavos, 15950);
});

test('arquivadas/todas mudam obrigacoes sem incluir gerais ou reembolsos', () => {
  const s = snapshot();
  assert.equal(construir(envelope(s, { situacao: 'arquivadas' })).obrigacoes.totalCentavos, 800);
  assert.equal(construir(envelope(s, { situacao: 'todas' })).obrigacoes.totalCentavos, 1050);
  assert.equal(construir(envelope(s, { obraId: 'a', situacao: 'todas' })).obrigacoes.totalCentavos, 250);
});

test('falha de contas, ledger ou mapeamento restante nao usa valor integral nem zero', () => {
  const s = snapshot(); s.fontes.contasPagar.status = 'indisponivel';
  const c = construir(envelope(s));
  assert.equal(c.obrigacoes.status, 'indisponivel');
  assert.equal(c.obrigacoes.totalCentavos, null);
  assert.equal(c.obrigacoes.rows, null);
  assert.equal(c.ledger.entradasCentavos, 1000);
  const a = snapshot(); a.ledger.estado.pagamentos = a.ledger.estado.pagamentos.filter(p => p.conta_pagar_id !== 'cp1');
  assert.equal(construir(envelope(a)).obrigacoes.totalCentavos, null);
  const b = snapshot(); b.fontes.ledger.status = 'indisponivel';
  assert.equal(construir(envelope(b)).obrigacoes.totalCentavos, null);
  assert.equal(construir(envelope(b)).ledger.entradasCentavos, null);
});

test('ledger de outro tenant ou restantes negativos/duplicados nao confirmam obrigacoes', () => {
  const a = snapshot(); a.ledger.estado.company_id = 'outro-tenant';
  assert.equal(construir(envelope(a)).obrigacoes.status, 'indisponivel');
  assert.equal(construir(envelope(a)).ledger.status, 'indisponivel');
  const b = snapshot(); b.ledger.estado.pagamentos[0].restante_centavos = -1;
  assert.equal(construir(envelope(b)).obrigacoes.totalCentavos, null);
  const c = snapshot(); c.ledger.estado.pagamentos.push({ ...c.ledger.estado.pagamentos[0] });
  assert.equal(construir(envelope(c)).obrigacoes.totalCentavos, null);
});

test('ledger filtra data efetiva, exclui cancelados/abertura e preserva transferencia vinculada', () => {
  const c = construir(envelope());
  assert.equal(c.ledger.status, 'confirmada');
  assert.equal(c.ledger.escopo, 'empresa_periodo_prospectivo');
  assert.equal(c.ledger.entradasCentavos, 1000);
  assert.equal(c.ledger.saidasCentavos, 550);
  assert.equal(c.ledger.variacaoCentavos, 450);
  assert.deepEqual(c.ledger.movimentos.map(m => m.id), ['m1', 'm2', 'm3', 'm4']);
  assert.equal(c.ledger.movimentos.at(-1).destino_id, 'dinheiro');
  assert.equal(c.ledger.coberturaTemporal, 'confirmada');
});

test('transferencias de entrada/saida nao inflam movimentos externos ou variacao', () => {
  const s = snapshot();
  s.ledger.estado.movimentos = [
    movimento('tx-in', 'transferencia_in', 300, '2026-10-01', { conta_id: 'dinheiro', destino_id: 'banco' }),
    movimento('tx-out', 'transferencia_out', 300, '2026-10-01', { destino_id: 'dinheiro' }),
    movimento('taxa', 'saida', 5, '2026-10-01')
  ];
  const c = construir(envelope(s));
  assert.equal(c.ledger.movimentos.length, 3);
  assert.equal(c.ledger.entradasCentavos, 0);
  assert.equal(c.ledger.saidasCentavos, 5);
  assert.equal(c.ledger.variacaoCentavos, -5);
});

test('movimentos gerais e saldo atual nao mudam com obra/situacao', () => {
  const s = snapshot();
  const a = construir(envelope(s, { periodo: '2026-10', obraId: 'a', situacao: 'ativas' }));
  const b = construir(envelope(s, { periodo: '2026-10', obraId: 'b', situacao: 'arquivadas' }));
  assert.deepEqual(a.ledger, b.ledger);
  assert.deepEqual(a.visao.saldo, b.visao.saldo);
  const acum = construir(envelope(s, { periodo: '' }));
  assert.equal(acum.ledger.entradasCentavos, 1500);
  assert.equal(acum.ledger.variacaoCentavos, 950);
  assert.equal(acum.visao.saldo.totalCentavos, 15950);
  assert.equal(acum.ledger.coberturaTemporal, 'desde_marcos_declarados');
});

test('sem abertura deixa fluxos desconhecidos, embora obrigacoes atuais sejam consultadas', () => {
  const s = snapshot(); s.ledger.estado.contas = []; s.ledger.estado.movimentos = []; s.ledger.estado.total_centavos = 0;
  const c = construir(envelope(s));
  assert.equal(c.ledger.status, 'sem_abertura');
  assert.equal(c.ledger.entradasCentavos, null);
  assert.equal(c.ledger.variacaoCentavos, null);
  assert.equal(c.visao.saldo.totalCentavos, null);
  assert.equal(c.obrigacoes.totalCentavos, 250);
});

test('mes anterior aos marcos nao fabrica zeros e mes do corte explicita cobertura parcial', () => {
  const s = snapshot();
  const anterior = construir(envelope(s, { periodo: '2026-08' }));
  assert.equal(anterior.ledger.status, 'indisponivel');
  assert.equal(anterior.ledger.coberturaTemporal, 'anterior_aos_marcos');
  assert.equal(anterior.ledger.variacaoCentavos, null);
  const corte = construir(envelope(s, { periodo: '2026-09' }));
  assert.equal(corte.ledger.coberturaTemporal, 'parcial');
  assert.equal(corte.ledger.entradasCentavos, 500);
  assert.equal(corte.visao.saldo.totalCentavos, 15950);
});

test('marco respeita fuso declarado, inclusive virada de mes UTC', () => {
  const s = snapshot();
  for (const c of s.ledger.estado.contas) c.corte_em = '2026-10-01T01:00:00Z';
  const setembro = construir(envelope(s, { periodo: '2026-09' }));
  assert.equal(setembro.ledger.marcos[0].data, '2026-09-30');
  assert.equal(setembro.ledger.coberturaTemporal, 'parcial');
  const outubro = construir(envelope(s, { periodo: '2026-10' }));
  assert.equal(outubro.ledger.coberturaTemporal, 'confirmada');
  s.ledger.estado.contas[0].fuso = 'fuso-inexistente';
  assert.equal(construir(envelope(s)).ledger.status, 'indisponivel');
});

test('data, tipo, flags ou transferencia invalidos nao confirmam fluxo zero', () => {
  for (const patch of [{ data_efetiva: '2026-10-99' }, { tipo: 'receita-guess' }, { valor_centavos: 0 }, { afeta_saldo: null },
    { tipo: 'transferencia', destino_id: 'banco' }, { decisao_corte: 'incluido_abertura' }]) {
    const s = snapshot(); Object.assign(s.ledger.estado.movimentos[1], patch);
    const c = construir(envelope(s));
    assert.equal(c.ledger.status, 'indisponivel');
    assert.equal(c.ledger.variacaoCentavos, null);
  }
});

test('overflow em custos, obrigacoes ou ledger nao perde centavos nem retorna zero', () => {
  const e = envelope();
  e.visao.obras[0].dre.dados.cMao = Number.MAX_SAFE_INTEGER;
  assert.equal(construir(e).custoDre.totalCentavos, null);
  const s = snapshot();
  s.contasPagar = ['cp1', 'cp7'].map(oid => registro(oid, { obra_id: 'a', status: 'pendente' }));
  s.ledger.estado.pagamentos = ['cp1', 'cp7'].map(oid => ({ conta_pagar_id: oid, pago_centavos: 0, restante_centavos: Number.MAX_SAFE_INTEGER }));
  assert.equal(construir(envelope(s)).obrigacoes.totalCentavos, null);
  s.ledger.estado.movimentos = ['m1', 'm2'].map(oid => movimento(oid, 'entrada', Number.MAX_SAFE_INTEGER, '2026-10-01'));
  assert.equal(construir(envelope(s)).ledger.entradasCentavos, null);
});

test('inputs congelados e mutacoes posteriores nao alteram contexto ou copias internas', () => {
  const e = envelope(), antes = JSON.stringify(e);
  const c = construir(congelar(e));
  assert.equal(Object.isFrozen(c), true);
  assert.equal(Object.isFrozen(c.envelope), true);
  assert.equal(Object.isFrozen(c.snapshot.ledger.estado.movimentos), true);
  assert.equal(Object.isFrozen(c.obrigacoes.rows[0]), true);
  assert.throws(() => { c.obrigacoes.rows[0].restanteCentavos = 999; }, TypeError);
  assert.equal(JSON.stringify(e), antes);
  const input = envelope(), separado = construir(input);
  input.snapshot.obras[0].nome = 'Nome novo';
  input.visao.totais.carteiraCentavos = 1;
  assert.equal(separado.snapshot.obras[0].nome, 'Casa A');
  assert.equal(separado.totais.carteiraCentavos, 110000);
  assert.equal(Object.isFrozen(input), false);
});

test('dados circulares nao produzem contexto de apresentacao incompleto', () => {
  const e = envelope(); e.circular = e;
  assert.equal(construir(e), null);
});

test('namespace global funciona sem DOM ou rede com dependencia modelo explicita', () => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-entrada-plano-projecoes.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-modelo.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-contexto.js'), 'utf8'), ctx);
  assert.equal(Object.isFrozen(ctx.FinanceiroVisaoContexto), true);
  const c = ctx.FinanceiroVisaoContexto.construir(envelope());
  assert.equal(c.ledger.variacaoCentavos, 450);
  const semModelo = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-contexto.js'), 'utf8'), semModelo);
  assert.equal(semModelo.FinanceiroVisaoContexto.construir(envelope()), null);
});

test('selecao desconhecida por falha de obras nao converte DRE em custo zero', () => {
  const s = snapshot(); s.fontes.obras.status = 'indisponivel';
  const c = construir(envelope(s));
  assert.equal(c.visao.status, 'indisponivel');
  assert.equal(c.custoDre.totalCentavos, null);
  assert.equal(c.obrigacoes.totalCentavos, null);
  assert.equal(c.ledger.entradasCentavos, 1000);
});

test('status pago/cancelado antigo com restante RPC positivo nao confirma obrigacoes zero', () => {
  for (const status of ['pago', 'cancelado']) {
    const s = snapshot(); s.contasPagar[0].status = status;
    const c = construir(envelope(s));
    assert.equal(c.obrigacoes.status, 'indisponivel');
    assert.equal(c.obrigacoes.totalCentavos, null);
    assert.equal(c.obrigacoes.rows, null);
    assert.equal(c.visao.saldo.totalCentavos, 15950);
  }
});

test('status pendente antigo com RPC sem restante nao reinventa obrigacao quitada ou cancelada', () => {
  const s = snapshot(); s.ledger.estado.pagamentos[0].restante_centavos = 0;
  s.ledger.estado.pagamentos[0].pago_centavos = 400;
  const c = construir(envelope(s));
  assert.equal(c.obrigacoes.status, 'confirmada');
  assert.equal(c.obrigacoes.totalCentavos, 0);
  assert.deepEqual(c.obrigacoes.rows, []);
  assert.equal(c.visao.saldo.totalCentavos, 15950);
});

test('vazios sem fonte declarada ou registros sem tenant nao confirmam novos agregados', () => {
  const s = snapshot();
  s.contasPagar = []; delete s.fontes.contasPagar;
  const c = construir(envelope(s));
  assert.equal(c.obrigacoes.totalCentavos, null);
  assert.equal(c.obrigacoes.status, 'indisponivel');
  const a = snapshot(); delete a.fontes.ledger;
  assert.equal(construir(envelope(a)).ledger.variacaoCentavos, null);
  const b = snapshot(); delete b.fontes.dre;
  assert.equal(construir(envelope(b)).custoDre.totalCentavos, null);
  const semTenant = snapshot(); delete semTenant.contasPagar[0].company_id;
  assert.equal(construir(envelope(semTenant)).obrigacoes.totalCentavos, null);
});
