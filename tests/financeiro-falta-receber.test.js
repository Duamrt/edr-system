// Regressões financeiras locais: dados fictícios, VM e DOM em memória.
// Sem rede, banco, recebimentos reais, dependências externas ou janela de navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboardFonte = fs.readFileSync(require.resolve('../js/edr-v2-dashboard.js'), 'utf8');
const raioxFonte = fs.readFileSync(require.resolve('../js/edr-v2-raiox.js'), 'utf8');
const infraFonte = fs.readFileSync(require.resolve('../js/edr-v2-infra.js'), 'utf8');
// Extrai somente helpers puros: nunca inicializa infra/auth/Supabase.
const helper = nome => {
  const match = infraFonte.match(new RegExp('^function ' + nome + '\\([^]*?^}', 'm'));
  assert.ok(match, 'helper original deve existir: ' + nome);
  return match[0];
};
const texto = html => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const moeda = v => texto(Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const moedaK = v => 'R$ ' + Math.round(Number(v || 0)).toLocaleString('pt-BR');
const escapar = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clone = v => JSON.parse(JSON.stringify(v));
const obra = (id, valor = 0, extra = {}) => ({ id, nome: 'OBRA FICTICIA ' + id, valor_venda: valor, ...extra });
const repasse = (id, valor, tipo = 'pls', data = '2026-09-15') => ({ obra_id: id, valor, tipo, data_credito: data });
const adicional = (id, obraId, valor, status = 'aprovado') => ({ id, obra_id: obraId, valor, status, descricao: 'EXTRA FICTICIO ' + id });
const pgto = (adicionalId, valor, data = '2026-09-15') => ({ adicional_id: adicionalId, valor, data });
const lancamento = (id, valor, data = '2026-09-15', etapa = '04_alven') => ({ obra_id: id, total: valor, data, etapa });
const camposPendencia = ['faltaReceberContrato', 'faltaReceberAdicionais', 'faltaReceber', 'excedenteContrato', 'excedenteAdicionais'];

function ambiente(dados = {}) {
  const campos = Object.fromEntries(['dash-page-1', 'dash-dpage-1', 'view-raiox'].map(id => [id, { innerHTML: '' }]));
  const relatorios = [], chamadasProibidas = [];
  const bloquear = nome => () => { chamadasProibidas.push(nome); throw new Error(nome + ' PROIBIDO NO TESTE'); };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    document: { getElementById: id => campos[id] || null },
    obras: clone(dados.obras || []), obrasArquivadas: clone(dados.obrasArquivadas || []),
    lancamentos: clone(dados.lancamentos || []), distribuicoes: clone(dados.distribuicoes || []),
    repassesCef: clone(dados.repassesCef || []),
    obrasAdicionais: clone(dados.obrasAdicionais || []), adicionaisPgtos: clone(dados.adicionaisPgtos || []),
    CustosModule: { repassesCef: clone(dados.repassesModulo || []) },
    OBRAS_INTERNAS: clone(dados.internas || []),
    fmt: moeda, esc: escapar, getCatFromLanc: l => l.etapa, etapaLabel: String,
    fetch: bloquear('fetch'), sbGet: bloquear('sbGet'), sbPost: bloquear('sbPost'),
    sbPatch: bloquear('sbPatch'), sbDelete: bloquear('sbDelete'), sbRpc: bloquear('sbRpc'),
    setTimeout: bloquear('setTimeout'), requestAnimationFrame: bloquear('requestAnimationFrame'),
    showToast() {},
  };
  ctx.window = ctx;
  ctx.open = (url, alvo) => {
    assert.equal(url, ''); assert.equal(alvo, '_blank');
    const relatorio = { html: '', aberto: false, fechado: false };
    relatorios.push(relatorio);
    return { document: {
      open() { relatorio.aberto = true; },
      write(html) { relatorio.html += html; },
      close() { relatorio.fechado = true; },
    }, focus: bloquear('focus'), print: bloquear('print') };
  };
  ctx.DREModule = {
    listarObrasReais: () => ctx.obras.filter(o => !ctx.OBRAS_INTERNAS.includes(o.id)
      && !/ESCRIT|ALMOX/i.test(o.nome || '')),
  };
  vm.createContext(ctx);
  vm.runInContext(helper('getAdicionaisObra') + '\n' + helper('getAdicionaisGeral') + '\n' +
    dashboardFonte + '\n' + raioxFonte + `
    RaioxModule._cronoLoaded = true;
    globalThis.api = { DashboardModule, RaioxModule, _dashFinCalcObra, _dashBuildResumoFinanceiro,
      _dashCalcMetricas, _dashCalcPorObra, _dashFmtR, dashFinSetFiltro,
      _rxCalc, _rxTodas, _rxKpisHtml, _rxCardObra, _rxDocObra,
      renderRaiox, rxSetFiltro, rxEmitirRelatorio, getAdicionaisObra };
  `, ctx);
  const api = ctx.api;
  const resumo = () => api._dashBuildResumoFinanceiro(api._dashCalcPorObra(api._dashCalcMetricas().lancAtivos));
  const snapshot = () => JSON.stringify({ obras: ctx.obras, obrasArquivadas: ctx.obrasArquivadas,
    lancamentos: ctx.lancamentos, distribuicoes: ctx.distribuicoes, repassesCef: ctx.repassesCef,
    repassesModulo: ctx.CustosModule.repassesCef, obrasAdicionais: ctx.obrasAdicionais,
    adicionaisPgtos: ctx.adicionaisPgtos });
  return { ctx, api, campos, relatorios, chamadasProibidas, resumo, snapshot };
}

