'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Modelo = require('../js/edr-v2-visao-financeira-modelo.js');

function fixture() {
  return {
    companyId: 'empresa-A',
    obras: [
      { id: 'a', nome: 'Casa A', valor_venda: '100.00', arquivada: false },
      { id: 'b', nome: 'Casa B', valor_venda: '200.00', arquivada: true },
      { id: 'office', nome: 'EDR Escritorio', valor_venda: '9999.00' },
      { id: 'qa', nome: 'OBRA QA sintetica', valor_venda: '8888.00' }
    ],
    lancamentos: [
      { obra_id: 'a', total: '20.10', data: '2026-01-31' },
      { obra_id: 'a', total: '30.20', data: '2026-02-01' },
      { obra_id: 'b', total: '40.00', data: '2026-02-01' }
    ],
    repasses: [
      { obra_id: 'a', valor: '110.00', data_credito: '2026-01-31' },
      { obra_id: 'b', valor: '10.00', data_credito: '2026-02-01' }
    ],
    adicionais: [
      { id: 'a1', obra_id: 'a', valor: '20.00', status: 'aprovado' },
      { id: 'a2', obra_id: 'a', valor: '40.00', status: 'em_andamento' },
      { id: 'a3', obra_id: 'a', valor: '100.00', status: 'pendente' },
      { id: 'a4', obra_id: 'a', valor: '100.00', status: 'cancelado' },
      { id: 'b1', obra_id: 'b', valor: '50.00', status: 'concluido' }
    ],
    pagamentosAdicionais: [
      { adicional_id: 'a1', valor: '30.00', data: '2026-01-31' },
      { adicional_id: 'a2', valor: '10.00', data: '2026-02-01' },
      { adicional_id: 'a3', valor: '20.00', data: '2026-03-01' },
      { adicional_id: 'b1', valor: '5.00', data: '2026-02-01' }
    ],
    ledger: {
      status: 'confirmado',
      estado: {
        company_id: 'empresa-A',
        contas: [
          { id: 'bank', nome: 'Banco sintetico', codigo: 'banco', saldo_centavos: 10000 },
          { id: 'cash', nome: 'Dinheiro sintetico', codigo: 'dinheiro', saldo_centavos: -1000 }
        ],
        total_centavos: 9000
      }
    }
  };
}
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('filtros normalizados e invalidos recusados sem fallback silencioso', () => {
  assert.deepEqual(Modelo.normalizarFiltro(null), { periodo: '', obraId: '', situacao: 'ativas' });
  assert.throws(() => Modelo.normalizarFiltro({ periodo: '2026-13' }), RangeError);
  assert.throws(() => Modelo.normalizarFiltro({ periodo: '2026-1' }), RangeError);
  assert.throws(() => Modelo.normalizarFiltro({ situacao: 'paga' }), RangeError);
});

test('carteira acumulada separada de recebimento e custo do periodo civil', () => {
  const janeiro = Modelo.construir(fixture(), { periodo: '2026-01' });
  const fevereiro = Modelo.construir(fixture(), { periodo: '2026-02' });
  assert.equal(janeiro.totais.carteiraCentavos, 16000);
  assert.equal(fevereiro.totais.carteiraCentavos, 16000);
  assert.equal(janeiro.totais.recebidoPeriodoCentavos, 14000);
  assert.equal(fevereiro.totais.recebidoPeriodoCentavos, 1000);
  assert.equal(janeiro.totais.custoPeriodoCentavos, 2010);
  assert.equal(fevereiro.totais.custoPeriodoCentavos, 3020);
  assert.equal(janeiro.escopos.recebiveis, 'obras_selecionadas_acumulado');
  assert.equal(fevereiro.escopos.movimentos, '2026-02');
});

test('obra e situacao se cruzam, sem vazar adicionais arquivados na selecao ativa', () => {
  const arquivadas = Modelo.construir(fixture(), { periodo: '2026-02', situacao: 'arquivadas', obraId: 'b' });
  assert.deepEqual(arquivadas.obras.map(o => o.id), ['b']);
  assert.equal(arquivadas.totais.adicionaisPrevistosCentavos, 5000);
  assert.equal(arquivadas.totais.adicionaisRecebidosCentavos, 500);
  assert.equal(arquivadas.totais.recebidoPeriodoCentavos, 1500);
  const cruzamentoVazio = Modelo.construir(fixture(), { situacao: 'ativas', obraId: 'b' });
  assert.deepEqual(cruzamentoVazio.obras, []);
  assert.equal(cruzamentoVazio.totais.carteiraCentavos, 0);
});

