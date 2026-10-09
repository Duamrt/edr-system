'use strict';
// Ponte real + dependencias sinteticas. Sem rede, Auth real, dados reais ou writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ponte = require('../js/edr-v2-visao-financeira-ponte.js');
const dados = require('../js/edr-v2-visao-financeira-dados.js');
const modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const estado = require('../js/edr-v2-visao-financeira-estado.js');
const folha = require('../js/edr-v2-visao-financeira-folha.js');
const COMPANY = 'empresa-sintetica-A', ATOR = 'ator-sintetico-A';
const adiar = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
function snapshot(valor = 20, extras = {}) {
  const s = {
    companyId: COMPANY, company_id: COMPANY, ator_id: ATOR, perfil: 'admin',
    planosEntrada: { status: 'confirmada', company_id: COMPANY, planos: [] },
    obras: [{ id: 'obra-a', company_id: COMPANY, nome: 'Obra sintetica A', valor_venda: 100, arquivada: false }],
    lancamentos: [{ id: 'l1', company_id: COMPANY, obra_id: 'obra-a', total: 10, data: '2001-06-06', etapa: '04_alven', obs: null }],
    repasses: [{ id: 'r1', company_id: COMPANY, obra_id: 'obra-a', valor, data_credito: '2001-06-06' }],
    adicionais: [], pagamentosAdicionais: [], contasPagar: [], notas: [], quinzenas: [], diarias: [], extras: [],
    obrasInternas: [], OBRAS_INTERNAS: [],
    ledger: { status: 'confirmada', estado: { company_id: COMPANY, contas: [], movimentos: [], pagamentos: [], total_centavos: 0 } },
    dre: { status: 'confirmada', calcGerencialPorObra: () => ({ margem: 7 }), calcGerencialConsolidado: () => ({ resultado: 3 }) }
  };
  s.fontes = Object.fromEntries(['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais', 'contasPagar',
    'notas', 'quinzenas', 'diarias', 'extras'].map(n => [n, { status: 'confirmada' }]));
  return { ...s, ...extras };
}
function ambiente(overrides = {}) {
  const atual = { company_id: COMPANY, ator_id: ATOR, perfil: 'admin' };
  let cargas = 0;
  const deps = {
    obterIdentidade: () => atual, modelo, estado, folha,
    dados: { carregar: async () => { cargas++; return snapshot(); } },
    agora: () => new Date('2001-06-07T12:34:56Z'), ...overrides
  };
  return { atual, deps, instancia: ponte.criar(deps), cargas: () => cargas };
}

test('contrato exige os quatro modulos e somente obter e lazy no navegador', () => {
  assert.throws(() => ponte.criar({}), TypeError);
  const fonte = fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-ponte.js'), 'utf8');
  const bloquear = () => { throw new Error('Efeito externo proibido.'); };
  const ctx = { fetch: bloquear, sbPost: bloquear, sbPatch: bloquear, sbDelete: bloquear, initDiarias: bloquear,
    localStorage: { getItem: bloquear, setItem: bloquear }, document: {}, console: { log: bloquear, warn: bloquear, error: bloquear } };
  vm.runInNewContext(fonte, ctx);
  assert.equal(typeof ctx.FinanceiroVisaoPonte.criar, 'function');
  assert.equal(Object.isFrozen(ctx.FinanceiroVisaoPonte), true);
  assert.throws(() => ctx.FinanceiroVisaoPonte.obter(), /Modulos/);
});

test('publica snapshot e visao juntos, com UTC de consulta sem alterar dados base', async () => {
  const base = snapshot(20, { consultadoEm: 'referencia-original' });
  const a = ambiente({ dados: { carregar: async () => base } });
  const eventos = [];
  a.instancia.assinar(e => eventos.push(e));
  const r = await a.instancia.carregar();
  assert.deepEqual(eventos.map(e => e.fase), ['inicial', 'carregando', 'pronta']);
  for (const e of eventos.slice(0, 2)) { assert.equal(e.snapshot, null); assert.equal(e.visao, null); assert.equal(e.consultadoEm, null); }
  assert.equal(r.snapshot.repasses[0].valor, 20);
  assert.equal(r.visao.totais.recebidoAcumuladoCentavos, 2000);
  assert.equal(r.consultadoEm, '2001-06-07T12:34:56.000Z');
  assert.equal(r.snapshot.consultadoEm, r.consultadoEm);
  assert.equal(base.consultadoEm, 'referencia-original');
  assert.ok(r.folha && typeof r.folha.estado === 'string');
  assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.snapshot.repasses[0]), true);
  base.repasses[0].valor = 99;
  assert.equal(a.instancia.setFiltro({ periodo: '2001-06' }).visao.totais.recebidoAcumuladoCentavos, 2000);
});