function valorAposRotulo(html, rotulo, valor) {
  const trecho = texto(html).split(rotulo)[1];
  assert.ok(trecho !== undefined, 'rótulo ausente: ' + rotulo);
  assert.ok(trecho.trimStart().startsWith(texto(valor)), rotulo + ' deve mostrar ' + valor + '; trecho: ' + trecho.slice(0, 100));
}
function conferirObra(a, o, contratoPendente, extrasPendentes, contratoExcedente = 0, extrasExcedentes = 0) {
  const d = a.api._dashFinCalcObra(o, null), r = a.api._rxCalc(o);
  assert.equal(d.faltaReceberContrato, contratoPendente);
  assert.equal(d.faltaReceberAdicionais, extrasPendentes);
  assert.equal(d.faltaReceber, contratoPendente + extrasPendentes);
  assert.equal(d.excedenteContrato, contratoExcedente);
  assert.equal(d.excedenteAdicionais, extrasExcedentes);
  assert.equal(r.aReceberContrato, contratoPendente);
  assert.equal(r.extrasReceber, extrasPendentes);
  assert.equal(r.aReceber, d.faltaReceber);
  assert.equal(r.excedenteContrato, d.excedenteContrato);
  assert.equal(r.excedenteAdicionais, d.excedenteAdicionais);
  assert.equal(r.receb, d.entradas, 'total recebido deve continuar igual entre telas');
  assert.equal(r.receita, d.receita, 'carteira deve continuar igual entre telas');
  assert.equal(r.custo, d.custo);
  assert.equal(r.caixa, d.saldo);
  return { d, r };
}
function congelar(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.values(v).forEach(congelar); Object.freeze(v);
  }
  return v;
}

for (const caso of [
  { nome: 'zero sem recebimento', contrato: 0, recebido: 0, falta: 0, excedente: 0 },
  { nome: 'cadastro sem valor de venda', recebido: 70, falta: 0, excedente: 70 },
  { nome: 'contrato zero com recebimento', contrato: 0, recebido: 80, falta: 0, excedente: 80 },
  { nome: 'contrato ainda sem recebimento', contrato: 1000, recebido: 0, falta: 1000, excedente: 0 },
  { nome: 'contrato parcial', contrato: 1000, recebido: 400, falta: 600, excedente: 0 },
  { nome: 'contrato quitado', contrato: 1000, recebido: 1000, falta: 0, excedente: 0 },
  { nome: 'contrato com excedente', contrato: 1000, recebido: 1300, falta: 0, excedente: 300 },
  { nome: 'valores numéricos vindos como texto', contrato: '1000.50', recebido: '400.25', falta: 600.25, excedente: 0 },
]) test('por obra: ' + caso.nome, () => {
  const o = obra('A', caso.contrato); if (caso.contrato === undefined) delete o.valor_venda;
  const a = ambiente({ obras: [o], repassesCef: caso.recebido ? [repasse('A', caso.recebido)] : [] });
  conferirObra(a, a.ctx.obras[0], caso.falta, 0, caso.excedente);
  assert.deepEqual(a.chamadasProibidas, []);
});

