// Integração independente de leitura: somente fixtures fictícias em VM, sem rede ou DOM.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const clone = v => JSON.parse(JSON.stringify(v));
const fonte = nome => fs.readFileSync(path.join(raiz, 'js', nome), 'utf8');
const empresa = 'empresa-ficticia-integracao';
const dinheiro = v => v * 100;
function fixture() {
  const comTenant = row => ({ company_id: empresa, ...row });
  const obra = (id, valor, extra = {}) => comTenant({ id, nome: 'OBRA FICTICIA ' + id, valor_venda: valor, area_m2: 100, ...extra });
  const rep = (id, obra_id, valor, data_credito, tipo = 'pls') => comTenant({ id, obra_id, valor, data_credito, tipo });
  const add = (id, obra_id, valor, status = 'aprovado') => comTenant({ id, obra_id, valor, status });
  const pg = (id, adicional_id, valor, data) => comTenant({ id, adicional_id, valor, data });
  const custo = (id, obra_id, total, data, etapa = '04_alven') => comTenant({ id, obra_id, total, data, etapa });
  const conta = (id, valor, extra = {}) => comTenant({ id, valor, status: 'pago', data_pagamento: '2026-10-03', ...extra });
  return {
    companyId: empresa,
    obras: [obra('a', 1000), obra('b', 300, { arquivada: true }), obra('c', 500),
      obra('escritorio', 0, { nome: 'ESCRITORIO FICTICIO' }), obra('qa', 999, { nome: 'OBRA QA FICTICIA' })],
    lancamentos: [custo('la-set', 'a', 100, '2026-09-02'), custo('la-out', 'a', 150, '2026-10-02'),
      custo('mao', 'a', 80, '2026-10-02', '28_mao'), custo('terr', 'a', 300, '2026-10-02', '35_terreno'),
      custo('tax', 'a', 20, '2026-10-02', '24_imposto'), custo('alim', 'a', 10, '2026-10-02', '03_alimentacao'),
      custo('lb', 'b', 120, '2026-09-02'), custo('lc', 'c', 40, '2026-10-02'),
      custo('lo-tech', 'escritorio', 15, '2026-10-02', '34_tecnologia'), custo('lo-mat', 'escritorio', 60, '2026-10-02'),
      custo('lqa', 'qa', 999, '2026-10-02'), custo('lqa-tax', 'qa', 999, '2026-10-02', '24_imposto')],
    repasses: [rep('ra-set', 'a', 400, '2026-09-02'), rep('ra-out', 'a', 300, '2026-10-02', 'entrada'),
      rep('ra-terr', 'a', 200, '2026-10-02', 'terreno'), rep('rb', 'b', 350, '2026-09-02'),
      rep('rqa', 'qa', 999, '2026-10-02')],
    adicionais: [add('a1', 'a', 200), add('a2', 'a', 100), add('ap', 'a', 400, 'pendente'),
      add('b1', 'b', 40), add('cc', 'c', 100, 'cancelado')],
    pagamentosAdicionais: [pg('p1', 'a1', 100, '2026-09-03'), pg('p2', 'a1', 150, '2026-10-03'),
      pg('p3', 'a2', 20, '2026-10-03'), pg('p4', 'a2', 20, '2026-11-03'),
      pg('pp', 'ap', 25, '2026-10-03'), pg('pb', 'b1', 40, '2026-09-03'), pg('pc', 'cc', 30, '2026-10-03')],
    contasPagar: [conta('avulsa', 40), conta('set', 12, { data_pagamento: '2026-09-03' }),
      conta('nf', 50, { nota_id: 'nf-material', nota_ref: 'nf-material' }),
      conta('nf-oper', 25, { nota_id: 'nf-oper', tipo: 'despesa_operacional_nf' }),
      conta('reemb', 50, { tipo: 'reembolso_fornecedor' }), conta('aberta', 400, { status: 'pendente' }),
      conta('de-obra', 100, { obra_id: 'a' }), conta('fallback-data', 10, { data_pagamento: null, data_vencimento: '2026-10-05' })],
    notas: [comTenant({ id: 'nf-material', obra: 'OBRA FICTICIA a' }), comTenant({ id: 'nf-oper', obra: 'ESCRITORIO FICTICIO' })],
    OBRAS_INTERNAS: ['escritorio'], obrasInternas: ['escritorio'],
    quinzenas: [], diarias: [], extras: [],
    ledger: { status: 'confirmado', estado: { company_id: empresa, total_centavos: 18500,
      movimentos: [], pagamentos: [],
      contas: [{ id: 'banco-ficticio', codigo: 'banco', nome: 'BANCO FICTICIO', abertura_centavos: 13500,
        saldo_centavos: 13500, corte_em: '2026-09-01T21:00:00Z', fuso: 'America/Sao_Paulo' },
        { id: 'dinheiro-ficticio', codigo: 'dinheiro', nome: 'DINHEIRO FICTICIO', abertura_centavos: 5000,
          saldo_centavos: 5000, corte_em: '2026-09-01T21:00:00Z', fuso: 'America/Sao_Paulo' }] } }
  };
}
function ambiente() {
  const proibidas = [];
  const proibir = nome => () => { proibidas.push(nome); throw new Error('ACESSO PROIBIDO: ' + nome); };
  const ctx = { console: { log() {}, warn() {}, error() {} },
    fetch: proibir('fetch'), sbGet: proibir('sbGet'), sbGetAll: proibir('sbGetAll'),
    sbPost: proibir('sbPost'), sbPatch: proibir('sbPatch'), sbDelete: proibir('sbDelete'), sbRpc: proibir('sbRpc'),
    document: { getElementById: proibir('DOM') },
    obras: [{ id: 'global-proibida', nome: 'GLOBAL PROIBIDA', valor_venda: 999999 }],
    obrasArquivadas: [], lancamentos: [], repassesCef: [], obrasAdicionais: [], adicionaisPgtos: [], notas: [], OBRAS_INTERNAS: [] };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fonte('edr-v2-dre.js'), ctx);
  vm.runInContext(fonte('edr-v2-visao-financeira-modelo.js'), ctx);
  vm.runInContext(fonte('edr-v2-visao-financeira-dados.js'), ctx);
  vm.runInContext(fonte('edr-v2-visao-financeira-estado.js'), ctx);
  return { ctx, proibidas, modelo: ctx.FinanceiroVisaoModelo, dre: ctx.DREModule,
    dados: ctx.FinanceiroVisaoDados, estado: ctx.FinanceiroVisaoEstado };
}
function preparar(a, dados = fixture()) {
  const contexto = a.dre.criarContextoLeitura(dados);
  return { ...dados, dre: { status: 'confirmada', ...contexto } };
}
function criarLoader(a, dados = fixture(), overrides = {}, limiteServidor = 1000) {
  let identidade = { company_id: empresa, ator_id: 'ator-ficticio', perfil: 'admin' };
  const chamadas = [];
  const tabelas = { obras: dados.obras, lancamentos: dados.lancamentos, repasses_cef: dados.repasses,
    obra_adicionais: dados.adicionais, adicional_pagamentos: dados.pagamentosAdicionais,
    contas_pagar: dados.contasPagar, notas_fiscais: dados.notas, diarias_quinzenas: dados.quinzenas,
    diarias: dados.diarias, diarias_extras: dados.extras };
  const obterPagina = async (tabela, query) => {
    chamadas.push({ tabela, query });
    const params = new URLSearchParams(query.slice(1));
    assert.equal(params.get('limit'), '1000');
    assert.match(params.get('order'), /(^|,)id$/);
    const selecionados = params.get('select').split(',');
    assert.ok(selecionados.includes('id')); assert.ok(selecionados.includes('company_id'));
    const offset = Number(params.get('offset'));
    return clone(tabelas[tabela].slice(offset, offset + limiteServidor).map(row =>
      Object.fromEntries(Object.entries(row).filter(([campo]) => selecionados.includes(campo)))));
  };
  const deps = { obterIdentidade: () => identidade, obterPagina,
    carregarLedger: async () => clone(dados.ledger),
    criarDre: snapshot => a.dre.criarContextoLeitura(snapshot),
    obrasInternas: dados.OBRAS_INTERNAS, ...overrides };
  return { loader: a.dados.criar(deps), deps, chamadas, tabelas, obterPagina,
    trocar: valor => { identidade = valor; } };
}

