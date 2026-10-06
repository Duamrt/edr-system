'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const { construir } = require('../js/edr-v2-visao-financeira-composicao.js');
const COMPANY = 'empresa-ensaio-composicao';
const registro = (id, campos) => ({ id, company_id: COMPANY, ...campos });
const FONTES = ['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais'];
function foto() {
  return {
    companyId: COMPANY, company_id: COMPANY,
    obras: [registro('a', { nome: 'Casa Sintética A', arquivada: false, area_m2: 20, valor_venda: 500 }),
      registro('b', { nome: 'Casa Sintética B', arquivada: true, area_m2: 50, valor_venda: 900 })],
    lancamentos: [
      registro('l1', { obra_id: 'a', etapa: '28_mao', total: '14.005', data: '2026-09-20' }),
      registro('l2', { obra_id: 'a', etapa: '02_aco', total: '20.005', data: '2026-10-01' }),
      registro('l3', { obra_id: 'a', etapa: '04_alvenaria', total: '0.005', data: '2026-10-02' }),
      registro('l4', { obra_id: 'a', etapa: '24_imposto', total: '5.004', data: '2026-10-03' }),
      registro('l5', { obra_id: 'a', etapa: '14_expediente', total: '2.001', data: '2026-10-04' }),
      registro('l6', { obra_id: 'a', etapa: ' 07_combustivel ', total: '-1.005', data: '2026-10-05' }),
      registro('l7', { obra_id: 'a', etapa: '35_terreno', total: 10, data: '2026-10-06' }),
      registro('l8', { obra_id: 'a', etapa: 'categoria-legada', total: 0, data: '2026-10-07' }),
      registro('l9', { obra_id: 'b', etapa: '28_mao', total: 999, data: '2026-10-01' })
    ],
    repasses: [registro('r1', { obra_id: 'a', tipo: 'pls', valor: 50, data_credito: '2026-09-01' }),
      registro('r2', { obra_id: 'a', tipo: 'entrada', valor: '100.005', data_credito: '2026-10-01' }),
      registro('r3', { obra_id: 'a', tipo: 'terreno', valor: 20, data_credito: '2026-10-02' })],
    adicionais: [registro('ad1', { obra_id: 'a', status: 'aprovado', valor: 30 }),
      registro('ad2', { obra_id: 'a', status: 'cancelado', valor: 5 }),
      registro('ad3', { obra_id: 'a', status: 'pendente', valor: 4 })],
    pagamentosAdicionais: [registro('p1', { adicional_id: 'ad1', valor: '10.005', data: '2026-10-02' }),
      registro('p2', { adicional_id: 'ad2', valor: '3.005', data: '2026-10-03' }),
      registro('p3', { adicional_id: 'ad3', valor: 0, data: '2026-10-03' })],
    fontes: Object.fromEntries(FONTES.map(n => [n, { status: 'confirmada' }]))
  };
}
function contexto(s = foto(), filtro = { periodo: '2026-10', situacao: 'ativas' }, folha) {
  const f = modelo.normalizarFiltro(filtro);
  const v = modelo.construir(s, f);
  return { snapshot: s, visao: v, obras: v.obras, filtro: f,
    envelope: { fase: 'pronta', snapshot: s, folha } };
}
function folhinha(campos) {
  return { companyId: COMPANY, filtro: modelo.normalizarFiltro({ periodo: '', situacao: 'ativas' }),
    obras: [{ obraId: 'a', estado: 'sem_pendencia_identificada', cobertura: 'confirmada', motivos: [], ...campos }] };
}
function categoria(c, id) { return c.categorias.find(x => x.id === id); }
function congelar(v) { if (v && typeof v === 'object') { Object.values(v).forEach(congelar); Object.freeze(v); } return v; }
function dre(s) {
  const env = { window: {} };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-dre.js'), 'utf8'), env);
  return env.window.DREModule.criarContextoLeitura({ obras: s.obras, lancamentos: s.lancamentos,
    repasses: s.repasses, adicionais: s.adicionais, pagamentosAdicionais: s.pagamentosAdicionais,
    contasPagar: [], notas: [], OBRAS_INTERNAS: [] });
}