test('obra A com 20 mil pendentes e B com 5 mil excedentes conserva os dois valores separados', () => {
  const a = ambiente({ obras: [obra('A', 50000), obra('B', 10000)],
    repassesCef: [repasse('A', 30000), repasse('B', 15000)] });
  conferirObra(a, a.ctx.obras[0], 20000, 0);
  conferirObra(a, a.ctx.obras[1], 0, 0, 5000);
  const dash = a.resumo(), rx = a.api._rxKpisHtml(a.ctx.obras.map(a.api._rxCalc));
  valorAposRotulo(dash, 'FALTA RECEBER', moeda(20000));
  valorAposRotulo(dash, 'RECEBIDO ACIMA DO CONTRATO CADASTRADO', moeda(5000));
  valorAposRotulo(rx, 'Falta receber', moedaK(20000));
  valorAposRotulo(rx, 'Recebido acima do contrato cadastrado', moeda(5000));
  assert.doesNotMatch(texto(dash), /A RECEBER DA CARTEIRA/);
  assert.doesNotMatch(texto(dash), /RECEBIDO ACIMA DOS ADICIONAIS CADASTRADOS/);
});

test('excedente de contrato não cobre adicional e excedente de adicional não cobre contrato', () => {
  const a = ambiente({ obras: [obra('A', 100), obra('B', 100)],
    repassesCef: [repasse('A', 120), repasse('B', 60)],
    obrasAdicionais: [adicional('AD-A', 'A', 60), adicional('AD-B', 'B', 60)],
    adicionaisPgtos: [pgto('AD-A', 20), pgto('AD-B', 90)] });
  conferirObra(a, a.ctx.obras[0], 0, 40, 20, 0);
  conferirObra(a, a.ctx.obras[1], 40, 0, 0, 30);
  const dash = a.resumo(), rx = a.api._rxKpisHtml(a.ctx.obras.map(a.api._rxCalc));
  valorAposRotulo(dash, 'FALTA RECEBER', moeda(80));
  valorAposRotulo(dash, 'RECEBIDO ACIMA DO CONTRATO CADASTRADO', moeda(20));
  valorAposRotulo(dash, 'RECEBIDO ACIMA DOS ADICIONAIS CADASTRADOS', moeda(30));
  valorAposRotulo(rx, 'Falta receber', moedaK(80));
  valorAposRotulo(rx, 'Recebido acima do contrato cadastrado', moeda(20));
  valorAposRotulo(rx, 'Recebido acima dos adicionais cadastrados', moeda(30));
  for (const r of a.ctx.obras.map(a.api._rxCalc)) {
    const card = a.api._rxCardObra(r), doc = a.api._rxDocObra(r);
    const label = r.excedenteContrato ? 'Recebido acima do contrato cadastrado' : 'Recebido acima dos adicionais cadastrados';
    const val = r.excedenteContrato || r.excedenteAdicionais;
    valorAposRotulo(card, label, moeda(val)); valorAposRotulo(doc, label, moeda(val));
  }
});

test('consolidado soma pendências e excedentes de várias obras sem perder custos e recebidos', () => {
  const a = ambiente({ obras: [obra('A', 500), obra('B', 200), obra('C'), obra('D', 100)],
    repassesCef: [repasse('A', 200), repasse('B', 240), repasse('C', 10), repasse('D', 100)],
    obrasAdicionais: [adicional('AD-A', 'A', 80), adicional('AD-B', 'B', 60), adicional('AD-C', 'C', 50)],
    adicionaisPgtos: [pgto('AD-A', 100), pgto('AD-B', 30), pgto('AD-C', 25)],
    lancamentos: [lancamento('A', 30), lancamento('B', 20), lancamento('C', 10), lancamento('D', 5)] });
  const linhas = a.ctx.obras.map(a.api._rxCalc);
  const faltas = linhas.reduce((s, r) => s + r.aReceber, 0);
  assert.equal(faltas, 355);
  assert.equal(linhas.reduce((s, r) => s + r.excedenteContrato, 0), 50);
  assert.equal(linhas.reduce((s, r) => s + r.excedenteAdicionais, 0), 20);
  assert.equal(linhas.reduce((s, r) => s + r.receb, 0), 705);
  assert.equal(linhas.reduce((s, r) => s + r.receita, 0), 990);
  const dash = a.resumo();
  valorAposRotulo(dash, 'FALTA RECEBER', moeda(355));
  valorAposRotulo(dash, 'RECEBIDO ACIMA DO CONTRATO CADASTRADO', moeda(50));
  valorAposRotulo(dash, 'RECEBIDO ACIMA DOS ADICIONAIS CADASTRADOS', moeda(20));
  valorAposRotulo(dash, 'RECEBIDO', moeda(705));
  valorAposRotulo(dash, 'APLICADO NAS OBRAS', moeda(65));
  assert.equal(990 - 705, faltas - 50 - 20, 'identidade da carteira permite conciliar sem liquidar as pendências');
});

