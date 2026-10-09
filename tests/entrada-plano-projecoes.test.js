'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Projecoes = require('../js/edr-v2-entrada-plano-projecoes.js');
const Entrada = require('../js/edr-v2-entrada-cliente.js');
const Modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const Dados = require('../js/edr-v2-visao-financeira-dados.js');
const COMPANY = 'tenant-teste', ACTOR = 'ator-teste';
const obra = () => ({ id: 'obra-a', company_id: COMPANY, nome: 'Casa A', valor_venda: '100000.00', contrato_entrada: '10000.00', entrada_paga: false });
const resumo = (campos = {}) => ({ company_id: COMPANY, planos: [{ obra_id: 'obra-a', plano_id: 'plano-a', revisao: 3,
  original_centavos: 1000000, total_centavos: 1120000, cancelado_centavos: 30000, stage: 'confirmed',
  unlinked_centavos: 0, saldo_centavos: 620000, pendencia_conciliacao: false,
  parcelas: [{ id: 'parcela-a', label: 'Entrada A', due: null, method: '', remaining: 620000 }], ...campos }] });
const base = (planos = resumo()) => ({ companyId: COMPANY, company_id: COMPANY, obras: [obra()], lancamentos: [],
  repasses: [{ id: 'rec-a', obra_id: 'obra-a', company_id: COMPANY, tipo: 'entrada', valor: '5000.00', data_credito: '2026-09-04' }],
  adicionais: [], pagamentosAdicionais: [], planosEntrada: planos, fontes: { planosEntrada: { status: 'confirmada' } },
  ledger: { status: 'confirmada', estado: { company_id: COMPANY, contas: [{ id: 'b', codigo: 'banco', nome: 'Banco', saldo_centavos: 12345 }], total_centavos: 12345 } } });
