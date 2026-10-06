'use strict';
// Origens e drawers com fixtures sinteticas e engine DRE real, sem rede/DOM/writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const detalhes = require('../js/edr-v2-visao-financeira-detalhes.js');
const modelo = require('../js/edr-v2-visao-financeira-modelo.js');
const contexto = require('../js/edr-v2-visao-financeira-contexto.js');
const folha = require('../js/edr-v2-visao-financeira-folha.js');
const composicao = require('../js/edr-v2-visao-financeira-composicao.js');
const COMPANY = 'empresa-sintetica-detalhes';
const clone = v => JSON.parse(JSON.stringify(v));
const row = (id, fields = {}) => ({ id, company_id: COMPANY, ...fields });
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const h = { esc, money: v => Number.isSafeInteger(v) ? 'R$ ' + (v / 100).toFixed(2) : 'Indisponivel' };
function fixture() {
  const l = (id, obra_id, total, etapa = '04_alven', data = '2001-06-05', extra = {}) => row(id, { obra_id, total, etapa, data, descricao: 'Custo sintetico ' + id, obs: null, ...extra });
  const r = (id, obra_id, valor, tipo = 'pls') => row(id, { obra_id, valor, tipo, data_credito: '2001-06-05' });
  return {
    companyId: COMPANY, company_id: COMPANY, ator_id: 'ator-sintetico', perfil: 'admin',
    obras: [row('a', { nome: 'Obra sintetica A', valor_venda: 100, area_m2: 50, arquivada: false }),
      row('b', { nome: 'Obra sintetica B', valor_venda: 80, area_m2: 40, arquivada: true }),
      row('c', { nome: 'Obra sintetica C', valor_venda: 50, area_m2: 25, arquivada: false }),
      row('office', { nome: 'ESCRITORIO SINTETICO', valor_venda: 0 }), row('qa', { nome: 'OBRA QA SINTETICA', valor_venda: 999 })],
    lancamentos: [l('mat-a', 'a', 35), l('mao-a', 'a', 15, '28_mao'), l('terra-a', 'a', 12, '35_terreno'),
      l('oper-a', 'a', 3, '03_alimentacao'), l('tax-a', 'a', 4, '24_imposto'), l('mat-b', 'b', 80),
      l('mat-c', 'c', 10), l('off-oper', 'office', 7, '34_tecnologia'), l('off-mat', 'office', 5),
      l('qa-mat', 'qa', 999), l('qa-tax', 'qa', 999, '24_imposto')],
    repasses: [r('rep-a', 'a', 75), r('rep-b', 'b', 100), r('rep-c', 'c', 20), r('rep-qa', 'qa', 999)],
    adicionais: [row('add-1', { obra_id: 'a', descricao: 'Adicional um', valor: 10, status: 'aprovado' }),
      row('add-2', { obra_id: 'a', descricao: 'Adicional dois', valor: 20, status: 'aprovado' }),
      row('add-p', { obra_id: 'c', descricao: 'Adicional pendente', valor: 100, status: 'pendente' }),
      row('add-x', { obra_id: 'c', descricao: 'Adicional cancelado', valor: 100, status: 'cancelado' })],
    pagamentosAdicionais: [row('pag-1', { adicional_id: 'add-1', valor: 15, data: '2001-06-06' }),
      row('pag-p', { adicional_id: 'add-p', valor: 5, data: '2001-06-06' }), row('pag-x', { adicional_id: 'add-x', valor: 3, data: '2001-06-06' })],
    contasPagar: [row('admin', { descricao: 'Conta administrativa sintetica', valor: 20, status: 'pago', data_pagamento: '2001-06-05', obra_id: null }),
      row('partial', { descricao: 'Obrigacao sintetica parcial', valor: 400, status: 'pendente', data_vencimento: '2001-07-05', obra_id: 'a' })],
    notas: [], quinzenas: [], diarias: [], extras: [], OBRAS_INTERNAS: ['office'], obrasInternas: ['office'],
    ledger: { status: 'confirmada', estado: { company_id: COMPANY, contas: [
      { id: 'bank', codigo: 'banco', nome: 'Banco sintetico', abertura_centavos: 80000, saldo_centavos: 80000, corte_em: '2001-05-01T12:00:00Z', fuso: 'America/Sao_Paulo' },
      { id: 'cash', codigo: 'dinheiro', nome: 'Dinheiro sintetico', abertura_centavos: 20000, saldo_centavos: 20000, corte_em: '2001-05-01T12:00:00Z', fuso: 'America/Sao_Paulo' }],
      total_centavos: 100000, movimentos: [], pagamentos: [
        { conta_pagar_id: 'partial', pago_centavos: 15000, restante_centavos: 25000 },
        { conta_pagar_id: 'admin', pago_centavos: 2000, restante_centavos: 0 }] } }
  };
}
const fonteDre = fs.readFileSync(require.resolve('../js/edr-v2-dre.js'), 'utf8');
function engine(s) {
  const proibido = () => { throw new Error('Efeito externo proibido.'); };
  const c = { window: null, console: { log() {}, warn() {}, error() {} }, document: {},
    fetch: proibido, sbGet: proibido, sbPost: proibido, sbPatch: proibido, sbDelete: proibido, initDiarias: proibido,
    obras: [row('GLOBAL', { nome: 'GLOBAL NAO DEVE VAZAR', valor_venda: 99999 })], obrasArquivadas: [],
    lancamentos: [], repassesCef: [], obrasAdicionais: [], adicionaisPgtos: [], notas: [] };
  c.window = c; vm.createContext(c); vm.runInContext(fonteDre, c);
  return c.DREModule.criarContextoLeitura(s);
}
function criarCtx(s = fixture(), f = { periodo: '2001-06', situacao: 'ativas', obraId: '' }) {
  s = { ...s, fontes: Object.fromEntries(['obras', 'lancamentos', 'repasses', 'adicionais', 'pagamentosAdicionais',
    'contasPagar', 'notas', 'quinzenas', 'diarias', 'extras', 'dre', 'ledger'].map(n => [n, { status: 'confirmada' }])) };
  s.dre = { status: 'confirmada', ...engine(s) };
  const visao = modelo.construir(s, f);
  return contexto.construir({ fase: 'pronta', snapshot: s, visao, filtro: visao.filtro,
    folha: folha.avaliar(s, visao.filtro), consultadoEm: '2001-06-07T12:00:00Z' });
}
const somaRows = d => d.rows.reduce((s, r) => s + (r.valorCentavos || 0), 0);

