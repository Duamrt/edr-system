'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { avaliar } = require('../js/edr-v2-visao-financeira-folha.js');
const Q = '11111111-1111-4111-8111-111111111111';
const Q2 = '22222222-2222-4222-8222-222222222222';
function snapshot() {
  return {
    companyId: 'tenant-a', company_id: 'tenant-a',
    obras: [
      { id: 'a', company_id: 'tenant-a', nome: 'Casa A', arquivada: false },
      { id: 'b', company_id: 'tenant-a', nome: 'Casa B', arquivada: true }
    ],
    quinzenas: [{ id: Q, company_id: 'tenant-a', label: 'QA sintetica', data_inicio: '2026-10-01', data_fim: '2026-10-15', fechada: true, excluida: false }],
    diarias: [{ id: 'd1', company_id: 'tenant-a', quinzena_id: Q, data: '2026-10-02', status: 'apontado',
      periodos: [{ obra_id: 'a', obra: 'Nome antigo ignorado pelo ID', turno: 'dia', fracao: 1 }], valor: '100.00' }],
    extras: [],
    lancamentos: [{ id: 'fp1', company_id: 'tenant-a', obra_id: 'a', etapa: '28_mao', obs: 'Folha quinzenal · ' + Q, data: '2026-10-15', total: 100 }],
    fontes: Object.fromEntries(['obras', 'quinzenas', 'diarias', 'extras', 'lancamentos'].map(n => [n, { status: 'confirmada' }]))
  };
}
function codigo(r, c) { return r.motivos.some(m => m.codigo === c); }
function grupo(r) { return r.obras[0].quinzenas[0]; }
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

test('fonte e vinculos confirmados nao declaram pagamento ou cobertura dos dias', () => {
  const r = avaliar(snapshot(), { periodo: '2026-10' });
  assert.equal(r.cobertura, 'confirmada');
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.equal(r.coberturaDias, 'nao_verificada');
  assert.equal(r.comprovaPagamento, false);
  assert.equal(r.escopoCobertura, 'fontes_e_vinculos');
  assert.equal(grupo(r).custoFP.estado, 'identificado');
  assert.equal(grupo(r).custoFP.quantidade, 1);
  assert.equal(codigo(r, 'pagamento_nao_verificado'), true);
  assert.equal(codigo(r, 'cobertura_dias_nao_verificada'), true);
  for (const c of ['total', 'saldo', 'valor', 'totalFolha', 'custoCentavos']) assert.equal(Object.hasOwn(r, c), false);
});

test('aberta e pendencia de fechamento sem supor pagamento', () => {
  const s = snapshot(); s.quinzenas[0].fechada = false;
  const r = avaliar(s, {});
  assert.equal(r.estado, 'pendencia_identificada');
  assert.equal(codigo(r, 'periodo_aberto'), true);
  assert.equal(r.comprovaPagamento, false);
});

test('quinzena fechada com valor positivo e FP ausente identifica pendencia de registro', () => {
  const s = snapshot(); s.lancamentos = [];
  const r = avaliar(s, {});
  assert.equal(r.estado, 'pendencia_identificada');
  assert.equal(grupo(r).custoFP.estado, 'nao_identificado');
  assert.equal(codigo(r, 'custo_fp_nao_identificado'), true);
});

test('mes intersecta quinzena mas competencia nao e rateada nem antecipada', () => {
  const s = snapshot();
  s.quinzenas[0].data_inicio = '2026-09-25';
  s.quinzenas[0].data_fim = '2026-10-09';
  s.diarias[0].data = '2026-10-02';
  s.lancamentos[0].data = '2026-10-09';
  const set = avaliar(s, { periodo: '2026-09' });
  assert.equal(grupo(set).competenciaCusto, '2026-10-09');
  assert.equal(grupo(set).competenciaNoPeriodo, false);
  assert.equal(grupo(set).custoFP.estado, 'identificado');
  assert.equal(avaliar(s, { periodo: '2026-08' }).obras[0].quinzenas.length, 0);
  assert.equal(grupo(avaliar(s, { periodo: '2026-10' })).competenciaNoPeriodo, true);
});

test('filtros obra e situacao preservam arquivadas e nao misturam seus registros', () => {
  const s = snapshot();
  s.diarias.push({ ...s.diarias[0], id: 'd2', periodos: [{ obra_id: 'b', turno: 'dia', fracao: 1 }] });
  const ativas = avaliar(s, { situacao: 'ativas' });
  assert.deepEqual(ativas.obras.map(o => o.obraId), ['a']);
  assert.equal(ativas.estado, 'sem_pendencia_identificada');
  const arquivadas = avaliar(s, { situacao: 'arquivadas', obraId: 'b' });
  assert.deepEqual(arquivadas.obras.map(o => o.obraId), ['b']);
  assert.equal(arquivadas.estado, 'pendencia_identificada');
  assert.equal(avaliar(s, { obraId: 'b', situacao: 'ativas' }).obras.length, 0);
});