test('integração distingue acumulado dos recebíveis, período dos movimentos e saldo atual da empresa', () => {
  const a = ambiente(), snapshot = preparar(a);
  const out = a.modelo.construir(snapshot, { periodo: '2026-10', situacao: 'ativas' });
  assert.deepEqual(clone(out.obras.map(o => o.id)), ['a', 'c']);
  assert.equal(out.totais.carteiraCentavos, dinheiro(1800));
  assert.equal(out.totais.recebidoAcumuladoCentavos, dinheiro(1190));
  assert.equal(out.totais.recebidoPeriodoCentavos, dinheiro(670));
  assert.equal(out.totais.custoPeriodoCentavos, dinheiro(600));
  assert.equal(out.totais.diferencaRecebidoCustoCentavos, dinheiro(70));
  assert.equal(out.saldo.totalCentavos, 18500);
  assert.equal(out.saldo.escopo, 'empresa');
  assert.equal(out.escopos.saldo, 'empresa_atual_sem_rateio');
  assert.deepEqual(a.proibidas, []);
});

test('integração mantém pendência e excedente separados por contrato, adicional e obra', () => {
  const a = ambiente(), out = a.modelo.construir(preparar(a), { situacao: 'todas', periodo: '2026-10' });
  assert.equal(out.totais.pendenteContratoCentavos, dinheiro(600));
  assert.equal(out.totais.excedenteContratoCentavos, dinheiro(50));
  assert.equal(out.totais.pendenteAdicionaisCentavos, dinheiro(60));
  assert.equal(out.totais.excedenteAdicionaisCentavos, dinheiro(50));
  assert.equal(out.obras.find(o => o.id === 'a').pendenteAdicionaisCentavos, dinheiro(60));
  assert.equal(out.obras.find(o => o.id === 'a').excedenteAdicionaisCentavos, dinheiro(50));
  assert.equal(out.obras.find(o => o.id === 'b').excedenteContratoCentavos, dinheiro(50));
});