test('resultReceipts soma recebimentos menos TODAS categorias com origens assinadas unicas', () => {
  const s = fixture();
  s.repasses.push(row('terrain-receipt', { obra_id: 'a', valor: 10, tipo: 'terreno', data_credito: '2001-06-06' }));
  for (const [id, total, etapa] of [['exp', 2, '14_expediente'], ['comb', 1, '07_combustivel'],
    ['limp', 0.5, '25_limpeza'], ['tech', 0.25, '34_tecnologia'], ['unknown-material', 1.5, 'etapa_nao_cadastrada']]) {
    s.lancamentos.push(row(id, { obra_id: 'a', total, etapa, data: '2001-06-06', descricao: 'Despesa sintetica ' + id, obs: null }));
  }
  const ctx = criarCtx(s), c = composicao.construir(ctx, 'a'), d = detalhes.construir('resultReceipts', ctx, h, 'a');
  assert.equal(c.recebidoCentavos, 10000); assert.equal(c.custoCentavos, 7425);
  assert.equal(d.valueCentavos, 2575); assert.equal(somaRows(d), d.valueCentavos);
  assert.equal(d.title, 'Resultado sobre recebimentos');
  assert.equal(new Set(d.rows.map(r => r.id)).size, d.rows.length);
  assert.equal(d.rows.filter(r => r.id.startsWith('lancamentos:')).reduce((n, r) => n + r.valorCentavos, 0), -7425);
  for (const cat of c.categorias) assert.ok(d.extra.includes(esc(cat.label)), cat.id);
  assert.ok(d.extra.includes('antes de ' + c.margemConstrucao.exclusoes.map(cat => String(cat.label).toLocaleLowerCase('pt-BR')).join(', ')));
  assert.match(d.extra, /RECEBIDO MENOS CUSTOS/); assert.match(d.extra, /R\$ 100.00 − R\$ 74.25 = R\$ 25.75/);
  assert.match(d.note, /Não representa saldo em conta nem lucro final da obra/);
  assert.equal(d.rows.some(r => r.obraNome === 'Obra sintetica B' || r.obraNome === 'ESCRITORIO SINTETICO'), false);
  assert.equal(detalhes.construir('cost', ctx, h, 'a').valueCentavos, 7425, 'cost card permanece todos custos');
  const excluidos = c.margemConstrucao.exclusoes.reduce((n, r) => n + r.centavos, 0);
  assert.equal(c.margemConstrucao.resultadoCentavos + c.margemConstrucao.recebimentoTerrenoCentavos
    - c.margemConstrucao.adicionaisForaCarteiraCentavos - excluidos, d.valueCentavos);
});

test('nested margem identifica adicionais fora carteira e nao altera DRE existente', () => {
  const ctx = criarCtx(), antes = JSON.stringify(ctx), c = composicao.construir(ctx, 'c');
  const d = detalhes.construir('resultReceipts', ctx, h, 'c');
  assert.equal(d.valueCentavos, 1000); assert.equal(somaRows(d), 1000);
  assert.equal(c.margemConstrucao.resultadoCentavos, 1800); assert.equal(c.margemConstrucao.adicionaisForaCarteiraCentavos, 800);
  assert.match(d.extra, /Adicionais fora da carteira elegível/); assert.match(d.extra, /R\$ -8.00/);
  assert.equal(d.rows.some(r => r.id === 'pagamentosAdicionais:pag-p' || r.id === 'pagamentosAdicionais:pag-x'), false);
  assert.equal(detalhes.construir('result', ctx, h, 'c').valueCentavos, 1800);
  assert.equal(detalhes.construir('dre:recConstr', ctx, h, 'c').valueCentavos, 2800);
  assert.equal(JSON.stringify(ctx), antes);
});

test('resultado por origem preserva centavos e mostra DRE decimal apenas como referencia separada', () => {
  const s = fixture(); s.repasses = [row('one', { obra_id: 'a', valor: '0.006', tipo: 'pls', data_credito: '2001-06-05' }),
    row('two', { obra_id: 'a', valor: '0.006', tipo: 'pls', data_credito: '2001-06-05' })];
  s.adicionais = []; s.pagamentosAdicionais = []; s.lancamentos = [];
  const ctx = criarCtx(s), d = detalhes.construir('resultReceipts', ctx, h, 'a');
  assert.equal(d.valueCentavos, 2); assert.equal(somaRows(d), 2);
  assert.equal(d.rows.length, 2); assert.equal(detalhes.construir('result', ctx, h, 'a').valueCentavos, 1);
  assert.match(d.extra, /Referência do cálculo separado da DRE/);
  assert.match(d.extra, /sem custos\/despesas excluídos identificados/);
  assert.match(d.extra, /soma de decimais brutos: R\$ 0.01/);
  assert.equal(d.rows.some(r => /ajuste|arredondamento/i.test(r.descricao)), false);
});

