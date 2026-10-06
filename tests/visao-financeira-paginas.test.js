'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const Folha = require('../js/edr-v2-visao-financeira-folha.js');
const Composicao = require('../js/edr-v2-visao-financeira-composicao.js');
const Paginas = require('../js/edr-v2-visao-financeira-paginas.js');

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function componentes() {
  const chamadas = [];
  const money = v => Number.isSafeInteger(v) ? (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Indisponível';
  const nButton = (key, value, work = '') => {
    chamadas.push({ tipo: 'numero', key, value, work });
    return `<button data-detail="${esc(key)}"${work ? ` data-work="${esc(work)}"` : ''}>${money(value)}</button>`;
  };
  return {
    chamadas, esc, money, nButton, pct: n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%',
    icon: () => '<svg></svg>',
    metric: (title, value, caption, key) => {
      chamadas.push({ tipo: 'metric', key, value, title });
      return `<button class="metric" data-detail="${esc(key)}"><span class="metric-head">${esc(title)}</span><span class="metric-value">${money(value)}</span><span>${esc(caption)}</span></button>`;
    },
    bar: (label, value, max, key) => {
      chamadas.push({ tipo: 'bar', key, value, max });
      return `<div class="barrow">${esc(label)}${nButton(key, value)}</div>`;
    },
    receivables: ctx => { chamadas.push({ tipo: 'recebiveis', ctx }); return '<section class="receivables-panel">Recebíveis por obra</section>'; },
    workTable: ctx => { chamadas.push({ tipo: 'tabela', ctx }); return '<section class="panel">Resultado por obra</section>'; }
  };
}
function snapshotReal() {
  const tenant = 'empresa-ficticia-paginas';
  const scoped = r => ({ company_id: tenant, ...r });
  const custo = (id, obra_id, total, etapa, data = '2026-10-03') => scoped({ id, obra_id, total, etapa, data, obs: '' });
  const s = {
    companyId: tenant,
    fontes: Object.fromEntries(['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais'].map(f => [f, 'confirmada'])),
    obras: [scoped({ id: 'a', nome: 'Casa Sintética A', valor_venda: 1000, area_m2: 100, arquivada: false }),
      scoped({ id: 'b', nome: 'Casa Sintética B', valor_venda: 350, area_m2: 50, arquivada: true }),
      scoped({ id: 'office', nome: 'ESCRITORIO SINTETICO', valor_venda: 0, area_m2: null })],
    lancamentos: [custo('mat-a', 'a', 100, '04_alven'), custo('mao-a', 'a', 40, '28_mao'),
      custo('terr-a', 'a', 300, '35_terreno'), custo('tax-a', 'a', 20, '24_imposto'),
      custo('oper-a', 'a', 10, '03_alimentacao'), custo('set-a', 'a', 200, '04_alven', '2026-09-03'),
      custo('mat-b', 'b', 80, '04_alven'), custo('office-oper', 'office', 15, '34_tecnologia'),
      custo('office-mat', 'office', 60, '04_alven')],
    repasses: [scoped({ id: 'rec-a', obra_id: 'a', valor: 200, data_credito: '2026-10-03', tipo: 'pls' }),
      scoped({ id: 'rec-terr-a', obra_id: 'a', valor: 900, data_credito: '2026-10-03', tipo: 'terreno' }),
      scoped({ id: 'rec-b', obra_id: 'b', valor: 400, data_credito: '2026-10-03', tipo: 'entrada' }),
      scoped({ id: 'set-rec-a', obra_id: 'a', valor: 100, data_credito: '2026-09-03', tipo: 'pls' })],
    adicionais: [scoped({ id: 'ad-a', obra_id: 'a', valor: 50, status: 'aprovado' })],
    pagamentosAdicionais: [scoped({ id: 'pg-a', adicional_id: 'ad-a', valor: 25, data: '2026-10-03' })],
    contasPagar: [scoped({ id: 'admin', status: 'pago', valor: 40, data_pagamento: '2026-10-03' })],
    notas: [], OBRAS_INTERNAS: ['office'], obrasInternas: ['office'],
    quinzenas: [], diarias: [], extras: []
  };
  const proibidas = [];
  const proibir = k => () => { proibidas.push(k); throw new Error('Acesso proibido: ' + k); };
  const ambiente = { console, document: { getElementById: proibir('DOM') },
    fetch: proibir('fetch'), sbGet: proibir('sbGet'), sbPost: proibir('sbPost'), sbPatch: proibir('sbPatch'), sbDelete: proibir('sbDelete'),
    obras: [{ id: 'global-proibida', nome: 'GLOBAL PROIBIDA', valor_venda: 999999 }], obrasArquivadas: [] };
  ambiente.window = ambiente;
  vm.createContext(ambiente);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/edr-v2-dre.js'), 'utf8'), ambiente);
  s.dre = { status: 'confirmada', ...ambiente.DREModule.criarContextoLeitura(s) };
  return { s, proibidas };
}
function contexto(s, filtro = { periodo: '2026-10', obraId: 'a', situacao: 'ativas' }) {
  const visao = Modelo.construir(s, filtro);
  const acumulada = Modelo.construir(s, { ...filtro, periodo: '' });
  const campos = campo => visao.obras.map(o => o.dre.status === 'confirmada' ? Modelo.centavos(o.dre.dados[campo]) : null);
  const somar = vs => vs.some(v => v == null) ? null : vs.reduce((a, b) => a + b, 0);
  const folha = Folha.avaliar(s, filtro);
  return {
    snapshot: s, visao, obras: visao.obras, totais: visao.totais, filtro, acumulada,
    envelope: { fase: 'pronta', snapshot: s, folha }, periodoNome: 'Outubro de 2026',
    custoDre: { maoCentavos: somar(campos('cMao')), materialServicosCentavos: somar(campos('cMat')), totalCentavos: somar(campos('custoConstr')) },
    obrigacoes: { status: 'indisponivel', totalCentavos: null, rows: [] }
  };
}
function valor(h, key, work) {
  return h.chamadas.find(x => x.tipo === 'numero' && x.key === key && (work == null || x.work === work))?.value;
}
function freezeDeep(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freezeDeep); Object.freeze(v); }
  return v;
}