test('nome legado exato unico e JSON de periodos preservam vinculo sem fuzzy', () => {
  const s = snapshot();
  s.diarias[0].periodos = JSON.stringify([{ obra: ' Casa A ', turno: 'manha', fracao: 0.5 }]);
  s.diarias[0].funcionario_id = null;
  const r = avaliar(s, {});
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.equal(grupo(r).custoFP.estado, 'identificado');
  s.diarias[0].periodos = [{ obra: 'Casa', turno: 'dia', fracao: 1 }];
  assert.equal(avaliar(s, {}).estado, 'nao_avaliado');
});

test('nome duplicado incluindo arquivada torna legado ambiguo', () => {
  const s = snapshot(); s.obras[1].nome = 'Casa A';
  s.diarias[0].periodos = [{ obra: 'Casa A', turno: 'dia', fracao: 1 }];
  const r = avaliar(s, { situacao: 'ativas' });
  assert.equal(r.cobertura, 'parcial');
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(codigo(r, 'obra_legada_ambigua'), true);
});

test('ID tem prioridade e ID desconhecido nao faz fallback para nome valido', () => {
  const s = snapshot(); s.diarias[0].periodos[0].obra_id = 'inexistente';
  s.diarias[0].periodos[0].obra = 'Casa A';
  const r = avaliar(s, {});
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(codigo(r, 'obra_desconhecida'), true);
  assert.equal(r.obras[0].quinzenas.length, 0);
});

test('extras usam somente contexto da quinzena e nome inequivoco, sem data propria', () => {
  const s = snapshot(); s.diarias = [];
  s.extras = [{ id: 'e1', company_id: 'tenant-a', quinzena_id: Q, obra: 'Casa A', valor: 100 }];
  const r = avaliar(s, { periodo: '2026-10' });
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.deepEqual(grupo(r).fontesVinculadas, ['extras']);
  assert.equal(codigo(r, 'extras_sem_data_propria'), true);
  assert.equal(s.extras[0].data, undefined);
  assert.equal(grupo(r).competenciaCusto, '2026-10-15');
});

test('meio turno persistido nao comprova falta nem cobertura dos demais dias', () => {
  const s = snapshot();
  s.diarias[0].periodos = [{ obra_id: 'a', turno: 'manha', fracao: 0.5 }];
  s.diarias[0].faltas_turno = [];
  const r = avaliar(s, {});
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.equal(r.coberturaDias, 'nao_verificada');
});

test('falta e nao escalado explicitos sem periodos nao fabricam custo faltante', () => {
  const s = snapshot(); s.lancamentos = [];
  s.diarias = ['falta', 'nao_escalado'].map((status, i) => ({ ...s.diarias[0], id: 'd' + i, status, periodos: [], valor: 0 }));
  const r = avaliar(s, {});
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.equal(r.obras[0].quinzenas.length, 0);
  assert.equal(codigo(r, 'custo_fp_nao_identificado'), false);
});

test('status ausente ou periodos malformados mantem leitura nao avaliada', () => {
  const s = snapshot(); delete s.diarias[0].status;
  assert.equal(avaliar(s, {}).estado, 'nao_avaliado');
  s.diarias[0].status = 'apontado'; s.diarias[0].periodos = '{nao-json';
  const r = avaliar(s, {});
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(codigo(r, 'periodos_invalidos'), true);
});

test('consulta falha nunca afirma ausencia FP e preserva outras fontes confirmadas', () => {
  const s = snapshot(); s.fontes.lancamentos.status = 'indisponivel'; s.lancamentos = null;
  const r = avaliar(s, {});
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(r.cobertura, 'parcial');
  assert.equal(r.fontes.obras.status, 'confirmada');
  assert.equal(grupo(r).custoFP.estado, 'nao_avaliado');
  assert.equal(grupo(r).custoFP.quantidade, null);
  assert.equal(codigo(r, 'custo_fp_nao_identificado'), false);
});

test('fonte parcial e arrays ausentes nao se convertem em zeros ou fonte completa', () => {
  const s = snapshot(); s.fontes.diarias.status = 'parcial'; s.diarias = [];
  assert.equal(avaliar(s, {}).estado, 'nao_avaliado');
  const vazio = avaliar({}, {});
  assert.equal(vazio.cobertura, 'indisponivel');
  assert.equal(vazio.estado, 'nao_avaliado');
  assert.deepEqual(vazio.obras, []);
});