test('estorno e custo negativo conciliam efeito positivo sem duplicar origem', () => {
  const s = fixture(); s.lancamentos.push(row('estorno', { obra_id: 'a', total: -2.25, etapa: '07_combustivel',
    data: '2001-06-06', descricao: 'Estorno sintetico', obs: null }));
  const d = detalhes.construir('resultReceipts', criarCtx(s), h, 'a');
  assert.equal(d.valueCentavos, 2325); assert.equal(somaRows(d), 2325);
  assert.equal(d.rows.find(r => r.id === 'lancamentos:estorno').valorCentavos, 225);
});

test('laborM2 usa mao acumulada, mesma area e nao divulga trabalhador nem pagamento', () => {
  const s = fixture(); s.lancamentos.find(r => r.id === 'mao-a').descricao = 'FUNCIONARIO_SINTETICO_NAO_DIVULGAR';
  s.lancamentos.push(row('mao-antes', { obra_id: 'a', total: 3.5, etapa: '28_mao', data: '2001-05-05',
    descricao: 'FUNCIONARIO_SINTETICO_NAO_DIVULGAR', obs: null }));
  const ctx = criarCtx(s, { periodo: '2001-07', situacao: 'ativas', obraId: '' });
  const d = detalhes.construir('laborM2', ctx, h, 'a');
  assert.equal(d.valueCentavos, 37); assert.equal(somaRows(d), 1850);
  assert.deepEqual(d.rows.map(r => r.id), ['lancamentos:mao-a', 'lancamentos:mao-antes']);
  assert.equal(JSON.stringify(d).includes('FUNCIONARIO_SINTETICO_NAO_DIVULGAR'), false);
  assert.match(d.note, /Indicador parcial/); assert.match(d.note, /Avanço físico e custo final/);
  assert.match(d.note, /mês selecionado não confirma a cobertura acumulada/); assert.match(d.note, /Não comprova pagamento/);
  assert.equal(detalhes.construir('resultReceipts', ctx, h, 'a').valueCentavos, 0);
});

test('laborM2 respeita area valida, zero confirmado e fonte de custos indisponivel', () => {
  for (const area of [null, 0, -1, '', 'abc']) {
    const s = fixture(); s.obras[0].area_m2 = area;
    assert.equal(detalhes.construir('laborM2', criarCtx(s), h, 'a').valueCentavos, null);
  }
  const s = fixture(); s.obras[0].area_m2 = '42';
  assert.equal(detalhes.construir('laborM2', criarCtx(s), h, 'a').valueCentavos, Math.round(1500 / 42));
  const zero = fixture(); zero.lancamentos = zero.lancamentos.filter(r => r.id !== 'mao-a');
  assert.equal(detalhes.construir('laborM2', criarCtx(zero), h, 'a').valueCentavos, 0);
  const base = criarCtx(); const snapshot = { ...base.snapshot, lancamentos: null, dre: { status: 'indisponivel' },
    fontes: { ...base.snapshot.fontes, lancamentos: { status: 'indisponivel' }, dre: { status: 'indisponivel' } } };
  const visao = modelo.construir(snapshot, base.filtro), ctx = contexto.construir({ ...base.envelope, snapshot, visao });
  for (const key of ['laborM2', 'resultReceipts']) {
    const d = detalhes.construir(key, ctx, h, 'a'); assert.equal(d.valueCentavos, null); assert.equal(d.rows.length, 0);
    assert.match(d.note, /Valor não confirmado/);
  }
});

test('laborM2 usa somente folha agregada recebida e distingue pendencia comprovada de fonte unknown', () => {
  const base = criarCtx(fixture(), { periodo: '', situacao: 'ativas', obraId: '' });
  function ctxComFolha(f) { return contexto.construir({ ...base.envelope, folha: f }); }
  const agregado = { companyId: COMPANY, filtro: base.filtro, obras: [{ obraId: 'a', cobertura: 'confirmada',
    estado: 'pendencia_identificada', motivos: [{ severidade: 'pendencia', texto: 'FUNCIONARIO_SINTETICO_NAO_DIVULGAR' }] }] };
  const pendente = detalhes.construir('laborM2', ctxComFolha(agregado), h, 'a');
  assert.equal(pendente.valueCentavos, 30); assert.match(pendente.note, /pendência de folha comprovada/);
  assert.equal(JSON.stringify(pendente).includes('FUNCIONARIO_SINTETICO_NAO_DIVULGAR'), false);
  const unknown = detalhes.construir('laborM2', ctxComFolha(null), h, 'a');
  assert.equal(unknown.valueCentavos, 30); assert.match(unknown.note, /não é possível verificar pendências/);
  assert.equal(unknown.note.includes('pendência de folha comprovada'), false);
});