test('principal usa o mesmo recebido, todos os custos e diferenca exata do modelo', () => {
  const ctx = contexto(), c = construir(ctx, 'a'), o = ctx.visao.obras[0];
  assert.equal(c.status, 'confirmada');
  assert.equal(c.recebidoCentavos, 13002);
  assert.equal(c.custoCentavos, 3601);
  assert.equal(c.resultadoCentavos, 9401);
  assert.equal(c.recebidoCentavos, o.recebidoPeriodoCentavos);
  assert.equal(c.custoCentavos, o.custoPeriodoCentavos);
  assert.equal(c.resultadoCentavos, o.diferencaRecebidoCustoCentavos);
  assert.equal(c.resultadoPct, 9401 / 13002 * 100);
  assert.equal(c.receitas.contratoCentavos, 12001);
  assert.equal(c.receitas.adicionaisCentavos, 1001);
  assert.equal(c.receitas.terrenoCentavos, 2000);
  assert.ok(c.avisos.includes('Não representa saldo em conta nem lucro final da obra.'));
});

test('linhas, categorias e subetapas fecham com total sem compensacao', () => {
  const c = construir(contexto(), 'a');
  assert.equal(c.linhas.reduce((n, l) => n + l.efeitoCentavos, 0), c.resultadoCentavos);
  assert.equal(c.categorias.reduce((n, x) => n + x.centavos, 0), c.custoCentavos);
  for (const x of c.categorias) assert.equal(x.etapas.reduce((n, e) => n + e.centavos, 0), x.centavos);
  assert.equal(categoria(c, 'material_servicos').centavos, 2002);
  assert.equal(categoria(c, 'impostos').centavos, 500);
  assert.equal(categoria(c, 'expediente').centavos, 200);
  assert.equal(categoria(c, 'combustivel').centavos, -101);
  assert.equal(categoria(c, 'terreno').centavos, 1000);
  const estorno = c.linhas.find(l => l.id === 'l6');
  assert.equal(estorno.valorCentavos, -101);
  assert.equal(estorno.efeitoCentavos, 101);
  assert.equal(estorno.etapa, '07_combustivel');
  assert.ok(categoria(c, 'material_servicos').etapas.some(e => e.id === 'categoria-legada' && e.centavos === 0));
});

test('margem da construcao explicita terreno, operacionais e elegibilidade diferente de adicionais', () => {
  const c = construir(contexto(), 'a'), m = c.margemConstrucao;
  assert.equal(m.recebidoCentavos, 11303);
  assert.equal(m.custoCentavos, 2002);
  assert.equal(m.resultadoCentavos, 9301);
  assert.equal(m.recebimentoTerrenoCentavos, 2000);
  assert.equal(m.adicionaisForaCarteiraCentavos, 301);
  assert.deepEqual(m.exclusoes.map(x => x.id), ['impostos', 'expediente', 'combustivel', 'terreno']);
  assert.equal(m.resultadoCentavos + m.recebimentoTerrenoCentavos - m.adicionaisForaCarteiraCentavos -
    m.exclusoes.reduce((n, x) => n + x.centavos, 0), c.resultadoCentavos);
  assert.ok(!c.linhas.some(l => ['p2', 'p3'].includes(l.id)));
});