test('DRE usa resultados reais do engine da empresa sem substituir pelo filtro de obra', () => {
  const { s, proibidas } = snapshotReal();
  const ctx = freezeDeep(contexto(s));
  const h = componentes();
  const html = Paginas.renderizar('dre', ctx, h);
  assert.equal(ctx.visao.obras.length, 1);
  assert.equal(ctx.visao.totais.recebidoPeriodoCentavos, 112500);
  assert.equal(valor(h, 'dre:recBruta'), 62500);
  assert.equal(valor(h, 'dre:imposto'), 3750);
  assert.equal(valor(h, 'dre:impostoReal'), 2000);
  assert.equal(valor(h, 'dre:dasEstimado'), 3750);
  assert.equal(valor(h, 'dre:custoObras'), 22000);
  assert.equal(valor(h, 'dre:cMat'), 18000);
  assert.equal(valor(h, 'dre:cMao'), 4000);
  assert.equal(valor(h, 'dre:despOper'), 6500);
  assert.equal(valor(h, 'dre:resultado'), 30250);
  assert.equal(valor(h, 'dre:recTerr'), 90000);
  assert.equal(valor(h, 'dre:cTerr'), 30000);
  assert.equal(valor(h, 'overhead:total'), 7500);
  assert.equal(valor(h, 'overhead:noResultado'), 1500);
  assert.equal(valor(h, 'overhead:foraResultado'), 6000);
  assert.match(html, /não reduz o consolidado da empresa/);
  assert.match(html, /estimativa de 6%/);
  assert.match(html, /Terreno, em apartado/);
  assert.deepEqual(proibidas, []);
});