test('novos detalhes conservam escopo da obra e leitura imutavel em ausencia da DRE', () => {
  const base = criarCtx(), snapshot = { ...base.snapshot, dre: { status: 'indisponivel' },
    fontes: { ...base.snapshot.fontes, dre: { status: 'indisponivel' } } };
  const visao = modelo.construir(snapshot, base.filtro), ctx = contexto.construir({ ...base.envelope, snapshot, visao });
  const antes = JSON.stringify(ctx);
  assert.equal(detalhes.construir('resultReceipts', ctx, h, 'a').valueCentavos, 2100);
  assert.equal(detalhes.construir('laborM2', ctx, h, 'a').valueCentavos, 30);
  assert.equal(detalhes.construir('result', ctx, h, 'a').valueCentavos, null);
  for (const key of ['resultReceipts', 'laborM2']) {
    assert.equal(detalhes.construir(key, ctx, h, 'b').valueCentavos, null);
    assert.equal(detalhes.construir(key, ctx, h, 'inexistente').valueCentavos, null);
    assert.equal(Object.isFrozen(detalhes.construir(key, ctx, h, 'a')), true);
  }
  assert.equal(JSON.stringify(ctx), antes);
});

test('recebiveis separa contratos e cada adicional sem compensar excessos', () => {
  const ctx = criarCtx();
  const d = detalhes.construir('receivables', ctx, h);
  assert.equal(d.valueCentavos, 7500); // A25 + adicional2 20 + C30, excesso adicional1 5 separado.
  assert.equal(detalhes.construir('receivableContract', ctx, h).valueCentavos, 5500);
  assert.equal(detalhes.construir('receivableExtras', ctx, h).valueCentavos, 2000);
  const excesso = detalhes.construir('receivableExcess', ctx, h);
  assert.equal(excesso.valueCentavos, 500);
  assert.match(excesso.extra, /A MAIOR NESTA OBRA/);
  for (const classe of ['receivable-detail-work', 'table-wrap', 'data-table', 'formula', 'detail-note']) assert.ok(d.extra.includes(classe));
  assert.match(d.extra, /Adicional um/); assert.match(d.extra, /Adicional dois/);
  assert.equal(d.extra.includes('Adicional pendente'), false);
  assert.equal(d.extra.includes('Adicional cancelado'), false);
  assert.equal(d.rows.some(r => r.id === 'pag-p' || r.id === 'pag-x' || r.id === 'rep-b'), false);
  const contratos = detalhes.construir('receivableContract', ctx, h);
  const adicionais = detalhes.construir('receivableExtras', ctx, h);
  assert.deepEqual(Array.from(contratos.extra.matchAll(/<small>A RECEBER DO CONTRATO NESTA OBRA<\/small>R\$ ([\d.]+)/g), m => Number(m[1])), [25, 30]);
  assert.deepEqual(Array.from(adicionais.extra.matchAll(/<small>A RECEBER DOS ADICIONAIS NESTA OBRA<\/small>R\$ ([\d.]+)/g), m => Number(m[1])), [20, 0]);
});

test('obra contextual reconstroi mesma selecao, adicionais e custos sem globais', () => {
  const ctx = criarCtx();
  const d = detalhes.construir('receivables', ctx, h, 'c');
  assert.equal(d.valueCentavos, 3000);
  assert.deepEqual(d.rows.map(r => r.id), ['rep-c']);
  assert.equal(d.extra.includes('Obra sintetica A'), false);
  assert.equal(d.extra.includes('GLOBAL'), false);
  assert.equal(detalhes.construir('cost', ctx, h, 'c').valueCentavos, 1000);
  assert.deepEqual(detalhes.construir('cost', ctx, h, 'c').rows.map(r => r.id), ['mat-c']);
  assert.equal(detalhes.construir('receivables', ctx, h, 'b').valueCentavos, null, 'arquivada fora do recorte ativo');
  assert.equal(detalhes.construir('receivables', ctx, h, 'inexistente').valueCentavos, null);
  const soA = criarCtx(fixture(), { periodo: '2001-06', situacao: 'ativas', obraId: 'a' });
  assert.equal(detalhes.construir('receivables', soA, h, 'c').valueCentavos, null, 'drawer nao contorna filtro de obra');
});

test('arquivamento nao quita recebiveis nem autoriza compensacao entre obras', () => {
  const s = fixture(); s.repasses.find(r => r.id === 'rep-b').valor = 40;
  const ctx = criarCtx(s, { periodo: '2001-06', situacao: 'todas', obraId: '' });
  assert.equal(detalhes.construir('receivables', ctx, h).valueCentavos, 11500);
  assert.equal(detalhes.construir('receivables', ctx, h, 'b').valueCentavos, 4000);
});

test('received usa periodo, inclui terreno e nao cria movimento bancario', () => {
  const s = fixture(); s.repasses.push(row('land', { obra_id: 'a', valor: 10, tipo: 'terreno', data_credito: '2001-06-05' }));
  const ctx = criarCtx(s), d = detalhes.construir('received', ctx, h);
  assert.equal(d.valueCentavos, 12000); assert.equal(somaRows(d), 12000);
  assert.match(d.note, /terreno/); assert.match(d.note, /nem cria novo movimento/);
  const outro = criarCtx(s, { periodo: '2001-07', situacao: 'ativas', obraId: '' });
  assert.equal(detalhes.construir('received', outro, h).valueCentavos, 0);
  assert.equal(detalhes.construir('receivables', outro, h).valueCentavos, detalhes.construir('receivables', ctx, h).valueCentavos);
});

test('cost total distingue construcao e classes materiais/mao preservadas', () => {
  const ctx = criarCtx();
  const d = detalhes.construir('cost', ctx, h);
  assert.equal(d.valueCentavos, 7900); assert.equal(somaRows(d), 7900);
  assert.equal(detalhes.construir('constructionCost', ctx, h).valueCentavos, 6000);
  assert.equal(detalhes.construir('materials', ctx, h).valueCentavos, 4500);
  assert.equal(detalhes.construir('labor', ctx, h).valueCentavos, 1500);
  assert.equal(detalhes.construir('materials', ctx, h).rows.some(r => r.id === 'terra-a' || r.id === 'oper-a'), false);
  assert.match(d.note, /nao comprova pagamento/);
});