test('filtros compartilhados usam o mesmo snapshot e alinham visao e folha sem nova leitura', async () => {
  const a = ambiente({ folha: { avaliar: (s, f) => ({ status: 'teste', filtro: { ...f }, valor: s.repasses[0].valor }) } });
  const primeira = await a.instancia.carregar();
  const r = a.instancia.setFiltro({ periodo: '2001-07', obraId: 'obra-a', situacao: 'todas' });
  assert.equal(a.cargas(), 1);
  assert.equal(r.snapshot, primeira.snapshot);
  assert.equal(r.consultadoEm, primeira.consultadoEm);
  assert.deepEqual(r.filtro, r.visao.filtro);
  assert.deepEqual(r.filtro, r.folha.filtro);
  assert.equal(r.visao.totais.recebidoPeriodoCentavos, 0);
  assert.equal(r.visao.totais.pendenteContratoCentavos, 8000);
  assert.equal(r.visao.saldo.status, 'sem_abertura');
});

test('filtro alterado durante leitura prevalece no pacote publicado', async () => {
  const p = adiar();
  const a = ambiente({ dados: { carregar: () => p.promise }, folha: { avaliar: (s, f) => ({ filtro: { ...f } }) } });
  const carga = a.instancia.carregar();
  assert.equal(a.instancia.setFiltro({ periodo: '2001-07' }).snapshot, null);
  p.resolve(snapshot());
  const r = await carga;
  assert.equal(r.visao.filtro.periodo, '2001-07');
  assert.equal(r.folha.filtro.periodo, '2001-07');
  assert.equal(r.snapshot.repasses[0].valor, 20);
});

test('duas cargas em voo nunca associam snapshot antigo a visao nova', async () => {
  const p1 = adiar(), p2 = adiar(); let calls = 0;
  const a = ambiente({ dados: { carregar: () => (++calls === 1 ? p1 : p2).promise } });
  const eventos = [];
  a.instancia.assinar(e => { if (e.fase === 'pronta') eventos.push([e.snapshot.repasses[0].valor, e.visao.totais.recebidoAcumuladoCentavos]); });
  const primeira = a.instancia.carregar(), segunda = a.instancia.carregar();
  p2.resolve(snapshot(40)); await segunda;
  p1.resolve(snapshot(90)); await primeira;
  assert.deepEqual(eventos, [[40, 4000]]);
  assert.equal(a.instancia.ler().snapshot.repasses[0].valor, 40);
});

for (const campo of ['company_id', 'ator_id', 'perfil']) {
  test('troca de ' + campo + ' descarta snapshot e visao pendentes', async () => {
    const p = adiar(), a = ambiente({ dados: { carregar: () => p.promise } });
    a.instancia.setFiltro({ periodo: '2001-06', obraId: 'obra-a', situacao: 'todas' });
    const carga = a.instancia.carregar();
    a.atual[campo] = campo === 'perfil' ? 'mestre' : 'outra-identidade';
    p.resolve(snapshot()); await carga;
    const r = a.instancia.ler();
    assert.equal(r.fase, 'invalidada');
    assert.equal(r.snapshot, null); assert.equal(r.visao, null); assert.equal(r.folha, null);
    assert.deepEqual(r.filtro, { periodo: '', obraId: '', situacao: 'ativas' });
  });
}

test('getter invalida snapshot carregado apos logout ou troca de ator', async () => {
  const a = ambiente(); await a.instancia.carregar(); a.atual.ator_id = 'outro-ator';
  assert.equal(a.instancia.ler().snapshot, null);
  assert.equal(a.instancia.ler().visao, null);
});

test('invalidacao explicita bloqueia resposta pendente e limpa timestamp', async () => {
  const p = adiar(), a = ambiente({ dados: { carregar: () => p.promise } });
  const carga = a.instancia.carregar(); a.instancia.invalidar(); p.resolve(snapshot()); await carga;
  assert.equal(a.instancia.ler().fase, 'invalidada');
  assert.equal(a.instancia.ler().snapshot, null); assert.equal(a.instancia.ler().consultadoEm, null);
});

test('perfil mestre nao inicia loader mesmo com dependencias sinteticas permissivas', async () => {
  const a = ambiente(); a.atual.perfil = 'mestre';
  await a.instancia.carregar();
  assert.equal(a.cargas(), 0); assert.equal(a.instancia.ler().snapshot, null);
});