test('Análise preserva custo acumulado por m² sem usar custo mensal ou custo da construção', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  const h = componentes();
  const html = Paginas.renderizar('analise', ctx, h);
  assert.equal(ctx.visao.obras[0].custoPeriodoCentavos, 47000);
  assert.equal(ctx.acumulada.obras[0].custoPeriodoCentavos, 67000);
  assert.equal(valor(h, 'contractM2', 'a'), 1000);
  assert.equal(valor(h, 'costM2', 'a'), 670);
  assert.notEqual(valor(h, 'costM2', 'a'), ctx.visao.obras[0].custoPeriodoCentavos / 100);
  assert.notEqual(valor(h, 'costM2', 'a'), ctx.custoDre.totalCentavos / 100);
  assert.equal(h.chamadas.filter(x => x.tipo === 'numero' && x.key === 'work').length, 0);
  assert.match(html, /data-detail="work" data-work="a">Abrir análise da obra/);
  assert.equal(valor(h, 'resultReceipts', 'a'), 65500);
  assert.equal(valor(h, 'result', 'a'), undefined);
  assert.match(html, /Contrato, custo e mão de obra por m² usam os valores acumulados/);
  assert.match(html, /Avanço físico não consultado/);
  assert.match(html, /<div class="progress-line" aria-hidden="true"><\/div>/);
  assert.doesNotMatch(html, /Caixa no fim|Estoque no fim|width:[0-9]+%/);
});

test('cartão e tabela de Análise fecham recebido menos todos custos e despesas, sem reutilizar margem DRE', () => {
  const { s } = snapshotReal();
  const ctx = freezeDeep(contexto(s));
  const h = componentes();
  const html = Paginas.renderizar('analise', ctx, h);
  assert.equal(valor(h, 'received', 'a'), 112500);
  assert.equal(valor(h, 'cost', 'a'), 47000);
  assert.equal(valor(h, 'resultReceipts', 'a'), 65500);
  assert.equal(valor(h, 'resultReceipts', 'a'), valor(h, 'received', 'a') - valor(h, 'cost', 'a'));
  assert.notEqual(valor(h, 'resultReceipts', 'a'), Modelo.centavos(ctx.visao.obras[0].dre.dados.margem));
  assert.equal(h.chamadas.filter(x => x.tipo === 'numero' && x.key === 'resultReceipts' && x.work === 'a').length, 2);
  assert.equal(h.chamadas.filter(x => x.tipo === 'tabela').length, 0);
  assert.match(html, /Custos e despesas lançados/);
  assert.match(html, /Resultado sobre recebimentos por obra/);
  assert.match(html, /Resultado \/ recebimentos/);
  assert.match(html, /Não representa saldo em conta nem lucro final da obra/);
  assert.doesNotMatch(html, /Margem da construção|CONTRIBUIÇÃO GERENCIAL|data-detail="result"/);
});

test('resultado de Análise respeita elegibilidade de adicionais enquanto a DRE preserva todos os pagamentos', () => {
  const { s } = snapshotReal();
  s.adicionais[0].status = 'cancelado';
  const ctx = contexto(s);
  const h = componentes();
  const html = Paginas.renderizar('analise', ctx, h);
  assert.equal(valor(h, 'received', 'a'), 110000);
  assert.equal(valor(h, 'cost', 'a'), 47000);
  assert.equal(valor(h, 'resultReceipts', 'a'), 63000);
  assert.equal(Modelo.centavos(ctx.visao.obras[0].dre.dados.margem), 8500);
  assert.match(html, /Resultado sobre recebimentos/);
});