test('result soma contribuicoes selecionadas e dre:resultado mantem liquido empresa', () => {
  const s = fixture(); s.obras = [s.obras[0]];
  s.lancamentos = s.lancamentos.filter(l => ['mat-a', 'mao-a'].includes(l.id));
  s.repasses = [s.repasses[0]]; s.adicionais = []; s.pagamentosAdicionais = [];
  s.contasPagar = [s.contasPagar[0]]; s.OBRAS_INTERNAS = []; s.obrasInternas = [];
  const ctx = criarCtx(s);
  assert.equal(detalhes.construir('result', ctx, h).valueCentavos, 2500);
  assert.equal(detalhes.construir('dre:resultado', ctx, h).valueCentavos, 50);
  assert.match(detalhes.construir('result', ctx, h).note, /antes de impostos/);
  assert.match(detalhes.construir('dre:resultado', ctx, h).note, /Consolidado da empresa/);
});

test('campos SOMA_OBRAS restringem valor e origens enquanto consolidado inclui arquivada', () => {
  const ctx = criarCtx();
  for (const key of ['result', 'dre:recConstr', 'dre:custoConstr', 'dre:margem']) {
    const d = detalhes.construir(key, ctx, h);
    assert.equal(d.rows.some(r => r.id === 'rep-b' || r.id === 'mat-b'), false, key);
    assert.equal(d.rows.some(r => r.obraNome === 'ESCRITORIO SINTETICO'), false, key);
  }
  assert.equal(detalhes.construir('dre:recBruta', ctx, h).rows.some(r => r.id === 'rep-b'), true);
  assert.equal(detalhes.construir('dre:custoObras', ctx, h).rows.some(r => r.id === 'mat-b'), true);
  assert.equal(detalhes.construir('dre:recConstr', ctx, h, 'c').valueCentavos, 2800); // DRE inclui pagamentos pendente/cancelado vinculados.
});

test('DRE usa status adicionais vigente e terreno em apartado sem classificar por descricao', () => {
  const s = fixture(); s.adicionais[0].descricao = 'terreno';
  s.repasses.push(row('land', { obra_id: 'a', valor: 10, tipo: 'terreno', data_credito: '2001-06-05' }));
  const ctx = criarCtx(s), bruto = detalhes.construir('dre:recBruta', ctx, h);
  assert.equal(bruto.rows.some(r => r.id === 'pag-1'), true, 'descricao adicional terreno continua receita adicional');
  assert.equal(bruto.rows.some(r => r.id === 'pag-p'), true);
  assert.equal(bruto.rows.some(r => r.id === 'pag-x'), true);
  assert.equal(bruto.rows.some(r => r.id === 'land'), false);
  assert.equal(detalhes.construir('dre:recTerr', ctx, h).rows.some(r => r.id === 'land'), true);
});

test('tributos e operacionais empresariais incluem estrutura e excluem QA', () => {
  const ctx = criarCtx();
  assert.deepEqual(detalhes.construir('dre:impostoReal', ctx, h).rows.map(r => r.id), ['tax-a']);
  assert.deepEqual(detalhes.construir('dre:despOperReal', ctx, h).rows.map(r => r.id), ['oper-a', 'off-oper']);
  assert.equal(detalhes.construir('overhead:total', ctx, h).valueCentavos, 1200);
  assert.equal(detalhes.construir('overhead:noResultado', ctx, h).valueCentavos, 700);
  assert.equal(detalhes.construir('overhead:foraResultado', ctx, h).valueCentavos, 500);
  assert.equal(detalhes.construir('dre:imposto', ctx, h).valueCentavos > detalhes.construir('dre:impostoReal', ctx, h).valueCentavos, true);
  assert.match(detalhes.construir('dre:imposto', ctx, h).note, /Estimativas nao possuem lancamento/);
});

test('admin NF legado evita custo duplicado mesmo com lancamento em outro periodo/obra', () => {
  const s = fixture();
  s.notas = [row('nf-legacy', { obra: 'ESCRITORIO SINTETICO' }), row('nf-oper', { obra: 'ESCRITORIO SINTETICO' })];
  s.contasPagar.push(row('legacy', { obra_id: null, status: 'pago', valor: 9, descricao: 'Item escritorio', nota_id: 'nf-legacy', data_pagamento: '2001-06-05' }),
    row('nf-oper-cp', { obra_id: null, status: 'pago', valor: 8, descricao: 'Taxa NF', nota_id: 'nf-oper', tipo: 'despesa_operacional_nf', data_pagamento: '2001-06-05' }),
    row('nf-normal', { obra_id: null, status: 'pago', valor: 50, descricao: 'NF material', nota_id: 'nf-legacy', data_pagamento: '2001-06-05' }),
    row('refund', { obra_id: null, status: 'pago', valor: 99, tipo: 'reembolso_fornecedor', data_pagamento: '2001-06-05' }));
  s.lancamentos.push(row('equiv', { obra_id: 'b', total: 9, etapa: '04_alven', data: '2001-05-05', descricao: '1234 — Item escritorio', nota_id: 'nf-legacy', obs: null }));
  const d = detalhes.construir('dre:despAdmin', criarCtx(s), h);
  assert.deepEqual(d.rows.map(r => r.id), ['admin', 'nf-oper-cp']);
  assert.equal(d.valueCentavos, 2800); assert.equal(somaRows(d), 2800);
});