test('identidade ausente, aliases divergentes e registro de outro tenant sao recusados', () => {
  const s = snapshot(); delete s.companyId; delete s.company_id;
  assert.equal(avaliar(s, {}).cobertura, 'indisponivel');
  const a = snapshot(); a.companyId = 'tenant-b';
  assert.equal(avaliar(a, {}).estado, 'nao_avaliado');
  const b = snapshot(); b.diarias[0].company_id = 'tenant-b';
  const r = avaliar(b, {});
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(r.fontes.diarias.status, 'indisponivel');
  assert.equal(codigo(r, 'identidade_registro_divergente'), true);
});

test('exclusao vinculada exige cautela; timestamp isolado nao exclui quinzena restaurada', () => {
  const s = snapshot(); s.quinzenas[0].excluida = true;
  const r = avaliar(s, {});
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(grupo(r).custoFP.estado, 'nao_avaliado');
  assert.equal(codigo(r, 'quinzena_excluida'), true);
  s.quinzenas[0].excluida = false; s.quinzenas[0].excluida_em = '2026-10-01T10:00:00Z';
  assert.equal(avaliar(s, {}).estado, 'sem_pendencia_identificada');
});

test('quinzena excluida relevante sem registros tambem nao recebe conclusao positiva', () => {
  const s = snapshot(); s.diarias = []; s.quinzenas[0].excluida = true;
  assert.equal(avaliar(s, {}).estado, 'nao_avaliado');
});

test('quinzena desconhecida, datas invalidas e registro fora do intervalo sao explicitos', () => {
  const s = snapshot(); s.diarias[0].quinzena_id = Q2;
  assert.equal(codigo(avaliar(s, {}), 'quinzena_desconhecida'), true);
  const a = snapshot(); a.quinzenas[0].data_inicio = '2026-02-30';
  assert.equal(codigo(avaliar(a, {}), 'datas_quinzena_invalidas'), true);
  const b = snapshot(); b.diarias[0].data = '2026-11-01';
  assert.equal(codigo(avaliar(b, {}), 'data_diaria_invalida'), true);
});

test('FP exige obra, etapa e UUID isolado; label e UUID de outra quinzena nao bastam', () => {
  const s = snapshot(); s.lancamentos[0].obs = 'Folha quinzenal · QA sintetica';
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_identificado');
  s.lancamentos[0].obs = 'Folha quinzenal · ' + Q2;
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_identificado');
  s.lancamentos[0].obs = 'x' + Q;
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_identificado');
  s.lancamentos[0].obs = 'Referencia manual ' + Q;
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_avaliado');
  s.lancamentos[0].obs = 'Folha quinzenal · ' + Q + ' (observacao)';
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_avaliado');
  s.lancamentos[0].obs = '  Folha quinzenal · ' + Q + '  ';
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'identificado');
  s.lancamentos[0].etapa = '29_imposto';
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_identificado');
  s.lancamentos[0].etapa = '28_mao'; s.lancamentos[0].obra_id = 'b';
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_identificado');
});

test('sem obs consultada, UUID invalido ou referencia de duas quinzenas nao ha ausencia comprovada', () => {
  const s = snapshot(); delete s.lancamentos[0].obs;
  assert.equal(grupo(avaliar(s, {})).custoFP.estado, 'nao_avaliado');
  const a = snapshot(); a.lancamentos[0].obs += ' / ' + Q2;
  assert.equal(codigo(avaliar(a, {}), 'referencia_fp_ambigua'), true);
  const b = snapshot(); b.quinzenas[0].id = 'label-antigo'; b.diarias[0].quinzena_id = 'label-antigo';
  assert.equal(codigo(avaliar(b, {}), 'identificador_quinzena_invalido'), true);
});

test('duplicidade FP e competencia divergente sao avisos sem somar custos', () => {
  const s = snapshot(); s.lancamentos.push({ ...s.lancamentos[0], id: 'fp2' });
  const r = avaliar(s, {});
  assert.equal(r.estado, 'pendencia_identificada');
  assert.equal(grupo(r).custoFP.estado, 'duplicado');
  assert.equal(grupo(r).custoFP.quantidade, 2);
  assert.equal(codigo(r, 'custo_fp_duplicado'), true);
  const a = snapshot(); a.lancamentos[0].data = '2026-10-14';
  assert.equal(codigo(avaliar(a, {}), 'competencia_fp_divergente'), true);
  a.lancamentos[0].data = null;
  assert.equal(avaliar(a, {}).estado, 'nao_avaliado');
});