test('pendentes e excedentes nao se compensam entre contrato, adicionais ou obras', () => {
  const r = Modelo.construir(fixture(), { situacao: 'todas' });
  assert.equal(r.totais.pendenteContratoCentavos, 19000);
  assert.equal(r.totais.excedenteContratoCentavos, 1000);
  assert.equal(r.totais.pendenteAdicionaisCentavos, 7500);
  assert.equal(r.totais.excedenteAdicionaisCentavos, 1000);
  assert.equal(r.obras.find(o => o.id === 'a').contrato.pendenteCentavos, 0);
  assert.equal(r.obras.find(o => o.id === 'a').adicionais[1].pendenteCentavos, 3000);
  assert.equal(r.obras.find(o => o.id === 'a').adicionais[0].excedenteCentavos, 1000);
});

test('adicionais pendentes/cancelados nao inflam carteira nem compensam aprovados', () => {
  const r = Modelo.construir(fixture());
  assert.deepEqual(r.obras[0].adicionais.map(a => a.id), ['a1', 'a2']);
  assert.equal(r.totais.adicionaisPrevistosCentavos, 6000);
  assert.equal(r.totais.adicionaisRecebidosCentavos, 4000);
});

test('meses inclui adicional-only, sem depender de repasse ou custo no mes', () => {
  const s = fixture();
  s.lancamentos = [];
  s.repasses = [];
  s.pagamentosAdicionais = [{ adicional_id: 'a1', valor: '1.00', data: '2026-09-30' }];
  assert.deepEqual(Modelo.mesesDisponiveis(s), ['2026-09']);
  assert.equal(Modelo.construir(s, { periodo: '2026-09' }).totais.recebidoPeriodoCentavos, 100);
});

test('datas invalidas nao fabricam competencia e data sem horario nao usa UTC', () => {
  const s = fixture();
  s.pagamentosAdicionais = [{ adicional_id: 'a1', valor: '1.00', data: '2026-02-30' }];
  assert.deepEqual(Modelo.mesesDisponiveis(s), ['2026-02', '2026-01']);
  assert.equal(Modelo.construir(s, { periodo: '2026-02' }).totais.recebidoPeriodoCentavos, null);
  assert.equal(Modelo.construir(fixture(), { periodo: '2026-01' }).totais.contratoRecebidoCentavos, 11000);
});

test('snapshot nulo e fontes ausentes retornam desconhecido, nao zero financeiro', () => {
  const r = Modelo.construir(null);
  assert.equal(r.status, 'indisponivel');
  assert(Object.values(r.totais).every(v => v === null));
  assert.equal(r.saldo.status, 'indisponivel');
  assert.equal(r.saldo.totalCentavos, null);
});

test('erro de carga com array antigo presente nao reutiliza valor nem vira zero', () => {
  const s = fixture();
  s.fontes = { repasses: { status: 'indisponivel', erro: 'sintetico' } };
  const r = Modelo.construir(s, { periodo: '2026-01' });
  assert.equal(r.status, 'parcial');
  assert.equal(r.totais.contratoRecebidoCentavos, null);
  assert.equal(r.totais.recebidoPeriodoCentavos, null);
  assert.equal(r.totais.custoPeriodoCentavos, 2010);
  assert.equal(r.totais.contratoPrevistoCentavos, 10000);
});

test('fonte parcial nao e exibida como total confirmado', () => {
  const s = fixture();
  s.fontes = { adicionais: 'parcial' };
  const r = Modelo.construir(s);
  assert.equal(r.totais.carteiraCentavos, null);
  assert.equal(r.totais.pendenteAdicionaisCentavos, null);
  assert.equal(r.totais.contratoRecebidoCentavos, 11000);
  assert.equal(r.fontes.adicionais.status, 'parcial');
});