test('integração cruza obra, situação e mês sem alterar o saldo geral nem a DRE da empresa', () => {
  const a = ambiente(), snapshot = preparar(a);
  const out = a.modelo.construir(snapshot, { periodo: '2026-10', obraId: 'b', situacao: 'arquivadas' });
  assert.deepEqual(clone(out.obras.map(o => o.id)), ['b']);
  assert.equal(out.totais.recebidoPeriodoCentavos, 0);
  assert.equal(out.totais.contratoRecebidoCentavos, dinheiro(350));
  assert.equal(out.totais.excedenteContratoCentavos, dinheiro(50));
  assert.equal(out.saldo.totalCentavos, 18500);
  assert.equal(out.dre.empresa.dados.recBruta, 525);
  const conflito = a.modelo.construir(snapshot, { periodo: '2026-10', obraId: 'b', situacao: 'ativas' });
  assert.equal(conflito.obras.length, 0);
  assert.equal(conflito.totais.carteiraCentavos, 0);
  assert.equal(conflito.saldo.totalCentavos, 18500);
  assert.equal(conflito.dre.empresa.dados.recBruta, 525);
});

test('integração lista mês com recebimento adicional sem repasse nem custo e mantém carteira acumulada', () => {
  const a = ambiente(), snapshot = preparar(a);
  assert.deepEqual(clone(a.modelo.mesesDisponiveis(snapshot)), ['2026-11', '2026-10', '2026-09']);
  const out = a.modelo.construir(snapshot, { periodo: '2026-11', obraId: 'a' });
  assert.equal(out.totais.recebidoPeriodoCentavos, dinheiro(20));
  assert.equal(out.totais.custoPeriodoCentavos, 0);
  assert.equal(out.totais.pendenteContratoCentavos, dinheiro(100));
  assert.equal(out.totais.pendenteAdicionaisCentavos, dinheiro(60));
});

test('integração preserva política DRE: imposto conservador, terreno apartado, despesas e adicionais pagos', () => {
  const a = ambiente(), out = a.modelo.construir(preparar(a), { periodo: '2026-10' });
  const d = out.dre.empresa.dados;
  assert.equal(d.recMed, 300);
  assert.equal(d.recAdic, 225, 'pagamento de adicional pendente/cancelado mantém a política anterior da DRE');
  assert.equal(d.recTerr, 200);
  assert.equal(d.recBruta, 525);
  assert.equal(d.impostoReal, 20);
  assert.equal(d.dasEstimado, 31.5);
  assert.equal(d.imposto, 31.5);
  assert.equal(d.impostoEst, true);
  assert.equal(d.cMao, 80); assert.equal(d.cMat, 190); assert.equal(d.cTerr, 300);
  assert.equal(d.despOperReal, 25); assert.equal(d.despAdmin, 75);
  assert.equal(d.resultado, 123.5);
  assert.equal(out.dre.overhead.dados.total, 75);
  assert.equal(out.dre.overhead.dados.noResultado, 15);
  assert.equal(out.dre.overhead.dados.foraResultado, 60);
  assert.deepEqual(a.proibidas, []);
});