test('PLS, entrada, terreno e repasse legado continuam recebidos do contrato apenas na obra correspondente', () => {
  const a = ambiente({ obras: [obra('A', 1000)], repassesCef: [repasse('A', 100, 'pls'),
    repasse('A', 200, 'entrada'), repasse('A', 300, 'terreno'),
    { obra_id: 'A', valor: 50, data_credito: '2026-09-15' }, repasse('OUTRA', 9000, 'terreno')] });
  const { d, r } = conferirObra(a, a.ctx.obras[0], 350, 0);
  assert.equal(d.receb, 650); assert.equal(r.recebContrato, 650);
});

test('fonte global de repasses tem precedência e fallback do CustosModule não duplica recebimento', () => {
  const a = ambiente({ obras: [obra('A', 500)], repassesCef: [repasse('A', 200)], repassesModulo: [repasse('A', 300)] });
  conferirObra(a, a.ctx.obras[0], 300, 0);
  a.ctx.repassesCef.length = 0;
  conferirObra(a, a.ctx.obras[0], 200, 0);
  delete a.ctx.repassesCef;
  conferirObra(a, a.ctx.obras[0], 200, 0);
  a.ctx.CustosModule.repassesCef.length = 0;
  conferirObra(a, a.ctx.obras[0], 500, 0);
});

test('geral mantém extras pendentes e cancelados fora da receita e do recebido', () => {
  const a = ambiente({ obras: [obra('A', 100)], repassesCef: [repasse('A', 100)],
    obrasAdicionais: [adicional('OK', 'A', 200), adicional('PEND', 'A', 500, 'pendente'), adicional('CANC', 'A', 700, 'cancelado'), adicional('OUT', 'OUTRA', 999)],
    adicionaisPgtos: [pgto('OK', 100), pgto('PEND', 90), pgto('CANC', 110), pgto('OUT', 900)] });
  const { d, r } = conferirObra(a, a.ctx.obras[0], 0, 100);
  assert.equal(d.receita, 300); assert.equal(d.entradas, 200); assert.equal(r.adicQtd, 1);
  const doc = a.api._rxDocObra(r);
  assert.match(doc, /EXTRA FICTICIO OK/);
  assert.doesNotMatch(doc, /EXTRA FICTICIO (?:PEND|CANC|OUT)/);
});

test('mensal mantém o fluxo e a política atual dos extras, sem pendências ou excedentes acumulados', () => {
  const a = ambiente({ obras: [obra('A', 100)],
    repassesCef: [repasse('A', 30), repasse('A', 70, 'terreno', '2026-10-03')],
    obrasAdicionais: [adicional('OK', 'A', 200), adicional('PEND', 'A', 500, 'pendente'), adicional('CANC', 'A', 700, 'cancelado')],
    adicionaisPgtos: [pgto('OK', 40), pgto('OK', 60, '2026-10-03'), pgto('PEND', 90), pgto('CANC', 110)],
    lancamentos: [lancamento('A', 10, '2026-09-10', '28_mao'), lancamento('A', 15), lancamento('A', 200, '2026-10-01')] });
  const d = a.api._dashFinCalcObra(a.ctx.obras[0], '2026-09');
  assert.equal(d.receb, 30); assert.equal(d.adds.totalRecebido, 240);
  assert.equal(d.entradas, 270); assert.equal(d.custo, 25); assert.equal(d.mao, 10); assert.equal(d.saldo, 245);
  assert.equal(d.pctReceb, null);
  for (const campo of camposPendencia) assert.equal(d[campo], 0, 'mensal deve zerar ' + campo);
  a.api.dashFinSetFiltro('2026-09');
  assert.equal(a.api.DashboardModule.finFiltro, '2026-09');
  assert.equal(a.campos['dash-page-1'].innerHTML, a.campos['dash-dpage-1'].innerHTML, 'mobile e desktop recebem o mesmo resumo');
  const mensal = a.campos['dash-page-1'].innerHTML;
  valorAposRotulo(mensal, 'RECEBIDO NO MES', moeda(270));
  valorAposRotulo(mensal, 'APLICADO NO MES', moeda(25));
  valorAposRotulo(mensal, 'DISPONIVEL NO MES', moeda(245));
  assert.doesNotMatch(texto(mensal), /FALTA RECEBER|RECEBIDO ACIMA/);
  a.api.dashFinSetFiltro('2026-11');
  valorAposRotulo(a.campos['dash-page-1'].innerHTML, 'RECEBIDO NO MES', moeda(0));
  assert.match(texto(a.campos['dash-page-1'].innerHTML), /Nenhum movimento neste mes/);
  a.api.dashFinSetFiltro(null);
  assert.equal(a.campos['dash-page-1'].innerHTML, a.campos['dash-dpage-1'].innerHTML);
  valorAposRotulo(a.campos['dash-page-1'].innerHTML, 'FALTA RECEBER', moeda(100));
  assert.deepEqual(a.chamadasProibidas, []);
});