test('origens de NF espelham exatamente separadores do engine vigente', () => {
  const s = fixture();
  s.notas = [row('nf-dot', { obra: 'ESCRITORIO SINTETICO' }), row('nf-dash', { obra: 'ESCRITORIO SINTETICO' })];
  for (const [nf, sep] of [['nf-dot', '\u00b7'], ['nf-dash', '\u2014']]) {
    s.contasPagar.push(row('cp-' + nf, { obra_id: null, status: 'pago', valor: 9,
      descricao: '1234', nota_id: nf, data_pagamento: '2001-06-05' }));
    s.lancamentos.push(row('l-' + nf, { obra_id: 'b', total: 9, etapa: '04_alven', data: '2001-05-05',
      descricao: '1234 ' + sep + ' Item', nota_id: nf, obs: null }));
  }
  const d = detalhes.construir('dre:despAdmin', criarCtx(s), h);
  assert.equal(d.valueCentavos, 2900); assert.equal(somaRows(d), d.valueCentavos);
  assert.deepEqual(d.rows.map(r => r.id), ['admin', 'cp-nf-dot']);
});

test('forecast usa custo acumulado e nao apresenta posicao como lucro futuro', () => {
  const s = fixture(); s.lancamentos.push(row('antes', { obra_id: 'a', total: 5, etapa: '04_alven', data: '2001-05-05', descricao: 'Custo anterior', obs: null }));
  const d = detalhes.construir('forecast', criarCtx(s), h);
  assert.equal(d.valueCentavos, 9600); // carteira180 - custo acumulado84.
  assert.equal(d.rows.some(r => r.id === 'antes'), true);
  assert.match(d.note, /Nao estima custos futuros/);
  assert.match(d.note, /dinheiro disponivel/);
});

test('contractM2 e costM2 usam apenas mesma obra, acumulado e area cadastrada', () => {
  const s = fixture();
  s.lancamentos.push(row('custo-antes', { obra_id: 'a', total: 5, etapa: '04_alven', data: '2001-05-05', descricao: 'Custo anterior', obs: null }));
  const ctx = criarCtx(s, { periodo: '2001-07', situacao: 'ativas', obraId: '' });
  const contrato = detalhes.construir('contractM2', ctx, h, 'a');
  assert.equal(contrato.valueCentavos, 200); // contrato100 / 50m², sem adicionais30.
  assert.equal(contrato.rows.length, 1); assert.equal(contrato.rows[0].id, 'a');
  assert.equal(contrato.rows[0].documento, 'a'); assert.equal(contrato.rows[0].valorCentavos, 10000);
  assert.match(contrato.rows[0].descricao, /50 m²/);
  const custo = detalhes.construir('costM2', ctx, h, 'a');
  assert.equal(custo.valueCentavos, 148); // acumulado74 / 50m², apesar do filtro Julho vazio.
  assert.equal(somaRows(custo), 7400);
  assert.equal(custo.rows.some(r => r.id === 'custo-antes'), true);
  assert.equal(custo.rows.every(r => r.obraNome === 'Obra sintetica A'), true);
  assert.match(custo.formula, /acumulado/); assert.match(custo.note, /todos os períodos/);
  assert.equal(detalhes.construir('costM2', ctx, h, 'c').valueCentavos, 40);
  for (const key of ['contractM2', 'costM2']) assert.equal(detalhes.construir(key, ctx, h).valueCentavos, null, 'não mistura obras/m²');
  const soA = criarCtx(s, { periodo: '2001-07', situacao: 'ativas', obraId: 'a' });
  assert.equal(detalhes.construir('costM2', soA, h).valueCentavos, 148);
  assert.equal(detalhes.construir('contractM2', soA, h, 'c').valueCentavos, null);
});

test('indicador por m² respeita validacao, arredondamento e overflow dos cartoes', () => {
  for (const area of [0, -1, NaN, Infinity, null, undefined, true, [], {}, '', ' ', 'abc']) {
    const base = criarCtx();
    const snapshot = { ...base.snapshot, obras: base.snapshot.obras.map(o => o.id === 'a' ? { ...o, area_m2: area } : o) };
    const visao = modelo.construir(snapshot, base.filtro);
    const ctx = contexto.construir({ ...base.envelope, snapshot, visao });
    for (const key of ['contractM2', 'costM2']) assert.equal(detalhes.construir(key, ctx, h, 'a').valueCentavos, null, key + ':' + String(area));
  }
  const s = fixture(); s.obras[0].area_m2 = '42';
  const ctx = criarCtx(s);
  assert.equal(detalhes.construir('contractM2', ctx, h, 'a').valueCentavos, Math.round(10000 / 42));
  assert.equal(detalhes.construir('costM2', ctx, h, 'a').valueCentavos, Math.round(6900 / 42));
  s.obras[0].area_m2 = 1e-310;
  assert.equal(detalhes.construir('costM2', criarCtx(s), h, 'a').valueCentavos, null);
  const zero = fixture(); zero.obras[0].valor_venda = 0; zero.lancamentos = zero.lancamentos.filter(l => l.obra_id !== 'a');
  const zeroCtx = criarCtx(zero);
  for (const key of ['contractM2', 'costM2']) assert.equal(detalhes.construir(key, zeroCtx, h, 'a').valueCentavos, 0, 'zero confirmado com área válida');
});