test('integração mantém imposto real superior à estimativa sem mudar critérios', () => {
  const a = ambiente(), dados = fixture();
  dados.lancamentos.find(l => l.id === 'tax').total = 60;
  const out = a.modelo.construir(preparar(a, dados), { periodo: '2026-10' });
  assert.equal(out.dre.empresa.dados.imposto, 60);
  assert.equal(out.dre.empresa.dados.impostoEst, false);
  assert.equal(out.dre.empresa.dados.resultado, 95);
});

test('integração mantém snapshot e globais imutáveis, com contexto DRE isolado de mudanças posteriores', () => {
  const a = ambiente(), dados = fixture(), antes = JSON.stringify(dados);
  const snapshot = preparar(a, dados);
  const primeiro = a.modelo.construir(snapshot, { periodo: '2026-10' });
  assert.equal(JSON.stringify(dados), antes);
  assert.equal(a.ctx.obras[0].id, 'global-proibida');
  dados.repasses[1].valor = 9000;
  dados.contasPagar[0].valor = 9000;
  dados.OBRAS_INTERNAS.length = 0;
  const segundo = a.modelo.construir(snapshot, { periodo: '2026-10' });
  assert.equal(segundo.dre.empresa.dados.resultado, primeiro.dre.empresa.dados.resultado);
  assert.equal(segundo.dre.empresa.dados.recBruta, 525);
  assert.deepEqual(a.proibidas, []);
});

test('integração não converte falta de abertura, falha ou resposta de outra empresa em dinheiro disponível', () => {
  const a = ambiente(), snapshot = preparar(a);
  snapshot.ledger = { status: 'confirmado', estado: { company_id: empresa, total_centavos: 0, contas: [] } };
  let out = a.modelo.construir(snapshot, {});
  assert.equal(out.saldo.status, 'sem_abertura'); assert.equal(out.saldo.totalCentavos, null);
  snapshot.ledger = { status: 'indisponivel', estado: null };
  out = a.modelo.construir(snapshot, {});
  assert.equal(out.saldo.status, 'indisponivel'); assert.equal(out.saldo.totalCentavos, null);
  snapshot.ledger = fixture().ledger;
  snapshot.ledger.estado.company_id = 'outra-empresa-ficticia';
  out = a.modelo.construir(snapshot, {});
  assert.equal(out.saldo.status, 'indisponivel'); assert.equal(out.saldo.totalCentavos, null);
  snapshot.ledger = fixture().ledger;
  snapshot.ledger.estado.total_centavos++;
  assert.equal(a.modelo.construir(snapshot, {}).saldo.status, 'indisponivel');
});

test('integração diferencia seleção vazia confirmada de fonte incompleta e DRE indisponível', () => {
  const a = ambiente(), snapshot = preparar(a);
  snapshot.fontes = { repasses: 'parcial' };
  snapshot.repasses = null;
  snapshot.dre = { status: 'indisponivel' };
  const out = a.modelo.construir(snapshot, { obraId: 'ausente', situacao: 'todas' });
  assert.equal(out.status, 'parcial');
  assert.equal(out.totais.contratoPrevistoCentavos, 0);
  assert.equal(out.totais.contratoRecebidoCentavos, null);
  assert.equal(out.totais.pendenteContratoCentavos, null);
  assert.equal(out.totais.custoPeriodoCentavos, 0);
  assert.equal(out.dre.empresa.status, 'indisponivel');
  assert.equal(out.dre.empresa.dados, null);
  assert.equal(out.saldo.totalCentavos, 18500);
});