function loader(carregarPlanosEntrada) {
  let identidade = { company_id: COMPANY, ator_id: ACTOR, perfil: 'admin' };
  const dados = Dados.criar({ obterIdentidade: () => identidade, obterPagina: async () => [], carregarPlanosEntrada,
    carregarLedger: async () => ({ company_id: COMPANY, contas: [], movimentos: [], pagamentos: [], total_centavos: 0 }),
    criarDre: () => ({ calcGerencialPorObra() { return {}; }, calcGerencialConsolidado() { return {}; } }) });
  return { dados, trocar: v => { identidade = v; } };
}
test('projeção soma delta líquido aprovado preservando contrato e valor de venda', () => {
  const o = obra(), before = JSON.stringify(o), r = Projecoes.projetar(o, resumo());
  assert.equal(r.originalCentavos, 1000000); assert.equal(r.ajusteCentavos, 120000);
  assert.equal(r.totalCentavos, 1120000); assert.equal(r.carteiraCentavos, 10120000);
  assert.equal(r.canceladoCentavos, 30000); assert.equal(JSON.stringify(o), before);
});
test('desconto final aprovado reduz carteira sem movimentar saldo ou fabricar custo', () => {
  const s = base(resumo({ total_centavos: 950000, parcelas: [{ id: 'p', label: 'Entrada', due: null, method: '', remaining: 450000 }] }));
  const result = Modelo.construir(s);
  assert.equal(result.totais.ajusteEntradaCentavos, -50000);
  assert.equal(result.totais.contratoOriginalCentavos, 10000000);
  assert.equal(result.totais.contratoPrevistoCentavos, 9950000);
  assert.equal(result.totais.pendenteContratoCentavos, 9450000);
  assert.equal(result.totais.recebidoPeriodoCentavos, 500000);
  assert.equal(result.totais.custoPeriodoCentavos, 0);
  assert.equal(result.saldo.totalCentavos, 12345);
});
test('estorno entra pelo repasse negativo uma vez e ajuste não vira receita', () => {
  const s = base(); s.repasses.push({ id: 'est-a', company_id: COMPANY, obra_id: 'obra-a', tipo: 'entrada', valor: '-1000.00', data_credito: '2026-10-08' });
  const pos = Entrada.calcular(obra(), s.repasses, s.planosEntrada), result = Modelo.construir(s);
  assert.equal(pos.recebido, 4000); assert.equal(pos.pendente, 7200);
  assert.equal(result.totais.recebidoAcumuladoCentavos, 400000); assert.equal(result.totais.contratoPrevistoCentavos, 10120000);
});
test('selo usa centavos determinísticos e recebimento malformado não vira zero', () => {
  const o = { ...obra(), contrato_entrada: '0.07' }, rs = [{ obra_id: o.id, tipo: 'entrada', valor: '0.01' }, { obra_id: o.id, tipo: 'entrada', valor: '0.06' }];
  const r = Entrada.calcular(o, rs, { company_id: COMPANY, planos: [] });
  assert.equal(r.recebido, 0.07); assert.equal(r.pendente, 0); assert.equal(r.excedente, 0); assert.equal(r.quitada, true);
  for (const recs of [null, [{ obra_id: o.id, tipo: 'entrada', valor: 'quebrado' }]]) {
    const bad = Entrada.calcular(o, recs, { company_id: COMPANY, planos: [] }); assert.equal(bad.recebido, null); assert.equal(bad.pendente, null); assert.equal(bad.status, 'indisponivel');
  }
});
test('somente resumo vazio confirmado autoriza delta zero; fonte ausente ou falha fica desconhecida', () => {
  const s = base({ company_id: COMPANY, planos: [] });
  assert.equal(Modelo.construir(s).totais.ajusteEntradaCentavos, 0);
  assert.equal(Entrada.calcular(obra(), s.repasses, s.planosEntrada).pendente, 5000);
  for (const q of [null, { company_id: 'outra', planos: [] }, { company_id: COMPANY, planos: null }]) {
    const bad = base(q), result = Modelo.construir(bad), pos = Entrada.calcular(obra(), bad.repasses, q);
    assert.equal(result.totais.ajusteEntradaCentavos, null); assert.equal(result.totais.carteiraCentavos, null);
    assert.equal(result.totais.recebidoPeriodoCentavos, 500000); assert.equal(result.saldo.totalCentavos, 12345);
    assert.equal(pos.status, 'indisponivel'); assert.equal(pos.pendente, null);
  }
  s.fontes.planosEntrada.status = 'indisponivel'; assert.equal(Modelo.construir(s).totais.ajusteEntradaCentavos, null);
});
test('resumo recusa outra empresa, duplicados, proposta, centavos inválidos e data impossível', () => {
  assert.throws(() => Projecoes.validarResumo(resumo(), 'outra'));
  const duplicado = resumo(); duplicado.planos.push(duplicado.planos[0]); assert.throws(() => Projecoes.validarResumo(duplicado, COMPANY));
  for (const r of [resumo({ stage: 'requested' }), resumo({ revisao: 0 }), resumo({ total_centavos: 1.2 }),
    resumo({ parcelas: [{ id: 'p', label: 'Parcela', due: '2026-02-29', method: '', remaining: 1 }] })]) assert.throws(() => Projecoes.validarResumo(r, COMPANY));
});
test('previsões usam somente saldo da parcela, mantêm data null e substituem avulsas por obra e tipo', () => {
  const avulsas = [
    { id: 'legada', company_id: COMPANY, tipo: 'entrada_cliente', obra_id: 'obra-a', valor: 10000, data_prevista: '2026-11-01' },
    { id: 'cef', company_id: COMPANY, tipo: 'repasse_cef', obra_id: 'obra-a', valor: 100, data_prevista: '2026-11-01' },
    { id: 'outra', company_id: COMPANY, tipo: 'entrada_cliente', obra_id: 'obra-b', valor: 100, data_prevista: '2026-11-01' }
  ];
  const r = Projecoes.previstas(resumo(), COMPANY, avulsas);
  assert.equal(r.parcelas.length, 1); assert.equal(r.parcelas[0].valor_centavos, 620000); assert.equal(r.parcelas[0].data_prevista, null);
  assert.deepEqual(r.avulsas.map(p => p.id), ['cef', 'outra']); assert.deepEqual(r.substituidas.map(p => p.id), ['legada']);
  assert.equal(Projecoes.previstas(null, COMPANY, avulsas).parcelas, null);
});
test('recebimento antigo sem vínculo suprime previsão da obra mesmo com soma líquida zero', () => {
  for (const unlinked_centavos of [500000, 0]) {
    const r = Projecoes.previstas(resumo({ unlinked_centavos, pendencia_conciliacao: true }), COMPANY, []);
    assert.deepEqual(r.parcelas, []); assert.equal(r.conciliacao.length, 1); assert.equal(r.conciliacao[0].saldo_centavos, 620000);
    assert.equal(Projecoes.projetar(obra(), resumo({ unlinked_centavos, pendencia_conciliacao: true })).carteiraCentavos, 10120000);
  }
});
test('loader recebe plano como fonte independente e falha não contamina saldo nem DRE registrada', async () => {
  const ok = await loader(async () => ({ company_id: COMPANY, planos: [] })).dados.carregar();
  assert.equal(ok.fontes.planosEntrada.status, 'confirmada'); assert.equal(ok.dominios.recebiveis.status, 'confirmada');
  for (const carregar of [async () => { throw new Error('falha'); }, async () => ({ company_id: 'outra', planos: [] })]) {
    const s = await loader(carregar).dados.carregar();
    assert.equal(s.fontes.planosEntrada.status, 'indisponivel'); assert.equal(s.planosEntrada, null);
    assert.equal(s.dominios.recebiveis.status, 'parcial'); assert.equal(s.fontes.ledger.status, 'confirmada'); assert.equal(s.dre.status, 'confirmada');
  }
});
test('resposta de plano após troca de ator é recusada pelo loader', async () => {
  let soltar; const aguardo = new Promise(resolve => { soltar = resolve; });
  const a = loader(async () => { await aguardo; return resumo(); }), p = a.dados.carregar();
  a.trocar({ company_id: COMPANY, ator_id: 'outro', perfil: 'admin' }); soltar();
  await assert.rejects(p, e => e.code === 'LEITURA_OBSOLETA');
});
test('cache navegador recusa resposta atrasada, falha e identidade posterior', async () => {
  let soltar, chamadas = 0; const wait = new Promise(resolve => { soltar = resolve; });
  const ctx = { _companyId: COMPANY, _supabaseToken: 'sessao-fixture', usuarioAtual: { id: ACTOR, perfil: 'admin' },
    sbRpcEstoque: async () => { chamadas++; await wait; return { ok: true, dados: resumo() }; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-entrada-plano-projecoes.js'), 'utf8'), ctx);
  const p = ctx.EntradaPlanoProjecoes.carregar(); ctx.usuarioAtual = { id: 'outro', perfil: 'admin' }; soltar();
  assert.equal(await p, null); assert.equal(ctx.EntradaPlanoProjecoes.atual(), null); assert.equal(chamadas, 1);
  ctx.sbRpcEstoque = async () => ({ ok: true, dados: resumo() });
  assert.ok(await ctx.EntradaPlanoProjecoes.carregar());
  ctx._companyId = 'outra'; assert.equal(ctx.EntradaPlanoProjecoes.atual(), null);
});