test('custo por m² indisponivel nao impede contrato confirmado ou fabrica origens', () => {
  const base = criarCtx();
  const snapshot = { ...base.snapshot, lancamentos: null, dre: { status: 'indisponivel' },
    fontes: { ...base.snapshot.fontes, lancamentos: { status: 'indisponivel' }, dre: { status: 'indisponivel' } } };
  const visao = modelo.construir(snapshot, base.filtro);
  const ctx = contexto.construir({ ...base.envelope, snapshot, visao });
  const custo = detalhes.construir('costM2', ctx, h, 'a');
  assert.equal(custo.valueCentavos, null); assert.equal(custo.rows.length, 0);
  assert.match(custo.note, /Valor não confirmado/);
  assert.equal(detalhes.construir('contractM2', ctx, h, 'a').valueCentavos, 200);
});

test('obrigacao parcial mostra restante persistido e continua separada do cash', () => {
  const ctx = criarCtx(), d = detalhes.construir('payable', ctx, h);
  assert.equal(d.valueCentavos, 25000); assert.equal(d.rows[0].valorCentavos, 25000);
  assert.equal(detalhes.construir('cash', ctx, h).valueCentavos, 100000);
  assert.equal(ctx.snapshot.contasPagar.find(c => c.id === 'partial').valor, 400);
});

test('cash e abertura permanecem empresariais ao detalhar outra obra', () => {
  const ctx = criarCtx();
  const d = detalhes.construir('cash', ctx, h, 'c');
  assert.equal(d.valueCentavos, 100000);
  assert.equal(d.rows.length, 2); assert.match(d.extra, /data-fv-action="caixa"/);
  assert.equal(detalhes.construir('opening', ctx, h).valueCentavos, 100000);
  assert.match(detalhes.construir('opening', ctx, h).note, /nao receita/);
});

test('sem abertura permanece indisponivel sem recuperar saldo manual historico', () => {
  const s = fixture(); s.saldo_manual = 987654;
  s.ledger.estado = { company_id: COMPANY, contas: [], movimentos: [], pagamentos: [], total_centavos: 0 };
  const d = detalhes.construir('cash', criarCtx(s), h);
  assert.equal(d.valueCentavos, null); assert.match(d.title, /abertura nao declarada/);
  assert.equal(d.rows.length, 0); assert.match(d.note, /saldo manual antigo nao e usado/);
  assert.equal(detalhes.construir('opening', criarCtx(s), h).valueCentavos, null);
});

test('movimentos efetivos usam data efetiva, transferencias zero e cancelados fora', () => {
  const s = fixture();
  const mov = (id, tipo, valor_centavos, extra = {}) => ({ id, tipo, valor_centavos, conta_id: 'bank',
    data_efetiva: '2001-06-05', criado_em: '2001-07-05T12:00:00Z', descricao: 'Movimento sintetico ' + id,
    afeta_saldo: true, decisao_corte: 'apos_corte', cancelado_em: null, ...extra });
  s.ledger.estado.movimentos = [mov('in', 'entrada', 1000), mov('out', 'saida', 200), mov('pay', 'pagamento', 300, { conta_pagar_id: 'partial' }),
    mov('trans', 'transferencia', 100, { destino_id: 'cash' }), mov('old', 'pagamento', 500, { afeta_saldo: false, decisao_corte: 'incluido_abertura' }),
    mov('cancel', 'saida', 700, { afeta_saldo: false, cancelado_em: '2001-06-06T12:00:00Z' })];
  const ctx = criarCtx(s), d = detalhes.construir('movement', ctx, h);
  assert.equal(d.valueCentavos, 500); assert.equal(somaRows(d), 500);
  assert.equal(d.rows.find(r => r.id === 'trans').valorCentavos, 0);
  assert.equal(d.rows.find(r => r.id === 'old').valorCentavos, 0);
  assert.equal(d.rows.find(r => r.id === 'cancel').valorCentavos, 0);
  assert.match(d.rows.find(r => r.id === 'cancel').descricao, /auditoria/);
  assert.equal(detalhes.construir('paid', ctx, h).valueCentavos, 500);
  assert.equal(somaRows(detalhes.construir('paid', ctx, h)), 500);
  assert.equal(detalhes.construir('paid', ctx, h).rows.some(r => ['old', 'cancel'].includes(r.id)), false);
  assert.equal(d.rows.find(r => r.id === 'in').data, '2001-06-05');
});

test('folha e estoque nao fabricam pagamento, consumo ou total monetario', () => {
  const ctx = criarCtx();
  const f = detalhes.construir('folha', ctx, h), e = detalhes.construir('estoque', ctx, h);
  assert.equal(f.valueCentavos, null); assert.match(f.note, /nao comprovam pagamento/);
  assert.equal(e.valueCentavos, null); assert.match(e.extra, /data-fv-action="estoque"/);
  assert.match(e.note, /Nenhum saldo fisico/);
});

test('extra escapa nomes e descricoes e rows conservam dados para renderer escapar', () => {
  const s = fixture(); s.obras[0].nome = '<img src=x onerror=alert(1)>';
  s.adicionais[0].descricao = '<script>fixture()</script>';
  const d = detalhes.construir('receivables', criarCtx(s), h);
  assert.equal(d.extra.includes('<img'), false); assert.equal(d.extra.includes('<script>'), false);
  assert.match(d.extra, /&lt;img/); assert.match(d.extra, /&lt;script&gt;/);
  assert.equal(d.rows.find(r => r.id === 'rep-a').obraNome, s.obras[0].nome);
});