test('integração mantém quantias zero e negativas explícitas sem transformá-las em caixa', () => {
  const a = ambiente(), dados = fixture();
  dados.obras = [dados.obras[0]]; dados.obras[0].valor_venda = 0;
  dados.repasses = [{ id: 'reversao-ficticia', company_id: empresa, obra_id: 'a', valor: -10.01, data_credito: '2026-10-02' }];
  dados.adicionais = []; dados.pagamentosAdicionais = [];
  dados.lancamentos = [{ id: 'reversao-custo-ficticia', company_id: empresa, obra_id: 'a', total: -3.01, data: '2026-10-02', etapa: '04_alven' }];
  const out = a.modelo.construir(preparar(a, dados), { periodo: '2026-10' });
  assert.equal(out.totais.carteiraCentavos, 0);
  assert.equal(out.totais.recebidoPeriodoCentavos, -1001);
  assert.equal(out.totais.custoPeriodoCentavos, -301);
  assert.equal(out.totais.pendenteContratoCentavos, 1001);
  assert.equal(out.totais.diferencaRecebidoCustoCentavos, -700);
  assert.equal(out.saldo.totalCentavos, 18500);
});

test('integração rejeita estouro monetário e preserva desconhecido em datas inválidas', () => {
  const a = ambiente(), dados = fixture();
  dados.obras[0].valor_venda = '90071992547409.92';
  const out = a.modelo.construir(preparar(a, dados), { obraId: 'a', periodo: '2026-10' });
  assert.equal(out.totais.contratoPrevistoCentavos, null);
  assert.equal(out.totais.pendenteContratoCentavos, null);
  assert.equal(out.status, 'parcial');
  const invalido = fixture();
  invalido.repasses[0].data_credito = '2026-02-30';
  const semData = a.modelo.construir(preparar(a, invalido), { obraId: 'a', periodo: '2026-10' });
  assert.equal(semData.totais.recebidoPeriodoCentavos, null, 'data inválida não pode ser atribuída silenciosamente a outro mês');
  assert.equal(semData.totais.recebidoAcumuladoCentavos, dinheiro(1190));
});

test('integração não consulta adapter nem expõe valores sem identidade explícita da empresa', () => {
  const a = ambiente(), snapshot = preparar(a); delete snapshot.companyId;
  let chamadasDre = 0;
  snapshot.dre = { status: 'confirmada', calcGerencialConsolidado() { chamadasDre++; return {}; },
    calcGerencialPorObra() { chamadasDre++; return {}; } };
  const out = a.modelo.construir(snapshot, {});
  assert.equal(out.status, 'indisponivel'); assert.equal(out.obras.length, 0);
  assert.equal(out.totais.carteiraCentavos, null); assert.equal(out.saldo.totalCentavos, null);
  assert.equal(out.dre.empresa.status, 'indisponivel'); assert.equal(chamadasDre, 0);
});

test('integração alinha obras reais com DRE e aceita alias explícito da empresa', () => {
  const a = ambiente(), dados = fixture();
  dados.company_id = dados.companyId; delete dados.companyId;
  dados.obras[0].interna = true; dados.obras[0].estrutural = true;
  const snapshot = preparar(a, dados);
  const out = a.modelo.construir(snapshot, { situacao: 'todas' });
  assert.deepEqual(clone(out.obras.map(o => o.id)), clone(snapshot.dre.listarObrasReais().map(o => o.id)));
  assert.deepEqual(clone(out.obras.map(o => o.id)), ['a', 'b', 'c']);
  assert.equal(out.companyId, empresa);
});

test('integração loader → DRE → modelo → estado usa somente fontes paginadas explícitas', async () => {
  const a = ambiente(), carregador = criarLoader(a);
  const estado = a.estado.criar({ dados: carregador.loader, modelo: a.modelo,
    obterIdentidade: carregador.deps.obterIdentidade, filtroInicial: { periodo: '2026-10' } });
  const out = await estado.carregar();
  assert.equal(out.fase, 'pronta'); assert.equal(out.visao.status, 'confirmada');
  assert.equal(out.visao.totais.recebidoPeriodoCentavos, dinheiro(670));
  assert.equal(out.visao.dre.empresa.dados.resultado, 123.5);
  assert.equal(out.visao.saldo.totalCentavos, 18500);
  assert.equal(carregador.chamadas.length, 17, 'sete tabelas não vazias exigem página vazia final; três começam vazias');
  assert.equal(Object.isFrozen(out.visao), true);
  assert.equal(Object.isFrozen(out.visao.dre.empresa.dados), true);
  assert.deepEqual(a.proibidas, []);
});