test('sem helper ou dados de adicionais, os fallbacks mantêm contrato e mensal funcionais', () => {
  const a = ambiente({ obras: [obra('A', 500)], repassesCef: [repasse('A', 200)] });
  delete a.ctx.getAdicionaisObra; delete a.ctx.obrasAdicionais; delete a.ctx.adicionaisPgtos;
  conferirObra(a, a.ctx.obras[0], 300, 0);
  const mensal = a.api._dashFinCalcObra(a.ctx.obras[0], '2026-09');
  assert.equal(mensal.entradas, 200);
  for (const campo of camposPendencia) assert.equal(mensal[campo], 0);
});

function ambienteEscopos() {
  return ambiente({ obras: [obra('A', 50000), obra('B', 10000), obra('INTERNA', 1000, { nome: 'ESTRUTURA FICTICIA' })],
    obrasArquivadas: [obra('ARQ', 20000, { arquivada: true })], internas: ['INTERNA'],
    repassesCef: [repasse('A', 30000), repasse('B', 15000), repasse('ARQ', 5000), repasse('INTERNA', 5000)],
    lancamentos: [lancamento('INTERNA', 700)] });
}

test('Painel preserva obras ativas reais e Raio X preserva todas/andamento/concluídas/estrutura', () => {
  const a = ambienteEscopos(), dash = a.resumo();
  valorAposRotulo(dash, 'FALTA RECEBER', moeda(20000));
  valorAposRotulo(dash, 'RECEBIDO ACIMA DO CONTRATO CADASTRADO', moeda(5000));
  assert.doesNotMatch(dash, /OBRA FICTICIA ARQ|ESTRUTURA FICTICIA/);
  assert.equal(a.api._rxTodas().length, 4);
  for (const [filtro, falta, excedente] of [['todas', 35000, 5000], ['andamento', 20000, 5000], ['concluida', 15000, 0], ['estrutura', 0, 0]]) {
    a.api.rxSetFiltro(filtro);
    const html = a.campos['view-raiox'].innerHTML;
    valorAposRotulo(html, 'Falta receber', moedaK(falta));
    valorAposRotulo(html, 'Recebido acima do contrato cadastrado', moeda(excedente));
    if (filtro === 'andamento') assert.doesNotMatch(html, /OBRA FICTICIA ARQ|ESTRUTURA FICTICIA/);
    if (filtro === 'concluida') assert.doesNotMatch(html, /OBRA FICTICIA A<|OBRA FICTICIA B<|ESTRUTURA FICTICIA/);
    if (filtro === 'todas' || filtro === 'estrutura') assert.match(html, /ESTRUTURA FICTICIA/);
  }
  assert.deepEqual(a.chamadasProibidas, []);
});