test('falhas e contexto inconsistente nunca viram zero confirmado', () => {
  const ctx = criarCtx();
  assert.equal(detalhes.construir('cash', null, h).valueCentavos, null);
  assert.equal(detalhes.construir('unknown', ctx, h).valueCentavos, null);
  assert.equal(detalhes.construir('dre:campoInexistente', ctx, h).valueCentavos, null);
  assert.equal(detalhes.construir('overhead:campoInexistente', ctx, h).valueCentavos, null);
  const bad = { ...ctx, snapshot: { ...ctx.snapshot, company_id: 'empresa-B' } };
  assert.equal(detalhes.construir('receivables', bad, h).valueCentavos, null);
  assert.equal(detalhes.construir('cost', { ...ctx, snapshot: { ...ctx.snapshot, perfil: 'mestre' } }, h).valueCentavos, null);
});

test('dados sem DRE deixam custos classificados e resultado indisponiveis', () => {
  const s = fixture(); const base = criarCtx(s);
  const snap = { ...base.snapshot, dre: { status: 'indisponivel' } };
  const v = modelo.construir(snap, base.filtro);
  const ctx = contexto.construir({ ...base.envelope, snapshot: snap, visao: v });
  assert.equal(detalhes.construir('constructionCost', ctx, h).valueCentavos, null);
  assert.equal(detalhes.construir('result', ctx, h).valueCentavos, null);
  assert.equal(detalhes.construir('dre:resultado', ctx, h).valueCentavos, null);
  assert.equal(detalhes.construir('cost', ctx, h).valueCentavos, 7900);
});

test('selecao vazia nao confirma zero quando a fonte DRE falhou', () => {
  const s = fixture(); s.obras = []; s.lancamentos = []; s.repasses = []; s.adicionais = []; s.pagamentosAdicionais = [];
  const base = criarCtx(s);
  const snap = { ...base.snapshot, lancamentos: null, dre: { status: 'indisponivel' },
    fontes: { ...base.snapshot.fontes, lancamentos: { status: 'indisponivel' }, dre: { status: 'indisponivel' } } };
  const v = modelo.construir(snap, base.filtro);
  const ctx = contexto.construir({ ...base.envelope, snapshot: snap, visao: v });
  for (const key of ['result', 'dre:recConstr', 'dre:custoConstr', 'dre:margem']) assert.equal(detalhes.construir(key, ctx, h).valueCentavos, null, key);
  assert.equal(detalhes.construir('result', base, h).valueCentavos, 0, 'engine confirmado com conjunto vazio');
});

test('fontes DRE e ledger ausentes ou parciais nao confirmam valores a partir de envelope isolado', () => {
  const base = criarCtx();
  for (const status of [null, 'indisponivel', 'parcial']) {
    const fontes = { ...base.snapshot.fontes, dre: status && { status }, ledger: status && { status } };
    const snapshot = { ...base.snapshot, fontes };
    const visao = modelo.construir(snapshot, base.filtro);
    const ctx = contexto.construir({ ...base.envelope, snapshot, visao });
    for (const key of ['result', 'dre:recBruta', 'overhead:total', 'cash', 'opening', 'paid', 'movement']) {
      assert.equal(detalhes.construir(key, ctx, h).valueCentavos, null, key + ':' + status);
    }
  }
  const snapshot = { ...base.snapshot, ledger: { ...base.snapshot.ledger,
    estado: { ...base.snapshot.ledger.estado, company_id: 'outra-empresa-sintetica' } } };
  const visao = modelo.construir(snapshot, base.filtro);
  const ctx = contexto.construir({ ...base.envelope, snapshot, visao });
  for (const key of ['cash', 'opening', 'movement', 'paid']) {
    const d = detalhes.construir(key, ctx, h);
    assert.equal(d.valueCentavos, null, key); assert.equal(d.rows.length, 0, key + ':sem origens de outra empresa');
  }
});

test('construir detalhes nao altera contexto/fontes/filtros e todos drawers ficam readonly', () => {
  const ctx = criarCtx(), antes = JSON.stringify(ctx);
  for (const key of ['receivables', 'receivableExcess', 'receivableContract', 'receivableExtras', 'received', 'cost', 'constructionCost',
    'materials', 'labor', 'result', 'resultReceipts', 'laborM2', 'work', 'forecast', 'contractM2', 'costM2', 'payable', 'cash', 'opening', 'paid', 'movement', 'folha', 'estoque',
    'dre:recBruta', 'dre:recConstr', 'dre:resultado', 'overhead:total']) {
    const d = detalhes.construir(key, ctx, h);
    assert.equal(Object.isFrozen(d), true, key); assert.equal(Array.isArray(d.rows), true, key);
    assert.equal(typeof d.title, 'string', key); assert.equal(typeof d.extra, 'string', key);
  }
  assert.equal(JSON.stringify(ctx), antes);
});

test('UMD publica API sem DOM/rede ou escrita ao importar', () => {
  const bloquear = () => { throw new Error('Efeito proibido.'); };
  const c = { FinanceiroVisaoModelo: modelo, FinanceiroVisaoFolha: folha, FinanceiroVisaoContexto: contexto,
    fetch: bloquear, sbGet: bloquear, sbPost: bloquear, sbPatch: bloquear, sbDelete: bloquear, initDiarias: bloquear,
    document: { getElementById: bloquear } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-detalhes.js'), 'utf8'), c);
  assert.equal(typeof c.FinanceiroVisaoDetalhes.construir, 'function');
  const d = c.FinanceiroVisaoDetalhes.construir('cash', criarCtx(), h);
  assert.equal(d.valueCentavos, 100000);
});