test('mão de obra por m² usa todos os lançamentos acumulados da etapa própria, inclusive fora do mês', () => {
  const { s } = snapshotReal();
  s.lancamentos.push({ company_id: s.companyId, id: 'mao-set-a', obra_id: 'a', total: 30,
    etapa: '\u00a028_mao\u00a0', data: '2026-09-18', obs: '' });
  const ctx = contexto(s);
  const h = componentes();
  const html = Paginas.renderizar('analise', ctx, h);
  assert.equal(valor(h, 'laborM2', 'a'), 70);
  assert.notEqual(valor(h, 'laborM2', 'a'), ctx.custoDre.maoCentavos / 100);
  assert.equal(valor(h, 'costM2', 'a'), 700);
  assert.match(html, /Mão de obra lançada \/ m² \(acumulado\)/);
  assert.match(html, /indicador acumulado/);
  assert.doesNotMatch(html, /mao-set-a|Funcionário/);
});

test('recebimento zero conserva resultado negativo e percentual desconhecido na Análise', () => {
  const { s } = snapshotReal();
  s.repasses = [];
  s.pagamentosAdicionais = [];
  const h = componentes();
  const html = Paginas.renderizar('analise', contexto(s), h);
  assert.equal(valor(h, 'received', 'a'), 0);
  assert.equal(valor(h, 'cost', 'a'), 47000);
  assert.equal(valor(h, 'resultReceipts', 'a'), -47000);
  assert.match(html, /Resultado \/ recebimentos<\/span><strong>Indisponível/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test('fonte de custos indisponível mantém recebido confirmado e torna custo, resultado e mão por m² desconhecidos', () => {
  const { s } = snapshotReal();
  s.fontes.lancamentos = 'indisponivel';
  const h = componentes();
  const html = Paginas.renderizar('analise', contexto(s), h);
  assert.equal(valor(h, 'received', 'a'), 112500);
  assert.equal(valor(h, 'cost', 'a'), null);
  assert.equal(valor(h, 'resultReceipts', 'a'), null);
  assert.equal(valor(h, 'costM2', 'a'), null);
  assert.equal(valor(h, 'laborM2', 'a'), null);
  assert.equal(valor(h, 'contractM2', 'a'), 1000);
  assert.match(html, /Indisponível/);
});

test('aviso de folha distingue pendência comprovada sem expor motivos individuais', () => {
  const { s } = snapshotReal();
  const filtro = { periodo: '', obraId: 'a', situacao: 'ativas' };
  const ctx = contexto(s, filtro);
  ctx.envelope.folha = { companyId: s.companyId, filtro, obras: [{ obraId: 'a',
    estado: 'pendencia_identificada', cobertura: 'parcial',
    motivos: [{ severidade: 'pendencia', texto: 'FUNCIONARIO_PRIVADO_NAO_EXIBIR' }] }] };
  const html = Paginas.renderizar('analise', ctx, componentes());
  assert.match(html, /Há pendência de folha identificada/);
  assert.match(html, /não é possível afirmar que toda a mão de obra está lançada/);
  assert.match(html, /Indicadores por m²<\/span><strong>Acumulado/);
  assert.doesNotMatch(html, /FUNCIONARIO_PRIVADO_NAO_EXIBIR/);
});

test('área ausente ou zerada não fabrica indicador por m²; fonte ausente não vira zero', () => {
  const { s } = snapshotReal();
  s.obras[0].area_m2 = 0;
  s.fontes = { lancamentos: 'indisponivel' };
  const ctx = contexto(s);
  ctx.visao.obras[0].dre = { status: 'indisponivel', dados: null };
  const h = componentes();
  const html = Paginas.renderizar('analise', ctx, h);
  assert.equal(valor(h, 'cost', 'a'), null);
  assert.equal(valor(h, 'resultReceipts', 'a'), null);
  assert.equal(valor(h, 'contractM2', 'a'), null);
  assert.equal(valor(h, 'costM2', 'a'), null);
  assert.equal(valor(h, 'laborM2', 'a'), null);
  assert.match(html, /Indisponível/);
});

test('valores zero confirmados permanecem zero nas três páginas', () => {
  const { s } = snapshotReal();
  for (const k of ['lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais', 'contasPagar']) s[k] = [];
  s.obras[0].valor_venda = 0;
  // O contexto DRE já capturado não é reutilizado depois de trocar dados.
  const dreZero = { recBruta: 0, recMed: 0, recAdic: 0, recTerr: 0, imposto: 0, impostoReal: 0, dasEstimado: 0, impostoEst: false,
    recLiq: 0, custoObras: 0, cMat: 0, cMao: 0, cTerr: 0, lucroBruto: 0, despOper: 0, despOperReal: 0, despAdmin: 0, resultado: 0, mLiq: 0 };
  s.dre = { status: 'confirmada', calcGerencialConsolidado: () => dreZero,
    calcGerencialPorObra: () => ({ cMat: 0, cMao: 0, custoConstr: 0, margem: 0, margemPct: 0 }),
    calcGerencialOverhead: () => ({ total: 0, noResultado: 0, foraResultado: 0 }) };
  for (const tipo of ['analise', 'raiox', 'dre']) {
    const h = componentes();
    const html = Paginas.renderizar(tipo, contexto(s), h);
    assert.ok(h.chamadas.some(x => x.value === 0), tipo);
    assert.doesNotMatch(html, /NaN|Infinity/, tipo);
  }
});

test('Raio X não fabrica serviços, estoque ou pagamento da folha e usa diagnóstico confirmado', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  const h = componentes();
  const html = Paginas.renderizar('raiox', ctx, h);
  assert.deepEqual(h.chamadas.filter(x => x.tipo === 'metric').map(x => x.value), [14000, 10000, 4000, 47000]);
  assert.equal(h.chamadas.find(x => x.tipo === 'metric' && x.title === 'Custo das obras').key, 'constructionCost');
  assert.equal(h.chamadas.find(x => x.tipo === 'metric' && x.title === 'Lançamentos no período').key, 'cost');
  assert.equal(valor(h, 'estoque'), null);
  assert.equal(valor(h, 'folha'), null);
  assert.equal(valor(h, 'payable'), null);
  assert.match(html, /Material e serviços/);
  assert.match(html, /Fechamento de quinzena e lançamento FP não comprovam pagamento/);
  assert.match(html, /cobertura de todos os dias não foi verificada/);
  assert.doesNotMatch(html, /Serviços diretos|Materiais aplicados|Caixa e resultado conciliados|Folha completa/);
});

test('diagnóstico de folha de outra empresa é recusado e texto de motivos é escapado', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  ctx.envelope.folha = { companyId: 'outra-empresa', estado: 'pendencia_identificada', motivos: [{ severidade: 'pendencia', texto: 'SEGREDO DE OUTRA EMPRESA' }], obras: [] };
  assert.doesNotMatch(Paginas.renderizar('raiox', ctx, componentes()), /SEGREDO DE OUTRA EMPRESA/);
  ctx.envelope.folha = { companyId: s.companyId, estado: 'pendencia_identificada', motivos: [{ severidade: 'pendencia', texto: '<img src=x onerror=alert(1)>' }], obras: [] };
  const html = Paginas.renderizar('raiox', ctx, componentes());
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});

test('identidade ausente, divergente ou carga em andamento não publica números antigos', () => {
  for (const mudar of [ctx => { ctx.visao.companyId = 'outra-empresa'; }, ctx => { ctx.snapshot.companyId = ''; },
    ctx => { ctx.envelope.fase = 'carregando'; }, ctx => { ctx.envelope.snapshot = { companyId: 'outra-empresa' }; }]) {
    const ctx = contexto(snapshotReal().s);
    mudar(ctx);
    const h = componentes();
    const html = Paginas.renderizar('dre', ctx, h);
    assert.match(html, /Leitura financeira indisponível/);
    assert.equal(h.chamadas.length, 0);
  }
});

test('nomes e IDs com HTML não criam elementos nem atributos injetados', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  const id = 'a" onclick="alert(1)';
  ctx.snapshot.obras[0].id = id;
  ctx.visao.obras[0].id = id;
  ctx.visao.obras[0].nome = '<img src=x onerror=alert(1)> & "nome"';
  ctx.acumulada.obras[0].id = id;
  const html = Paginas.renderizar('analise', ctx, componentes());
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /data-work="a&quot; onclick=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /<img|data-work="a" onclick=/);
});