for (const [nome, alterar] of [
  ['empresa', s => { s.company_id = s.companyId = 'empresa-B'; }],
  ['ator', s => { s.ator_id = 'ator-B'; }],
  ['perfil', s => { s.perfil = 'operacional'; }],
  ['aliases conflitantes', s => { s.company_id = 'empresa-B'; }]
]) {
  test('snapshot com ' + nome + ' divergente nunca e exposto', async () => {
    const s = snapshot(); alterar(s);
    const a = ambiente({ dados: { carregar: async () => s } });
    const r = await a.instancia.carregar();
    assert.equal(r.fase, 'erro'); assert.equal(r.snapshot, null); assert.equal(r.visao, null);
    assert.equal(r.erro.codigo, 'IDENTIDADE_SNAPSHOT_INVALIDA');
  });
}

test('falha de recarga elimina pacote anterior sem expor mensagem ou codigo privado', async () => {
  let calls = 0;
  const a = ambiente({ dados: { carregar: async () => {
    if (!calls++) return snapshot();
    throw Object.assign(new Error('segredo-fixture-nao-publicar'), { code: 'SEGREDO_FIXTURE_NAO_PUBLICAR' });
  } } });
  await a.instancia.carregar();
  const r = await a.instancia.carregar();
  assert.equal(r.fase, 'erro'); assert.equal(r.snapshot, null); assert.equal(r.visao, null);
  assert.deepEqual(r.erro, { codigo: 'LEITURA_FALHOU' });
  assert.equal(JSON.stringify(r).includes('SEGREDO'), false);
  assert.equal(JSON.stringify(r).includes('segredo'), false);
});

test('falha de folha e independente da visao financeira confirmada', async () => {
  const a = ambiente({ folha: { avaliar: () => { throw new Error('falha-fixture-folha'); } } });
  const r = await a.instancia.carregar();
  assert.equal(r.fase, 'pronta'); assert.equal(r.visao.totais.recebidoAcumuladoCentavos, 2000);
  assert.equal(r.folha.estado, 'nao_avaliado');
  assert.equal(r.folha.cobertura, 'indisponivel');
  assert.equal(r.folha.comprovaPagamento, false);
  assert.deepEqual(r.folha.erro, { codigo: 'FOLHA_INDISPONIVEL' });
  assert.deepEqual(r.folha.filtro, r.filtro);
});

test('filtro invalido nao modifica pacote vigente', async () => {
  const a = ambiente(), r = await a.instancia.carregar();
  assert.throws(() => a.instancia.setFiltro({ periodo: '2001-13' }), RangeError);
  assert.equal(a.instancia.ler(), r);
});

test('observadores podem falhar ou sair sem afetar carregamento', async () => {
  const a = ambiente(), eventos = [];
  a.instancia.assinar(() => { throw new Error('renderer-fixture'); });
  const sair = a.instancia.assinar(e => eventos.push(e.fase));
  await a.instancia.carregar(); sair(); a.instancia.invalidar();
  assert.deepEqual(eventos, ['inicial', 'carregando', 'pronta']);
  assert.throws(() => a.instancia.assinar(null), TypeError);
});

test('filtro reentrante impede segundo observador de receber evento pronto anterior', async () => {
  const a = ambiente(), recebidos = [];
  a.instancia.assinar(e => { if (e.fase === 'pronta' && !e.filtro.periodo) a.instancia.setFiltro({ periodo: '2001-07' }); });
  a.instancia.assinar(e => { if (e.fase === 'pronta') recebidos.push([e.filtro.periodo, e.visao.filtro.periodo]); });
  await a.instancia.carregar();
  assert.deepEqual(recebidos, [['2001-07', '2001-07']]);
});

test('invalidacao reentrante nunca envia snapshot antigo ao proximo observador', async () => {
  const a = ambiente(), prontos = [];
  a.instancia.assinar(e => { if (e.fase === 'pronta') a.instancia.invalidar(); });
  a.instancia.assinar(e => { if (e.snapshot) prontos.push(e); });
  await a.instancia.carregar();
  assert.deepEqual(prontos, []); assert.equal(a.instancia.ler().fase, 'invalidada');
});

test('troca de ator dentro de observador bloqueia snapshot para os demais', async () => {
  const a = ambiente(), prontos = [];
  a.instancia.assinar(e => { if (e.fase === 'pronta') a.atual.ator_id = 'ator-B'; });
  a.instancia.assinar(e => { if (e.snapshot) prontos.push(e); });
  await a.instancia.carregar();
  assert.deepEqual(prontos, []); assert.equal(a.instancia.ler().snapshot, null);
});

test('carregamento reentrante cancela intencao anterior antes de ler fonte', async () => {
  const p = adiar(); let calls = 0, nova, entrou = false;
  const a = ambiente({ dados: { carregar: () => { calls++; return p.promise; } } });
  a.instancia.assinar(e => {
    if (e.fase === 'carregando' && !entrou) { entrou = true; nova = a.instancia.carregar(); }
  });
  const antiga = a.instancia.carregar();
  assert.equal(calls, 1);
  p.resolve(snapshot(60)); await Promise.all([antiga, nova]);
  const r = a.instancia.ler();
  assert.equal(r.fase, 'pronta'); assert.equal(r.snapshot.repasses[0].valor, 60);
  assert.equal(r.visao.totais.recebidoAcumuladoCentavos, 6000);
});