test('relatório completo mantém todas as obras reais e excedentes separados sem abrir janela real', () => {
  const a = ambienteEscopos();
  a.ctx.obrasAdicionais.push(adicional('AD-A', 'A', 1000)); a.ctx.adicionaisPgtos.push(pgto('AD-A', 1400));
  a.api.RaioxModule.filtro = 'andamento';
  a.api.rxEmitirRelatorio();
  assert.equal(a.relatorios.length, 1);
  const r = a.relatorios[0]; assert.equal(r.aberto, true); assert.equal(r.fechado, true);
  valorAposRotulo(r.html, 'Falta receber', moedaK(35000));
  valorAposRotulo(r.html, 'Recebido acima do contrato cadastrado', moeda(5000));
  valorAposRotulo(r.html, 'Recebido acima dos adicionais cadastrados', moeda(400));
  assert.match(r.html, /OBRA FICTICIA ARQ/); assert.match(r.html, /ESTRUTURA FICTICIA/);
  assert.deepEqual(a.chamadasProibidas, [], 'relatório deve ser somente HTML no documento falso');
});

test('KPI de excedente contratual aparece zerado e extras sem excedente não criam KPI', () => {
  const a = ambiente({ obras: [obra('A', 100)], repassesCef: [repasse('A', 100)] });
  valorAposRotulo(a.resumo(), 'RECEBIDO ACIMA DO CONTRATO CADASTRADO', moeda(0));
  const rx = a.api._rxKpisHtml(a.ctx.obras.map(a.api._rxCalc));
  valorAposRotulo(rx, 'Recebido acima do contrato cadastrado', moeda(0));
  assert.doesNotMatch(rx, /Recebido acima dos adicionais cadastrados/);
  const card = a.api._rxCardObra(a.api._rxCalc(a.ctx.obras[0]));
  assert.doesNotMatch(card, /Recebido acima/); assert.match(texto(card), /Falta receber quitado/);
});

test('cálculos, filtros, cards e relatório conservam todos os registros e escapam nome de obra', () => {
  const a = ambiente({ obras: [obra('A', 100, { nome: '<img src=x onerror="falha()">' }), obra('B', 200)],
    repassesCef: [repasse('A', 120), repasse('B', 70)], obrasAdicionais: [adicional('AD', 'B', 50)],
    adicionaisPgtos: [pgto('AD', 80)], lancamentos: [lancamento('A', 10), lancamento('B', 30)],
    distribuicoes: [{ obra_id: 'B', valor: 30 }] });
  const antes = a.snapshot();
  for (const lista of ['obras', 'obrasArquivadas', 'repassesCef', 'lancamentos', 'distribuicoes', 'obrasAdicionais', 'adicionaisPgtos']) congelar(a.ctx[lista]);
  for (const o of a.ctx.obras) { a.api._dashFinCalcObra(o, null); a.api._dashFinCalcObra(o, '2026-09'); a.api._rxCalc(o); }
  const dash = a.resumo(); assert.doesNotMatch(dash, /<img src=x/); assert.match(dash, /&lt;img/);
  a.api.dashFinSetFiltro('2026-09'); a.api.dashFinSetFiltro(null);
  a.api.rxSetFiltro('todas'); assert.doesNotMatch(a.campos['view-raiox'].innerHTML, /<img src=x/);
  a.api.rxEmitirRelatorio(); assert.doesNotMatch(a.relatorios[0].html, /<img src=x/);
  assert.equal(a.snapshot(), antes, 'cálculo e exibição não alteram contrato, custo, terreno ou recebimentos');
  assert.deepEqual(a.chamadasProibidas, []);
});

test('adicional de obra com valor zero permanece nos totais mesmo quando a linha segue oculta', () => {
  const a = ambiente({ obras: [obra('ZERO', 0)], lancamentos: [lancamento('ZERO', 0)],
    obrasAdicionais: [adicional('AD-ZERO', 'ZERO', 120)] });
  const porObra = a.api._dashCalcPorObra(a.api._dashCalcMetricas().lancAtivos);
  assert.equal(porObra.length, 1, 'lançamento existente mantém a obra na fonte atual do Painel');
  conferirObra(a, a.ctx.obras[0], 0, 120);
  const html = a.resumo();
  valorAposRotulo(html, 'FALTA RECEBER', moeda(120));
  valorAposRotulo(html, 'RECEBIDO ACIMA DO CONTRATO CADASTRADO', moeda(0));
  assert.match(texto(html), /Carteira: R\$ 120,00/);
  assert.doesNotMatch(html, /OBRA FICTICIA ZERO/, 'regra atual da linha por obra continua preservada');
  const rx = a.api._rxKpisHtml(a.ctx.obras.map(a.api._rxCalc));
  valorAposRotulo(rx, 'Falta receber', moedaK(120));
  assert.deepEqual(a.chamadasProibidas, []);
});