test('linha estrangeira ou obra sem origem confirmada bloqueia a página, sem expor nome', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  ctx.visao.obras.push({ id: 'foreign', nome: 'SEGREDO', company_id: 'outra-empresa' });
  const html = Paginas.renderizar('analise', ctx, componentes());
  assert.match(html, /Leitura financeira indisponível/);
  assert.doesNotMatch(html, /SEGREDO/);
});

test('DRE não confirmada conserva valores desconhecidos, inclusive escritório', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  ctx.visao.dre.empresa = { status: 'indisponivel', dados: { resultado: 999999 } };
  ctx.visao.dre.overhead = { status: 'parcial', dados: { total: 999999 } };
  const h = componentes();
  const html = Paginas.renderizar('dre', ctx, h);
  assert.equal(valor(h, 'dre:resultado'), null);
  assert.equal(valor(h, 'overhead:total'), null);
  assert.match(html, /Indisponível/);
  assert.doesNotMatch(html, /9\.999,99/);
});

test('reversões de custo não produzem largura negativa ou indefinida no gráfico', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  ctx.custoDre = { totalCentavos: -100, materialServicosCentavos: -100, maoCentavos: 0 };
  const html = Paginas.renderizar('raiox', ctx, componentes());
  assert.doesNotMatch(html, /width:-|width:NaN|width:Infinity/);
  assert.match(html, /width:0%/);
});