test('zero historico sem FP nao fabrica custo faltante, valor ausente impede avaliacao', () => {
  const s = snapshot(); s.lancamentos = []; s.diarias[0].valor = 0;
  const r = avaliar(s, {});
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.equal(codigo(r, 'fp_ausente_sem_conclusao_valor'), true);
  delete s.diarias[0].valor;
  assert.equal(avaliar(s, {}).estado, 'nao_avaliado');
});

test('nenhum registro nao implica dias cobertos ou folha completa', () => {
  const s = snapshot(); s.diarias = []; s.quinzenas = []; s.lancamentos = [];
  const r = avaliar(s, {});
  assert.equal(r.estado, 'sem_pendencia_identificada');
  assert.equal(r.coberturaDias, 'nao_verificada');
  assert.equal(r.comprovaPagamento, false);
});

test('obra desconhecida, IDs duplicados e filtro invalido nao recebem conclusao silenciosa', () => {
  assert.equal(avaliar(snapshot(), { obraId: 'nao-existe' }).estado, 'nao_avaliado');
  const s = snapshot(); s.obras.push({ ...s.obras[0] });
  assert.equal(codigo(avaliar(s, {}), 'identificador_duplicado'), true);
  assert.throws(() => avaliar(snapshot(), { periodo: '2026-13' }), RangeError);
  assert.throws(() => avaliar(snapshot(), { situacao: 'pagas' }), RangeError);
});

test('obras internas e QA seguem escopo financeiro, sem alterar o snapshot', () => {
  const s = snapshot();
  s.obras.push({ id: 'i', company_id: 'tenant-a', nome: 'Escritorio EDR' }, { id: 'qa', company_id: 'tenant-a', nome: 'OBRA QA Temporaria' });
  assert.deepEqual(avaliar(s, { situacao: 'todas' }).obras.map(o => o.obraId), ['a', 'b']);
  s.obrasInternas = ['a'];
  assert.deepEqual(avaliar(s, { situacao: 'todas' }).obras.map(o => o.obraId), ['b']);
});

test('entradas congeladas, chamadas repetidas e resultado mutado nao alteram dados', () => {
  const s = freeze(snapshot());
  const antes = JSON.stringify(s);
  const r = avaliar(s, { periodo: '2026-10' });
  const esperado = JSON.stringify(r);
  r.obras[0].nome = 'Mutado'; r.obras[0].quinzenas[0].custoFP.datasRegistradas.push('2000-01-01');
  assert.equal(JSON.stringify(s), antes);
  assert.equal(JSON.stringify(avaliar(s, { periodo: '2026-10' })), esperado);
});

test('namespace global em navegador funciona sem require, DOM ou rede', () => {
  const contexto = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/edr-v2-visao-financeira-folha.js'), 'utf8'), contexto);
  assert.equal(typeof contexto.FinanceiroVisaoFolha.avaliar, 'function');
  assert.equal(Object.isFrozen(contexto.FinanceiroVisaoFolha), true);
  assert.equal(contexto.FinanceiroVisaoFolha.avaliar(snapshot(), {}).estado, 'sem_pendencia_identificada');
});

test('exclusao vinculada apenas a outra obra nao contamina a selecao atual', () => {
  const s = snapshot();
  s.quinzenas.push({ ...s.quinzenas[0], id: Q2, excluida: true });
  s.diarias.push({ ...s.diarias[0], id: 'd2', quinzena_id: Q2, periodos: [{ obra_id: 'b', turno: 'dia', fracao: 1 }] });
  assert.equal(avaliar(s, { obraId: 'a', situacao: 'ativas' }).estado, 'sem_pendencia_identificada');
  assert.equal(avaliar(s, { obraId: 'b', situacao: 'arquivadas' }).estado, 'nao_avaliado');
});

test('fracao booleana nao e apontamento numerico confirmado', () => {
  const s = snapshot(); s.diarias[0].periodos[0].fracao = true;
  assert.equal(codigo(avaliar(s, {}), 'periodo_diaria_invalido'), true);
});

test('UUID em nota avulsa nao comprova custo FP nem ausencia segura de custo', () => {
  const s = snapshot(); s.lancamentos[0].obs = 'nota avulsa ' + Q;
  const r = avaliar(s, {});
  assert.equal(r.estado, 'nao_avaliado');
  assert.equal(grupo(r).custoFP.estado, 'nao_avaliado');
  assert.equal(codigo(r, 'marcador_fp_nao_confirmado'), true);
  assert.equal(codigo(r, 'custo_fp_nao_identificado'), false);
});
