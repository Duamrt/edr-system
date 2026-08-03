/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Testes de GUARDA do módulo Amortização de Contrato
   Rodar:  node tests/simulador-guardas.test.js

   Objetivo destes testes (correção de direção 2026-07-30):
   1. Bloquear qualquer cálculo de impacto sem os dados atuais do extrato.
   2. Garantir que `obras.contrato_valor` (valor ORIGINAL financiado) NUNCA
      seja usado como saldo devedor atual.
   ═══════════════════════════════════════════════════════════════════════════ */

// Globais que a UI espera (o módulo é script de browser, não módulo ES).
globalThis.SimuladorCalc = require('../js/edr-v2-simulador-calc.js');
globalThis.SimuladorTaxa = require('../js/edr-v2-simulador-taxa.js');
const UI = require('../js/edr-v2-simulador.js');

let ok = 0, fail = 0;
const falhas = [];

function eq(atual, esperado, nome) {
  const a = typeof atual === 'bigint' ? atual.toString() : String(atual);
  const e = typeof esperado === 'bigint' ? esperado.toString() : String(esperado);
  if (a === e) { ok++; console.log(`  OK   ${nome}`); }
  else { fail++; falhas.push({ nome, esperado: e, atual: a });
         console.log(`  FAIL ${nome}\n         esperado: ${e}\n         atual:    ${a}`); }
}
function lanca(fn, codigo, nome) {
  try { fn(); fail++; falhas.push({ nome, esperado: codigo, atual: 'nao lancou' });
        console.log(`  FAIL ${nome} — nao lancou (esperava ${codigo})`); }
  catch (e) {
    if (e.codigo === codigo) { ok++; console.log(`  OK   ${nome} [${codigo}]`); }
    else { fail++; falhas.push({ nome, esperado: codigo, atual: e.codigo || e.message });
           console.log(`  FAIL ${nome} — codigo ${e.codigo || e.message}`); }
  }
}
function grupo(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`); }

// Extrato completo e válido, usado como base dos testes.
const EXTRATO_OK = {
  saldoAtualTxt: '380.000,00',
  dataReferencia: '2026-07-30',
  taxaMensalTxt: '0,832834',      // ~10,47% a.a. efetiva
  prazoRemanescente: '416',
  sistema: 'SAC'
};
// Auditoria 2026-08-03: na V1 a amortização ocorre SEMPRE na data de corte
// (= dataReferencia do extrato). Ver tests/simulador-temporal.test.js grupo 3.
const AMORT = { valorCent: 400000n, dataAmortizacao: '2026-07-30' };

// ═══ 1. BLOQUEIO: cálculo sem dados do extrato ═══
grupo('1. Bloqueio de calculo sem dados do extrato');
{
  const vazio = { saldoAtualTxt: '', dataReferencia: '', taxaMensalTxt: '',
                  prazoRemanescente: '', sistema: '' };
  const v = UI._simValidarExtrato(vazio);
  eq(v.ok, false, 'extrato vazio: invalido');
  eq(v.erros.length, 5, 'aponta os 5 campos faltantes');
  lanca(() => UI._simCalcularImpacto(vazio, AMORT), 'EXTRATO_INCOMPLETO',
        'calculo com extrato vazio e BLOQUEADO');

  // cada campo faltando isoladamente também bloqueia
  const campos = [
    ['saldoAtualTxt', 'saldo devedor'],
    ['dataReferencia', 'data de referencia'],
    ['taxaMensalTxt', 'taxa mensal'],
    ['prazoRemanescente', 'prazo remanescente'],
    ['sistema', 'sistema']
  ];
  for (const [campo, rotulo] of campos) {
    const parcial = { ...EXTRATO_OK, [campo]: '' };
    eq(UI._simValidarExtrato(parcial).ok, false, `sem ${rotulo}: invalido`);
    lanca(() => UI._simCalcularImpacto(parcial, AMORT), 'EXTRATO_INCOMPLETO',
          `sem ${rotulo}: calculo bloqueado`);
  }
}

// ═══ 2. Valores inválidos também bloqueiam ═══
grupo('2. Valores invalidos no extrato');
{
  const casos = [
    [{ ...EXTRATO_OK, saldoAtualTxt: '0,00' },        'saldo zero'],
    [{ ...EXTRATO_OK, saldoAtualTxt: '-100,00' },     'saldo negativo'],
    [{ ...EXTRATO_OK, saldoAtualTxt: 'abc' },         'saldo nao numerico'],
    [{ ...EXTRATO_OK, dataReferencia: '30/07/2026' }, 'data formato BR'],
    [{ ...EXTRATO_OK, taxaMensalTxt: '-1' },          'taxa negativa'],
    [{ ...EXTRATO_OK, taxaMensalTxt: '150' },         'taxa acima de 100%'],
    [{ ...EXTRATO_OK, prazoRemanescente: '0' },       'prazo zero'],
    [{ ...EXTRATO_OK, prazoRemanescente: '999' },     'prazo acima de 480'],
    [{ ...EXTRATO_OK, prazoRemanescente: 'doze' },    'prazo nao numerico'],
    [{ ...EXTRATO_OK, sistema: 'TABELA_X' },          'sistema invalido']
  ];
  for (const [entrada, rotulo] of casos) {
    eq(UI._simValidarExtrato(entrada).ok, false, `${rotulo}: invalido`);
    lanca(() => UI._simCalcularImpacto(entrada, AMORT), 'EXTRATO_INCOMPLETO',
          `${rotulo}: calculo bloqueado`);
  }
}

// ═══ 3. contrato_valor NUNCA é saldo devedor ═══
grupo('3. contrato_valor NAO e saldo devedor atual');
{
  // Dados reais do print da obra DUAM (aba CEF).
  const obraDUAM = {
    id: 'obra-duam', nome: 'DUAM',
    valor_venda: 399891.2, contrato_valor: 399891.2,
    contrato_taxa: '10,47', contrato_prazo: '420', contrato_data: '2026-03-18'
  };
  const contratoValorCent = 39989120n;   // R$ 399.891,20 em centavos
  const saldoExtratoCent  = 38000000n;   // R$ 380.000,00 (o que o extrato diz)

  // A validação do extrato não conhece a obra: nada de contrato_* entra nela.
  const v = UI._simValidarExtrato(EXTRATO_OK);
  eq(v.ok, true, 'extrato completo: valido');
  eq(v.dados.saldoCent, saldoExtratoCent, 'saldo usado vem do EXTRATO');
  eq(v.dados.saldoCent === contratoValorCent, false, 'saldo NAO e contrato_valor');

  // Um extrato sem saldo NÃO é suprido por contrato_valor da obra.
  const semSaldo = { ...EXTRATO_OK, saldoAtualTxt: '' };
  lanca(() => UI._simCalcularImpacto(semSaldo, AMORT), 'EXTRATO_INCOMPLETO',
        'sem saldo, contrato_valor NAO supre a falta');

  // O impacto calculado parte do saldo do extrato, não do valor original.
  const imp = UI._simCalcularImpacto(EXTRATO_OK, AMORT);
  eq(imp.base.principalCent, saldoExtratoCent, 'base do calculo = saldo do extrato');
  eq(imp.base.principalCent === contratoValorCent, false, 'base do calculo != valor original');

  // Prova de contraste: se alguém usasse contrato_valor, o resultado seria OUTRO.
  const impErrado = UI._simCalcularImpacto(
    { ...EXTRATO_OK, saldoAtualTxt: '399.891,20' }, AMORT);
  const jurosCerto  = imp.efeitos.reduzir_prazo.jurosEconomizadosCent;
  const jurosErrado = impErrado.efeitos.reduzir_prazo.jurosEconomizadosCent;
  eq(jurosCerto !== jurosErrado, true,
     'usar valor original daria economia DIFERENTE (por isso e bloqueado)');
  console.log(`         economia c/ saldo real  : ${SimuladorCalc.centavosParaTexto(jurosCerto)}`);
  console.log(`         economia c/ valor origem: ${SimuladorCalc.centavosParaTexto(jurosErrado)}`);

  // O parser de exibição de contrato_* não devolve BigInt de cálculo.
  eq(typeof UI._simNumParaMoedaTxt(obraDUAM.contrato_valor), 'string',
     'contrato_valor vira texto de exibicao, nao centavos de calculo');
  eq(UI._simNumParaMoedaTxt(obraDUAM.contrato_valor), '399891,20', 'formatacao de exibicao');
}

// ═══ 4. Impacto correto quando o extrato está completo ═══
grupo('4. Impacto calculado a partir do extrato');
{
  const imp = UI._simCalcularImpacto(EXTRATO_OK, AMORT);
  const p = imp.efeitos.reduzir_prazo;
  const q = imp.efeitos.reduzir_prestacao;
  eq(p.ok, true, 'reduzir_prazo aplicavel');
  eq(q.ok, true, 'reduzir_prestacao aplicavel');
  eq(p.prazoDepois < p.prazoAntes, true, 'reduzir_prazo: prazo cai');
  eq(p.parcelasReduzidas > 0, true, 'reduzir_prazo: informa parcelas reduzidas');
  eq(q.prazoDepois, q.prazoAntes, 'reduzir_prestacao: prazo mantido');
  eq(q.parcelaDepoisCent < q.parcelaAntesCent, true, 'reduzir_prestacao: parcela cai');
  eq(p.jurosEconomizadosCent > 0n, true, 'reduzir_prazo: economia positiva');
  eq(q.jurosEconomizadosCent > 0n, true, 'reduzir_prestacao: economia positiva');
  eq(p.jurosEconomizadosCent > q.jurosEconomizadosCent, true,
     'reduzir_prazo economiza mais que reduzir_prestacao');
  eq(imp.base.saldoFinalCent, 0n, 'tabela base quita');
}

// ═══ 5. Amortização maior que o saldo do extrato ═══
grupo('5. Amortizacao maior que o saldo');
{
  const imp = UI._simCalcularImpacto(EXTRATO_OK,
    { valorCent: 99999999999n, dataAmortizacao: '2026-07-30' });
  eq(imp.efeitos.reduzir_prazo.ok, false, 'reduzir_prazo rejeitado');
  eq(imp.efeitos.reduzir_prestacao.ok, false, 'reduzir_prestacao rejeitado');
  eq(imp.efeitos.reduzir_prazo.codigo, 'AMORTIZACAO_EXCEDE_SALDO', 'codigo correto');
}

// ═══ 6. Parser de moeda ═══
grupo('6. Parser de moeda (sem float)');
{
  eq(UI._simParseMoeda('380.000,00'), 38000000n, '380.000,00');
  eq(UI._simParseMoeda('R$ 4.000,00'), 400000n, 'com prefixo R$');
  eq(UI._simParseMoeda('0,01'), 1n, 'um centavo');
  eq(UI._simParseMoeda(''), null, 'vazio -> null');
  eq(UI._simParseMoeda('abc'), null, 'texto -> null');
  eq(UI._simParseMoeda('1,234'), null, '3 casas decimais -> null');
  eq(UI._simNumParaMoedaTxt(399891.2), '399891,20', 'numero do banco -> texto');
  eq(UI._simNumParaMoedaTxt(null), null, 'null -> null');
}

// ═══ RESUMO ═══
console.log('\n' + '═'.repeat(64));
console.log(`RESULTADO GUARDAS: ${ok} OK · ${fail} FALHA`);
if (fail > 0) {
  console.log('\nFALHAS:');
  falhas.forEach(f => console.log(`  - ${f.nome}\n      esperado: ${f.esperado}\n      atual:    ${f.atual}`));
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