test('composição não confirmada não publica números anexados de leitura anterior', () => {
  const { s } = snapshotReal();
  const ctx = contexto(s);
  ctx.custoDre = { status: 'indisponivel', totalCentavos: 999999, materialServicosCentavos: 999999, maoCentavos: 999999 };
  const h = componentes();
  Paginas.renderizar('raiox', ctx, h);
  assert.deepEqual(h.chamadas.filter(x => x.tipo === 'metric').slice(0, 3).map(x => x.value), [null, null, null]);
});

test('módulo de navegador renderiza sem ler caches, DOM, rede ou escritas operacionais', () => {
  const proibidas = [];
  const proibir = nome => () => { proibidas.push(nome); throw new Error('Acesso proibido: ' + nome); };
  const ambiente = { FinanceiroVisaoModelo: Modelo, FinanceiroVisaoComposicao: Composicao, document: { getElementById: proibir('DOM') },
    fetch: proibir('fetch'), sbGet: proibir('sbGet'), sbPost: proibir('sbPost'), sbPatch: proibir('sbPatch'), sbDelete: proibir('sbDelete') };
  Object.defineProperty(ambiente, 'obras', { get: proibir('cache de obras') });
  Object.defineProperty(ambiente, 'localStorage', { get: proibir('localStorage') });
  vm.createContext(ambiente);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../js/edr-v2-visao-financeira-paginas.js'), 'utf8'), ambiente);
  const { s } = snapshotReal();
  for (const tipo of ['analise', 'raiox', 'dre']) {
    assert.match(ambiente.FinanceiroVisaoPaginas.renderizar(tipo, contexto(s), componentes()), /class="panel/);
  }
  assert.deepEqual(proibidas, []);
});

test('API recusa página desconhecida e componentes ausentes', () => {
  const { s } = snapshotReal();
  assert.throws(() => Paginas.renderizar('bank', contexto(s), componentes()), RangeError);
  assert.throws(() => Paginas.renderizar('analise', contexto(s), {}), TypeError);
  assert.ok(Object.isFrozen(Paginas));
});