test('integração pagina mais de mil recebimentos sem truncar o total nem duplicar parcelas', async () => {
  const a = ambiente(), dados = fixture();
  dados.repasses = Array.from({ length: 1001 }, (_, n) => ({ id: 'parcela-ficticia-' + n, company_id: empresa,
    obra_id: 'a', valor: 1, tipo: 'pls', data_credito: '2026-10-03' }));
  const carregador = criarLoader(a, dados), snapshot = await carregador.loader.carregar();
  const out = a.modelo.construir(snapshot, { obraId: 'a', periodo: '2026-10' });
  assert.equal(snapshot.repasses.length, 1001);
  assert.equal(snapshot.fontes.repasses.status, 'confirmada');
  assert.equal(out.totais.contratoRecebidoCentavos, dinheiro(1001));
  assert.equal(out.totais.excedenteContratoCentavos, dinheiro(1));
  assert.deepEqual(carregador.chamadas.filter(c => c.tabela === 'repasses_cef')
    .map(c => new URLSearchParams(c.query.slice(1)).get('offset')), ['0', '1000', '1001']);
});

test('integração não trunca fontes quando o servidor limita cada página abaixo do pedido de mil linhas', async () => {
  const a = ambiente(), dados = fixture();
  dados.repasses = Array.from({ length: 1001 }, (_, n) => ({ id: 'parcela-cap-ficticia-' + n, company_id: empresa,
    obra_id: 'a', valor: 1, tipo: 'pls', data_credito: '2026-10-03' }));
  const carregador = criarLoader(a, dados, {}, 127), snapshot = await carregador.loader.carregar();
  const out = a.modelo.construir(snapshot, { obraId: 'a', periodo: '2026-10' });
  assert.equal(snapshot.fontes.repasses.status, 'confirmada'); assert.equal(snapshot.repasses.length, 1001);
  assert.equal(out.totais.contratoRecebidoCentavos, dinheiro(1001));
  assert.equal(out.totais.excedenteContratoCentavos, dinheiro(1));
  assert.deepEqual(carregador.chamadas.filter(c => c.tabela === 'repasses_cef')
    .map(c => new URLSearchParams(c.query.slice(1)).get('offset')), ['0', '127', '254', '381', '508', '635', '762', '889', '1001']);
});

test('integração não transforma falha de recebimentos em zero nem derruba custos e caixa confirmados', async () => {
  const a = ambiente(); let criarDre = 0;
  const carregador = criarLoader(a, fixture(), { criarDre() { criarDre++; throw new Error('Não deveria chamar DRE incompleta'); } });
  const original = carregador.deps.obterPagina;
  const outro = a.dados.criar({ ...carregador.deps, obterPagina: (t, q) => {
    if (t === 'repasses_cef') throw new Error('FALHA PRIVADA FICTICIA');
    return original(t, q);
  } });
  const snapshot = await outro.carregar(), out = a.modelo.construir(snapshot, { periodo: '2026-10' });
  assert.equal(snapshot.repasses, null); assert.equal(snapshot.fontes.repasses.codigo, 'LEITURA_FALHOU');
  assert.equal(out.totais.recebidoPeriodoCentavos, null); assert.equal(out.totais.pendenteContratoCentavos, null);
  assert.equal(out.totais.custoPeriodoCentavos, dinheiro(600));
  assert.equal(out.totais.carteiraCentavos, dinheiro(1800)); assert.equal(out.saldo.totalCentavos, 18500);
  assert.equal(out.dre.empresa.status, 'indisponivel'); assert.equal(criarDre, 0);
  assert.equal(JSON.stringify(snapshot).includes('FALHA PRIVADA'), false);
});

test('integração descarta lote de outro tenant sem aproveitar silenciosamente as demais linhas', async () => {
  const a = ambiente(), dados = fixture();
  dados.repasses.push({ ...dados.repasses[0], id: 'estrangeira-ficticia', company_id: 'outra-empresa-ficticia', valor: 800000 });
  const snapshot = await criarLoader(a, dados).loader.carregar();
  const out = a.modelo.construir(snapshot, { periodo: '2026-10' });
  assert.equal(snapshot.repasses, null); assert.equal(snapshot.fontes.repasses.codigo, 'REGISTROS_INVALIDOS');
  assert.equal(out.totais.contratoRecebidoCentavos, null);
  assert.equal(out.totais.recebidoPeriodoCentavos, null);
  assert.equal(out.dre.empresa.status, 'indisponivel');
  assert.equal(JSON.stringify(snapshot).includes('estrangeira-ficticia'), false);
});