test('centavos fracionados diferem do engine bruto somente como metadado, nunca ajuste', () => {
  const s = foto();
  s.lancamentos = [registro('fra1', { obra_id: 'a', etapa: '04_alvenaria', total: '0.006', data: '2026-10-01' }),
    registro('fra2', { obra_id: 'a', etapa: '04_alvenaria', total: '0.006', data: '2026-10-01' })];
  s.repasses = [registro('rec', { obra_id: 'a', valor: 1, tipo: 'pls', data_credito: '2026-10-01' })];
  s.adicionais = []; s.pagamentosAdicionais = [];
  s.dre = { status: 'confirmada', ...dre(s) };
  const c = construir(contexto(s), 'a');
  assert.equal(c.custoCentavos, 2);
  assert.equal(c.resultadoCentavos, 98);
  assert.equal(c.margemConstrucao.engineResultadoCentavos, 99);
  assert.equal(c.margemConstrucao.diferencaArredondamentoCentavos, -1);
  assert.equal(c.linhas.length, 3);
  assert.equal(c.linhas.reduce((n, l) => n + l.efeitoCentavos, 0), 98);
  assert.equal(s.dre.calcGerencialPorObra('a', '2026-10').custoConstr, 0.012);
});

test('mao por m2 usa exclusivamente mao acumulada e area da mesma obra', () => {
  const c = construir(contexto(), 'a');
  assert.equal(categoria(c, 'mao').centavos, 0);
  assert.equal(c.acumulado.maoCentavos, 1401);
  assert.equal(c.acumulado.areaM2, 20);
  assert.equal(c.acumulado.maoPorM2Centavos, 70);
  assert.deepEqual(c.acumulado.linhasMao.map(l => l.id), ['l1']);
  assert.equal(c.acumulado.linhasMao[0].data, '2026-09-20');
  assert.equal(construir(contexto(foto(), { periodo: '', situacao: 'ativas' }), 'a').acumulado.maoPorM2Centavos, 70);
});

test('area zero, ausente, negativa, vazia, booleana e infinita nunca gera divisao invalida', () => {
  for (const v of [0, null, undefined, -20, '', ' ', true, Infinity, 'inválida']) {
    const s = foto(); s.obras[0].area_m2 = v;
    const a = construir(contexto(s), 'a').acumulado;
    assert.equal(a.areaM2, null);
    assert.equal(a.maoPorM2Centavos, null);
    assert.equal(a.maoCentavos, 1401);
  }
  const s = foto(); s.obras[0].area_m2 = '20.5';
  assert.equal(construir(contexto(s), 'a').acumulado.maoPorM2Centavos, 68);
});

test('divisao de mao por area decimal e racional exata, meia para fora de zero e limites seguros', () => {
  for (const [valor, area, esperado] of [
    ['0.81', '10.8', 8], ['-0.81', 10.8, -8],
    ['0.81', '1.08e1', 8], ['0.81', '+10.8000', 8],
    ['90071992547409.91', 3, 3002399751580330],
    ['-90071992547409.91', '3.0', -3002399751580330],
    ['0.01', '.5', 2], ['0.01', 1e-7, 10000000],
    ['90071992547409.91', '0.1', null]
  ]) {
    const s = foto(); s.obras[0].area_m2 = area;
    s.lancamentos = [registro('ratio', { obra_id: 'a', etapa: '28_mao', total: valor, data: '2026-10-01' })];
    assert.equal(construir(contexto(s), 'a').acumulado.maoPorM2Centavos, esperado, `${valor} / ${area}`);
  }
});

test('periodo acumulado e mensal preservam escopo e nao somam outra obra', () => {
  const mensal = construir(contexto(), 'a');
  const acum = construir(contexto(foto(), { periodo: '', situacao: 'ativas' }), 'a');
  assert.equal(mensal.custoCentavos, 3601);
  assert.equal(acum.custoCentavos, 5002);
  assert.equal(acum.recebidoCentavos, 18002);
  assert.equal(acum.resultadoCentavos, 13000);
  assert.equal(construir(contexto(foto(), { periodo: '2026-11', situacao: 'ativas' }), 'a').resultadoCentavos, 0);
  assert.equal(construir(contexto(foto(), { periodo: '2026-10', situacao: 'todas' }), 'b').custoCentavos, 99900);
  assert.equal(construir(contexto(foto(), { periodo: '2026-10', situacao: 'arquivadas' }), 'b').acumulado.maoCentavos, 99900);
  assert.equal(construir(contexto(), 'b'), null);
  assert.equal(construir(contexto(foto(), { obraId: 'a', situacao: 'todas' }), 'b'), null);
});