test('selecao vazia nao transforma fonte indisponivel em zero', () => {
  const s = fixture();
  s.lancamentos = null;
  const r = Modelo.construir(s, { obraId: 'inexistente' });
  assert.equal(r.totais.custoPeriodoCentavos, null);
  assert.equal(r.totais.diferencaRecebidoCustoCentavos, null);
});

test('centavos deterministas e soma sem acumulacao de floats', () => {
  assert.equal(Modelo.centavos('1.005'), 101);
  assert.equal(Modelo.centavos('-1.005'), -101);
  assert.equal(Modelo.centavos(0.1 + 0.2), 30);
  assert.equal(Modelo.centavos(null), null);
  assert.equal(Modelo.centavos('R$ 1,00'), null);
  assert.equal(Modelo.centavos(Infinity), null);
  const s = fixture();
  s.lancamentos = Array.from({ length: 1000 }, () => ({ obra_id: 'a', total: 0.1, data: '2026-01-01' }));
  assert.equal(Modelo.construir(s).totais.custoPeriodoCentavos, 10000);
});

test('overflow monetario fica indisponivel em vez de perder centavos', () => {
  assert.equal(Modelo.centavos('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  assert.equal(Modelo.centavos('90071992547409.92'), null);
  const s = fixture();
  s.lancamentos = [
    { obra_id: 'a', total: '90071992547409.91', data: '2026-01-01' },
    { obra_id: 'a', total: '0.01', data: '2026-01-01' }
  ];
  assert.equal(Modelo.construir(s).totais.custoPeriodoCentavos, null);
});

test('valor de contrato nulo nao e apresentado como carteira zero', () => {
  const s = fixture();
  s.obras[0].valor_venda = null;
  const r = Modelo.construir(s);
  assert.equal(r.totais.contratoPrevistoCentavos, null);
  assert.equal(r.totais.carteiraCentavos, null);
  assert.equal(r.totais.pendenteContratoCentavos, null);
  assert.equal(r.totais.contratoRecebidoCentavos, 11000);
});

test('modelo aceita inputs congelados e resultado nao aponta para objetos fonte', () => {
  const s = freezeDeep(fixture());
  const antes = JSON.stringify(s);
  const r = Modelo.construir(s);
  r.obras[0].nome = 'Mudanca apenas no retorno';
  r.saldo.contas[0].nome = 'Outra mudanca local';
  assert.equal(JSON.stringify(s), antes);
  assert.equal(s.obras[0].nome, 'Casa A');
  assert.equal(s.ledger.estado.contas[0].nome, 'Banco sintetico');
});

test('namespace global existe sem DOM, Date financeiro ou rede', () => {
  const context = { fetch() { throw new Error('Rede proibida'); }, Date() { throw new Error('Date proibido'); } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/edr-v2-visao-financeira-modelo.js', 'utf8'), context);
  assert.equal(typeof context.FinanceiroVisaoModelo.construir, 'function');
  assert.equal(context.FinanceiroVisaoModelo.centavos('0.11'), 11);
  assert.deepEqual(JSON.parse(JSON.stringify(context.FinanceiroVisaoModelo.mesesDisponiveis(fixture()))), ['2026-03', '2026-02', '2026-01']);
  assert(Object.isFrozen(Modelo));
});

test('DRE adapter preserva resultado injetado e recebe periodo, sem rateio empresarial', () => {
  const s = fixture();
  const calls = [];
  const dados = { resultado: 123.45, imposto: 67, recTerr: 89, detalhe: { regra: 'vigente' } };
  s.dre = {
    status: 'confirmada',
    calcGerencialConsolidado(per) { calls.push(['empresa', per]); return dados; },
    calcGerencialPorObra(id, per) { calls.push(['obra', id, per]); return { margem: id === 'a' ? 12 : 34 }; }
  };
  const r = Modelo.construir(s, { periodo: '2026-02', obraId: 'a' });
  assert.deepEqual(calls, [['obra', 'a', '2026-02'], ['empresa', '2026-02']]);
  assert.deepEqual(r.dre.empresa.dados, dados);
  r.dre.empresa.dados.detalhe.regra = 'retorno';
  assert.equal(dados.detalhe.regra, 'vigente');
  assert.equal(r.dre.empresa.dados.resultado, 123.45);
  assert.equal(r.escopos.dreEmpresa, 'empresa_no_periodo');
});

test('DRE ausente, falho ou assincrono fica indisponivel sem reimplementar imposto', () => {
  for (const fn of [() => { throw new Error('Falha sintetica'); }, async () => ({ resultado: 1 })]) {
    const s = fixture();
    s.dre = { status: 'confirmada', calcGerencialConsolidado: fn };
    const r = Modelo.construir(s);
    assert.equal(r.dre.empresa.status, 'indisponivel');
    assert.equal(r.dre.empresa.dados, null);
    assert.equal(r.totais.carteiraCentavos, 16000);
  }
});

test('saldo confirmado e geral e nao muda por filtros de obra, status ou periodo', () => {
  for (const f of [{ obraId: 'a' }, { situacao: 'arquivadas', periodo: '2026-02' }, { obraId: 'inexistente' }]) {
    const r = Modelo.construir(fixture(), f);
    assert.equal(r.saldo.totalCentavos, 9000);
    assert.equal(r.saldo.escopo, 'empresa');
    assert.equal(r.saldo.periodo, 'atual');
    assert.equal(r.saldo.contas[1].saldoCentavos, -1000);
  }
});

test('ledger erro, sem abertura, tenant divergente e total inconsistente nao mostram zero', () => {
  const s = fixture();
  const semAbertura = { status: 'confirmado', estado: { company_id: 'empresa-A', contas: [], total_centavos: 0 } };
  assert.equal(Modelo.saldoGeral(semAbertura, 'empresa-A').status, 'sem_abertura');
  const variantes = [
    null, { status: 'indisponivel', estado: s.ledger.estado },
    { status: 'confirmado', estado: { ...s.ledger.estado, company_id: 'empresa-B' } },
    { status: 'confirmado', estado: { ...s.ledger.estado, total_centavos: 8999 } },
    semAbertura
  ];
  for (const ledger of variantes) {
    assert.equal(Modelo.saldoGeral(ledger, 'empresa-A').totalCentavos, null);
  }
  s.ledger = null;
  assert.equal(Modelo.construir(s).totais.carteiraCentavos, 16000);
});

test('linhas explicitamente de outro tenant nao entram nos resultados ou meses', () => {
  const s = fixture();
  s.repasses.push({ company_id: 'empresa-B', obra_id: 'a', valor: '999.00', data_credito: '2030-01-01' });
  s.obras.push({ company_id: 'empresa-B', id: 'foreign', nome: 'Outra empresa', valor_venda: 999 });
  const r = Modelo.construir(s);
  assert.equal(r.totais.contratoRecebidoCentavos, 11000);
  assert(!r.meses.includes('2030-01'));
  assert(!r.obras.some(o => o.id === 'foreign'));
});

test('arrays vazios explicitamente confirmados podem ter zero legitimo', () => {
  const r = Modelo.construir({ companyId: 'empresa-A', obras: [], lancamentos: [], repasses: [], adicionais: [], pagamentosAdicionais: [] });
  assert.equal(r.status, 'confirmada');
  assert(Object.values(r.totais).every(v => v === 0));
  assert.equal(r.saldo.totalCentavos, null);
});

test('empresa ausente nao confirma totais nem chama adapter de outra sessao', () => {
  const s = fixture();
  delete s.companyId;
  let chamadas = 0;
  s.dre = { status: 'confirmada', calcGerencialConsolidado() { chamadas++; return { resultado: 1 }; } };
  const r = Modelo.construir(s);
  assert.equal(r.status, 'indisponivel');
  assert(Object.values(r.totais).every(v => v === null));
  assert.equal(r.saldo.totalCentavos, null);
  assert.equal(chamadas, 0);
});

test('aliases do loader e exclusao de obras acompanham o contrato DRE por ID/nome', () => {
  const s = fixture();
  s.company_id = s.companyId; delete s.companyId;
  s.ledger.status = 'confirmada';
  s.obras.push({ id: 'flag', nome: 'Casa C', valor_venda: 1, interna: true });
  s.OBRAS_INTERNAS = ['a'];
  const r = Modelo.construir(s);
  assert.deepEqual(r.obras.map(o => o.id), ['flag']);
  assert.equal(r.companyId, 'empresa-A');
  assert.equal(r.saldo.totalCentavos, 9000);
});