test('identidade alterada pelo modelo nao publica pacote pronto', async () => {
  let a;
  a = ambiente({ modelo: { ...modelo, construir: (s, f) => { const v = modelo.construir(s, f); a.atual.ator_id = 'ator-B'; return v; } } });
  await a.instancia.carregar();
  assert.equal(a.instancia.ler().fase, 'invalidada'); assert.equal(a.instancia.ler().snapshot, null);
});

test('clock invalido nao gera timestamp falso nem snapshot publicavel', async () => {
  const r = await ambiente({ agora: () => new Date(NaN) }).instancia.carregar();
  assert.equal(r.fase, 'erro'); assert.equal(r.snapshot, null);
  assert.deepEqual(r.erro, { codigo: 'REFERENCIA_LEITURA_INVALIDA' });
});

function navegador(extra = {}) {
  const fonte = fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-ponte.js'), 'utf8');
  const chamadas = [];
  const bloquear = () => { throw new Error('Efeito proibido.'); };
  const ctx = {
    _companyId: COMPANY, _supabaseToken: 'sessao-sintetica-sem-JWT',
    usuarioAtual: { id: 'a0000000-0000-4000-8000-000000000001', perfil: 'admin' },
    FinanceiroVisaoDados: dados, FinanceiroVisaoModelo: modelo, FinanceiroVisaoEstado: estado, FinanceiroVisaoFolha: folha,
    DREModule: { criarContextoLeitura: s => { chamadas.push(['dre', s.ator_id]); return {
      calcGerencialPorObra: () => ({ margem: 0 }), calcGerencialConsolidado: () => ({ resultado: 0 }) }; } },
    OBRAS_INTERNAS: ['obra-interna-sintetica'],
    sbGet: async (t, q, opt) => { chamadas.push(['pagina', t, q, opt]); return []; },
    sbRpcEstoque: async () => ({ok:true,dados:{company_id:COMPANY,planos:[]}}),
    caixaProspectivoCarregar: async () => { chamadas.push(['ledger']); return { company_id: COMPANY, contas: [], movimentos: [], pagamentos: [], total_centavos: 0 }; },
    fetch: bloquear, sbPost: bloquear, sbPatch: bloquear, sbDelete: bloquear, initDiarias: bloquear,
    localStorage: { getItem: bloquear, setItem: bloquear }, console: { log: bloquear, warn: bloquear, error: bloquear },
    ...extra
  };
  vm.runInNewContext(fonte, ctx);
  return { ctx, chamadas, api: ctx.FinanceiroVisaoPonte };
}

test('instancia padrao lazy usa UID Auth e wrappers de leitura strict sem tocar DOM/storage', async () => {
  const a = navegador();
  assert.equal(a.chamadas.length, 0);
  assert.equal(a.api.obter(), a.api.obter());
  assert.equal(a.chamadas.length, 0);
  const r = await a.api.carregar();
  assert.equal(r.fase, 'pronta'); assert.equal(r.snapshot.ator_id, a.ctx.usuarioAtual.id);
  assert.equal(r.snapshot.company_id, COMPANY);
  assert.deepEqual(Array.from(r.snapshot.OBRAS_INTERNAS), ['obra-interna-sintetica']);
  const consultas = a.chamadas.filter(c => c[0] === 'pagina');
  assert.equal(consultas.length, 10);
  assert.equal(consultas.every(c => c[3].throwOnError === true), true);
  assert.equal(a.chamadas.filter(c => c[0] === 'ledger').length, 1);
  assert.equal(a.chamadas.filter(c => c[0] === 'dre').length, 1);
  a.ctx._supabaseToken = null;
  assert.equal(a.api.ler().snapshot, null);
  assert.equal(a.api.ler().fase, 'invalidada');
});

for (const [nome, extra] of [
  ['sem token', { _supabaseToken: null }],
  ['sem UID', { usuarioAtual: { perfil: 'admin', nome: 'Nome nao e UID' } }],
  ['mestre', { usuarioAtual: { id: ATOR, perfil: 'mestre' } }]
]) {
  test('runtime ' + nome + ' nao faz consultas nem usa cache de saldo', async () => {
    const a = navegador(extra), r = await a.api.carregar();
    assert.equal(r.snapshot, null); assert.equal(r.visao, null); assert.equal(r.fase, 'invalidada');
    assert.equal(a.chamadas.length, 0);
  });
}