test('recebimentos adicionais pendentes/cancelados preservam politica do modelo e da DRE separadamente', () => {
  const s = foto(); s.pagamentosAdicionais[2].valor = -2;
  const c = construir(contexto(s), 'a');
  assert.equal(c.recebidoCentavos, 13002);
  assert.equal(c.margemConstrucao.adicionaisForaCarteiraCentavos, 101);
  assert.equal(c.margemConstrucao.recebidoCentavos, 11103);
  assert.equal(c.margemConstrucao.resultadoCentavos + 2000 - 101 - 1599, c.resultadoCentavos);
});

test('negativos, estornos e zero fecham em centavos e percentual nao divide base nao positiva', () => {
  const s = foto(); s.lancamentos = [registro('n', { obra_id: 'a', total: '-0.005', etapa: '28_mao', data: '2026-10-01' })];
  s.repasses = []; s.adicionais = []; s.pagamentosAdicionais = [];
  let c = construir(contexto(s), 'a');
  assert.equal(c.custoCentavos, -1);
  assert.equal(c.resultadoCentavos, 1);
  assert.equal(c.resultadoPct, null);
  assert.equal(c.acumulado.maoPorM2Centavos, 0);
  s.repasses.push(registro('r', { obra_id: 'a', valor: '-0.005', data_credito: '2026-10-01' }));
  c = construir(contexto(s), 'a');
  assert.equal(c.recebidoCentavos, -1); assert.equal(c.resultadoCentavos, 0); assert.equal(c.resultadoPct, null);
});

test('fontes ausentes, parciais ou nao declaradas sao desconhecidas e nao zero', () => {
  for (const nome of ['lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais']) {
    for (const status of [undefined, 'parcial', 'indisponivel', 'confirmado', 'inválido']) {
      const s = foto(); s.fontes[nome] = status;
      const c = construir(contexto(s), 'a');
      if (nome === 'lancamentos') {
        assert.equal(c.custoCentavos, null);
        assert.equal(c.acumulado.maoCentavos, null);
        assert.ok(c.categorias.every(x => x.centavos === null));
        assert.deepEqual(c.margemConstrucao.exclusoes, []);
      } else assert.equal(c.recebidoCentavos, null);
      assert.equal(c.resultadoCentavos, null);
    }
  }
  const s = foto(); delete s.fontes.obras;
  assert.equal(construir(contexto(s), 'a'), null);
});

test('qualquer registro de outra empresa invalida fonte, inclusive linha fora da obra filtrada', () => {
  const s = foto(); s.lancamentos[8].company_id = 'empresa-externa';
  let c = construir(contexto(s), 'a');
  assert.equal(c.custoCentavos, null);
  assert.equal(c.resultadoCentavos, null);
  assert.equal(c.recebidoCentavos, 13002);
  s.lancamentos[8].company_id = COMPANY; delete s.repasses[0].company_id;
  c = construir(contexto(s), 'a'); assert.equal(c.recebidoCentavos, null);
  s.company_id = 'empresa-externa';
  assert.equal(construir(contexto(s), 'a'), null);
});

test('fontes com IDs repetidos ou arrays invalidos nao duplicam montantes', () => {
  const s = foto(); s.lancamentos.push({ ...s.lancamentos[0] });
  assert.equal(construir(contexto(s), 'a').custoCentavos, null);
  s.lancamentos = [null];
  assert.equal(construir(contexto(s), 'a').custoCentavos, null);
  s.lancamentos = [];
  assert.equal(construir(contexto(s), 'a').custoCentavos, 0);
  s.obras.push({ ...s.obras[0] });
  assert.equal(construir(contexto(s), 'a'), null);
});