test('integração mantém folha fechada e pagamento parcial separados de custo reconhecido e disponibilidade', async () => {
  const a = ambiente(), dados = fixture();
  dados.quinzenas = [{ id: 'quinzena-ficticia', company_id: empresa, fechada: true,
    data_inicio: '2026-09-01', data_fim: '2026-09-15' }];
  dados.diarias = [{ id: 'diaria-ficticia', company_id: empresa, quinzena_id: 'quinzena-ficticia',
    data: '2026-09-15', periodos: '[{"obra":"OBRA FICTICIA a","fracao":0.5}]', valor: '77.77', diaria_base: '155.54' }];
  dados.contasPagar.push({ id: 'parcial-ficticia', company_id: empresa, valor: 400, status: 'pendente' });
  dados.ledger.estado.pagamentos.push({ conta_pagar_id: 'parcial-ficticia', pago_centavos: 15000, restante_centavos: 25000 });
  const snapshot = await criarLoader(a, dados).loader.carregar();
  const out = a.modelo.construir(snapshot, { periodo: '2026-10' });
  assert.equal(snapshot.coberturaFolha.comprovaPagamento, false);
  assert.equal(snapshot.quinzenas[0].fechada, true); assert.equal(snapshot.diarias[0].valor, '77.77');
  assert.equal(Array.isArray(snapshot.diarias[0].periodos), true);
  assert.equal(snapshot.contasPagar.find(c => c.id === 'parcial-ficticia').valor, 400);
  assert.equal(snapshot.ledger.estado.pagamentos[0].restante_centavos, 25000);
  assert.equal(out.totais.custoPeriodoCentavos, dinheiro(600));
  assert.equal(out.saldo.totalCentavos, 18500);
  assert.equal(out.dre.empresa.dados.resultado, 123.5);
  assert.deepEqual(a.proibidas, []);
});

test('integração loader/estado rejeita troca de ator durante leitura e não entrega visão antiga', async () => {
  const a = ambiente(); let liberar, primeira = true;
  const carregador = criarLoader(a);
  const original = carregador.deps.obterPagina;
  const bloqueado = a.dados.criar({ ...carregador.deps, obterPagina: (t, q) => {
    if (t !== 'repasses_cef' || !primeira) return original(t, q);
    primeira = false;
    return new Promise(resolve => { liberar = () => resolve(original(t, q)); });
  } });
  const estado = a.estado.criar({ dados: bloqueado, modelo: a.modelo,
    obterIdentidade: carregador.deps.obterIdentidade, filtroInicial: { periodo: '2026-10' } });
  const pendente = estado.carregar();
  carregador.trocar({ company_id: empresa, ator_id: 'outro-ator-ficticio', perfil: 'admin' });
  liberar();
  const out = await pendente;
  assert.equal(out.fase, 'invalidada'); assert.equal(out.visao, null);
  assert.equal(estado.ler().visao, null); assert.deepEqual(a.proibidas, []);
});

test('integração estado aplica filtro alterado durante carga ao resultado confirmado', async () => {
  const a = ambiente(); let liberar, primeira = true;
  const carregador = criarLoader(a), original = carregador.deps.obterPagina;
  const bloqueado = a.dados.criar({ ...carregador.deps, obterPagina: (t, q) => {
    if (t !== 'repasses_cef' || !primeira) return original(t, q);
    primeira = false;
    return new Promise(resolve => { liberar = () => resolve(original(t, q)); });
  } });
  const estado = a.estado.criar({ dados: bloqueado, modelo: a.modelo, obterIdentidade: carregador.deps.obterIdentidade });
  const pendente = estado.carregar();
  estado.setFiltro({ obraId: 'b', situacao: 'arquivadas', periodo: '2026-10' });
  liberar();
  const out = await pendente;
  assert.equal(out.fase, 'pronta'); assert.deepEqual(clone(out.visao.obras.map(o => o.id)), ['b']);
  assert.equal(out.visao.totais.recebidoPeriodoCentavos, 0);
  assert.equal(out.visao.totais.excedenteContratoCentavos, dinheiro(50));
  assert.equal(out.visao.saldo.totalCentavos, 18500);
});