test('datas civis invalidas no recorte mensal ficam desconhecidas, sem inventar competencia', () => {
  for (const data of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-01', '2026-10-00', '2026-10-01T00:00:00Z', null]) {
    const s = foto(); s.lancamentos[0].data = data;
    let c = construir(contexto(s), 'a');
    assert.equal(c.custoCentavos, null);
    assert.equal(c.resultadoCentavos, null);
    assert.equal(c.acumulado.maoCentavos, 1401);
    c = construir(contexto(s, { periodo: '', situacao: 'ativas' }), 'a');
    assert.equal(c.custoCentavos, 5002);
  }
  const s = foto(); s.lancamentos[0].data = '2024-02-29';
  assert.equal(construir(contexto(s), 'a').custoCentavos, 3601);
  s.repasses[0].data_credito = '2026-09-31';
  assert.equal(construir(contexto(s), 'a').recebidoCentavos, null);
});

test('data invalida de adicional inelegivel nao contamina principal mas impede margem antiga mensal', () => {
  const s = foto(); s.pagamentosAdicionais[1].data = '2026-02-30';
  const c = construir(contexto(s), 'a');
  assert.equal(c.recebidoCentavos, 13002);
  assert.equal(c.resultadoCentavos, 9401);
  assert.equal(c.margemConstrucao.recebidoCentavos, null);
  assert.equal(c.margemConstrucao.adicionaisForaCarteiraCentavos, null);
});

test('valores invalidos e overflow ficam desconhecidos; nao somam floats ou truncam inteiro', () => {
  for (const v of [null, true, Infinity, 'NaN', '1e3', 'R$ 1,00', {}, '90071992547409.92']) {
    const s = foto(); s.lancamentos[1].total = v;
    const c = construir(contexto(s), 'a');
    assert.equal(c.custoCentavos, null); assert.equal(c.resultadoCentavos, null);
    assert.equal(categoria(c, 'material_servicos').centavos, null);
    assert.equal(categoria(c, 'impostos').centavos, 500);
  }
  const s = foto(); s.lancamentos = ['90071992547409.91', '0.01'].map((total, n) =>
    registro('ov' + n, { obra_id: 'a', total, etapa: '28_mao', data: '2026-10-01' }));
  assert.equal(construir(contexto(s), 'a').custoCentavos, null);
  assert.equal(construir(contexto(s), 'a').acumulado.maoCentavos, null);
});

test('contexto obsoleto, fase nao pronta e identidade divergente nao oferecem composicao', () => {
  for (const fase of ['carregando', 'erro', 'invalidada']) {
    const ctx = contexto(); ctx.envelope.fase = fase; assert.equal(construir(ctx, 'a'), null);
  }
  let ctx = contexto(); ctx.filtro = { ...ctx.filtro, periodo: '2026-09' }; assert.equal(construir(ctx, 'a'), null);
  ctx = contexto(); ctx.visao.companyId = 'outra'; assert.equal(construir(ctx, 'a'), null);
  ctx = contexto(); ctx.visao.obras[0].company_id = 'outra'; assert.equal(construir(ctx, 'a'), null);
  ctx = contexto(); ctx.snapshot.perfil = 'mestre'; assert.equal(construir(ctx, 'a'), null);
  ctx = contexto(); ctx.visao.obras[0].recebidoPeriodoCentavos += 1;
  const c = construir(ctx, 'a'); assert.equal(c.status, 'indisponivel'); assert.equal(c.resultadoCentavos, null);
  assert.ok(c.avisos.some(a => a.includes('não são consistentes')));
  assert.equal(construir(null, 'a'), null); assert.equal(construir(contexto(), ''), null);
});

test('obras estruturais e obra fora da situacao nunca entram por contexto adulterado', () => {
  for (const nome of ['OBRA QA Sintética', 'ESCRITORIO Sintético', 'ALMOXARIFADO Sintético']) {
    const s = foto(); s.obras[0].nome = nome;
    const ctx = contexto(s); ctx.visao.obras.push({ id: 'a' });
    assert.equal(construir(ctx, 'a'), null);
  }
  const s = foto(); s.obrasInternas = ['a'];
  const ctx = contexto(s); ctx.visao.obras.push({ id: 'a' });
  assert.equal(construir(ctx, 'a'), null);
});

test('diagnostico agregado nao declara completude nem pagamento e nao expoe funcionarios', () => {
  const f = folhinha({ motivos: [{ codigo: 'teste', severidade: 'limite', funcionario: 'DADO NÃO PERMITIDO' }] });
  const c = construir(contexto(foto(), { periodo: '', situacao: 'ativas' }, f), 'a');
  assert.equal(c.acumulado.statusFolha, 'sem_pendencia_identificada');
  assert.equal(c.acumulado.folha.cobertura, 'confirmada');
  assert.ok(c.acumulado.folha.avisos.some(a => a.includes('não comprova')));
  assert.ok(!JSON.stringify(c).includes('DADO NÃO PERMITIDO'));
  assert.ok(!Object.keys(c.acumulado.folha).includes('motivos'));
  assert.ok(!Object.keys(c.acumulado.folha).includes('comprovaPagamento'));
});

test('pendencia comprovada e consulta mensal mostram parcialidade sem consultar diarias', () => {
  let f = folhinha({ estado: 'pendencia_identificada', motivos: [{ codigo: 'custo_fp_nao_identificado', severidade: 'pendencia' }] });
  let c = construir(contexto(foto(), { periodo: '', situacao: 'ativas' }, f), 'a');
  assert.equal(c.acumulado.folha.pendenciaConfirmada, true);
  assert.ok(c.acumulado.folha.avisos.some(a => a.startsWith('Há pendência')));
  f = { ...f, filtro: modelo.normalizarFiltro({ periodo: '2026-10', situacao: 'ativas' }) };
  c = construir(contexto(foto(), { periodo: '2026-10', situacao: 'ativas' }, f), 'a');
  assert.equal(c.acumulado.statusFolha, 'nao_avaliado');
  assert.equal(c.acumulado.folha.cobertura, 'parcial');
  assert.equal(c.acumulado.folha.pendenciaConfirmada, true);
  assert.ok(c.acumulado.folha.avisos.some(a => a.includes('deste mês não confirma')));
});

test('diagnostico ausente, de outra empresa ou fora do periodo mostra limitacao', () => {
  for (const f of [undefined, { ...folhinha(), companyId: 'externa' }, { ...folhinha(), filtro: { periodo: '2025-01' } },
    { ...folhinha(), filtro: modelo.normalizarFiltro({ periodo: '', obraId: 'b', situacao: 'ativas' }) },
    { ...folhinha(), filtro: modelo.normalizarFiltro({ periodo: '', situacao: 'arquivadas' }) }]) {
    const c = construir(contexto(foto(), { periodo: '', situacao: 'ativas' }, f), 'a');
    assert.equal(c.acumulado.statusFolha, 'nao_avaliado');
    assert.ok(c.acumulado.folha.avisos.some(a => a.includes('não foi confirmado integralmente')));
  }
});

test('funcao pura aceita contexto congelado e devolve arvore imutavel separada', () => {
  const ctx = congelar(contexto()), antes = JSON.stringify(ctx);
  const c = construir(ctx, 'a');
  assert.equal(JSON.stringify(ctx), antes);
  assert.ok(Object.isFrozen(c)); assert.ok(Object.isFrozen(c.categorias));
  assert.ok(Object.isFrozen(c.acumulado.folha.avisos));
  assert.throws(() => { c.resultadoCentavos = 1; }, TypeError);
  assert.notStrictEqual(c.linhas[0], ctx.snapshot.repasses[1]);
});

test('UMD de navegador captura modelo e nao exige DOM, rede, storage ou globais de custo', () => {
  const env = { FinanceiroVisaoModelo: modelo };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/edr-v2-visao-financeira-composicao.js'), 'utf8'), env);
  assert.equal(env.FinanceiroVisaoComposicao.construir(contexto(), 'a').resultadoCentavos, 9401);
  assert.deepEqual(Object.keys(env.FinanceiroVisaoComposicao), ['construir']);
});
