/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Testes de REGRA TEMPORAL do módulo Amortização de Contrato
   Rodar:  node tests/simulador-temporal.test.js

   Auditoria 2026-08-03. Estes testes foram escritos ANTES da correção e
   falhavam de propósito. Cobrem os 7 achados:

   1. `2026-02-31` deve invalidar a data de referência (regex não basta).
   2. Alterar a data de referência deve alterar a competência do cálculo —
      ela não pode ser campo decorativo.
   3. Data de amortização diferente da data de corte deve bloquear na V1.
   4. Evento anterior à data-base não pode ser aplicado silenciosamente.
   5. Dois eventos com mesma data e mesma sequência devem ser rejeitados.
   6. Inverter eventos de mesma data e mesma sequência não pode produzir
      dois resultados válidos diferentes.
   7. `contrato_taxa = "7,95%"` não pode renderizar `7,95%% a.a.`.
   ═══════════════════════════════════════════════════════════════════════════ */

globalThis.SimuladorCalc = require('../js/edr-v2-simulador-calc.js');
globalThis.SimuladorTaxa = require('../js/edr-v2-simulador-taxa.js');
const UI = require('../js/edr-v2-simulador.js');
const Calc = globalThis.SimuladorCalc;

let ok = 0, fail = 0;
const falhas = [];

function eq(atual, esperado, nome) {
  const a = typeof atual === 'bigint' ? atual.toString() : String(atual);
  const e = typeof esperado === 'bigint' ? esperado.toString() : String(esperado);
  if (a === e) { ok++; console.log(`  OK   ${nome}`); }
  else { fail++; falhas.push({ nome, esperado: e, atual: a });
         console.log(`  FAIL ${nome}\n         esperado: ${e}\n         atual:    ${a}`); }
}
function difere(a, b, nome) {
  const x = typeof a === 'bigint' ? a.toString() : String(a);
  const y = typeof b === 'bigint' ? b.toString() : String(b);
  if (x !== y) { ok++; console.log(`  OK   ${nome}`); }
  else { fail++; falhas.push({ nome, esperado: 'valores diferentes', atual: `ambos ${x}` });
         console.log(`  FAIL ${nome} — ambos ${x}`); }
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

const CORTE = '2026-07-30';
const EXTRATO_OK = {
  saldoAtualTxt: '380.000,00',
  dataReferencia: CORTE,
  taxaMensalTxt: '0,832834',
  prazoRemanescente: '416',
  sistema: 'SAC'
};
// Na V1 a amortização ocorre SEMPRE na data de corte.
const AMORT_OK = { valorCent: 400000n, dataAmortizacao: CORTE };

// ═══ 1. DATA DE REFERÊNCIA: calendário real, não só formato ═══
grupo('1. Data de referencia validada por calendario');
{
  // 2026-02-31 casa com /^\d{4}-\d{2}-\d{2}$/ mas não existe.
  const v = UI._simValidarExtrato({ ...EXTRATO_OK, dataReferencia: '2026-02-31' });
  eq(v.ok, false, '2026-02-31 e invalida (dia nao existe em fevereiro)');
  eq(v.erros.some(e => e.indexOf('data de referência') > -1), true,
     'aponta o campo data de referencia');

  lanca(() => UI._simCalcularImpacto({ ...EXTRATO_OK, dataReferencia: '2026-02-31' },
                                     { valorCent: 400000n, dataAmortizacao: '2026-02-31' }),
        'EXTRATO_INCOMPLETO', 'calculo com 2026-02-31 e BLOQUEADO');

  // Outras datas impossíveis
  const impossiveis = ['2026-13-01', '2026-00-10', '2026-04-31', '2025-02-29'];
  impossiveis.forEach(d => {
    const r = UI._simValidarExtrato({ ...EXTRATO_OK, dataReferencia: d });
    eq(r.ok, false, `${d} e invalida`);
  });

  // 2024-02-29 EXISTE (bissexto) — não pode ser rejeitada
  const bis = UI._simValidarExtrato({ ...EXTRATO_OK, dataReferencia: '2024-02-29' });
  eq(bis.ok, true, '2024-02-29 e valida (ano bissexto)');
}

// ═══ 2. DATA DE REFERÊNCIA NÃO É DECORATIVA ═══
grupo('2. Data de referencia altera a competencia do calculo');
{
  const impA = UI._simCalcularImpacto(
    { ...EXTRATO_OK, dataReferencia: '2026-07-30' },
    { valorCent: 400000n, dataAmortizacao: '2026-07-30' });
  const impB = UI._simCalcularImpacto(
    { ...EXTRATO_OK, dataReferencia: '2026-09-30' },
    { valorCent: 400000n, dataAmortizacao: '2026-09-30' });

  // A 1ª parcela projetada nasce um mês DEPOIS da data de corte.
  eq(impA.base.linhas[0].vencimento, '2026-08-30',
     'corte 2026-07-30 -> 1a parcela em 2026-08-30');
  eq(impB.base.linhas[0].vencimento, '2026-10-30',
     'corte 2026-09-30 -> 1a parcela em 2026-10-30');
  difere(impA.base.linhas[0].vencimento, impB.base.linhas[0].vencimento,
         'mudar a data de referencia muda a competencia');

  // Clamp de fim de mês continua valendo: 31/01 + 1m -> 28/02
  const impC = UI._simCalcularImpacto(
    { ...EXTRATO_OK, dataReferencia: '2026-01-31' },
    { valorCent: 400000n, dataAmortizacao: '2026-01-31' });
  eq(impC.base.linhas[0].vencimento, '2026-02-28',
     'corte 31/01 -> 1a parcela 28/02 (clamp)');
}

// ═══ 3. AMORTIZAÇÃO FORA DA DATA DE CORTE É BLOQUEADA ═══
grupo('3. V1 nao aceita amortizacao fora da data de corte');
{
  lanca(() => UI._simCalcularImpacto(EXTRATO_OK,
          { valorCent: 400000n, dataAmortizacao: '2026-08-10' }),
        'DATA_AMORT_FORA_DO_CORTE', 'data posterior ao corte e BLOQUEADA');

  lanca(() => UI._simCalcularImpacto(EXTRATO_OK,
          { valorCent: 400000n, dataAmortizacao: '2026-07-01' }),
        'DATA_AMORT_FORA_DO_CORTE', 'data anterior ao corte e BLOQUEADA');

  // A data de corte é aceita
  const imp = UI._simCalcularImpacto(EXTRATO_OK, AMORT_OK);
  eq(imp.efeitos.reduzir_prazo.ok, true, 'amortizacao NA data de corte e aceita');

  // A mensagem precisa explicar o porquê (pró-rata), não só recusar
  try {
    UI._simCalcularImpacto(EXTRATO_OK, { valorCent: 400000n, dataAmortizacao: '2026-08-10' });
  } catch (e) {
    eq(/pró-rata|pro-rata/i.test(e.message), true,
       'mensagem de bloqueio cita pro-rata');
  }
}

// ═══ 4. EVENTO ANTERIOR À DATA-BASE ═══
grupo('4. Evento anterior a data-base e rejeitado');
{
  const base = {
    saldoCent: 38000000n,
    taxaMensalPpb: 8328340n,
    prazoMeses: 120,
    sistema: 'SAC',
    dataPrimeiraParcela: '2026-08-30',
    dataBase: '2026-07-30'
  };

  lanca(() => Calc.simular({ ...base, amortizacoes: [
          { id: 'x', dataAplicacao: '2026-06-15', sequencia: 1,
            valorCent: 400000n, modalidade: 'reduzir_prazo' }] }),
        'EVENTO_ANTES_DA_BASE', 'evento antes da data-base e rejeitado');

  // Na própria data-base é válido
  const r = Calc.simular({ ...base, amortizacoes: [
    { id: 'x', dataAplicacao: '2026-07-30', sequencia: 1,
      valorCent: 400000n, modalidade: 'reduzir_prazo' }] });
  eq(r.snapshots.length, 1, 'evento NA data-base e aceito');

  // Sem dataBase o motor não impõe piso (compatibilidade)
  const semBase = { ...base };
  delete semBase.dataBase;
  const r2 = Calc.simular({ ...semBase, amortizacoes: [
    { id: 'x', dataAplicacao: '2026-08-30', sequencia: 1,
      valorCent: 400000n, modalidade: 'reduzir_prazo' }] });
  eq(r2.snapshots.length, 1, 'sem dataBase o motor nao impoe piso');
}

// ═══ 5. SEQUÊNCIA: negativa e duplicada ═══
grupo('5. Sequencia negativa e duplicada sao rejeitadas');
{
  const base = {
    saldoCent: 38000000n, taxaMensalPpb: 8328340n, prazoMeses: 120,
    sistema: 'SAC', dataPrimeiraParcela: '2026-08-30'
  };

  lanca(() => Calc.simular({ ...base, amortizacoes: [
          { id: 'a', dataAplicacao: '2026-09-30', sequencia: -1,
            valorCent: 400000n, modalidade: 'reduzir_prazo' }] }),
        'SEQUENCIA_INVALIDA', 'sequencia negativa e rejeitada');

  lanca(() => Calc.simular({ ...base, amortizacoes: [
          { id: 'a', dataAplicacao: '2026-09-30', sequencia: 1,
            valorCent: 400000n, modalidade: 'reduzir_prazo' },
          { id: 'b', dataAplicacao: '2026-09-30', sequencia: 1,
            valorCent: 500000n, modalidade: 'reduzir_prazo' }] }),
        'SEQUENCIA_DUPLICADA', 'mesma data + mesma sequencia e rejeitada');

  // Mesma data com sequências distintas continua válida
  const r = Calc.simular({ ...base, amortizacoes: [
    { id: 'a', dataAplicacao: '2026-09-30', sequencia: 1,
      valorCent: 400000n, modalidade: 'reduzir_prazo' },
    { id: 'b', dataAplicacao: '2026-09-30', sequencia: 2,
      valorCent: 500000n, modalidade: 'reduzir_prazo' }] });
  eq(r.snapshots.length, 2, 'mesma data com sequencias distintas e valida');
}

// ═══ 6. DETERMINISMO: inverter não pode dar dois resultados válidos ═══
grupo('6. Inversao de eventos ambiguos nao produz 2 resultados');
{
  const base = {
    saldoCent: 38000000n, taxaMensalPpb: 8328340n, prazoMeses: 120,
    sistema: 'SAC', dataPrimeiraParcela: '2026-08-30'
  };
  const A = { id: 'a', dataAplicacao: '2026-09-30', sequencia: 1,
              valorCent: 400000n, modalidade: 'reduzir_prazo' };
  const B = { id: 'b', dataAplicacao: '2026-09-30', sequencia: 1,
              valorCent: 900000n, modalidade: 'reduzir_prazo' };

  // Os dois sentidos precisam falhar — não basta um deles.
  lanca(() => Calc.simular({ ...base, amortizacoes: [A, B] }),
        'SEQUENCIA_DUPLICADA', 'ordem [A,B] e rejeitada');
  lanca(() => Calc.simular({ ...base, amortizacoes: [B, A] }),
        'SEQUENCIA_DUPLICADA', 'ordem [B,A] e rejeitada');

  // Com sequências distintas, a ordem do array é irrelevante (determinismo)
  const A2 = { ...A, sequencia: 1 };
  const B2 = { ...B, sequencia: 2 };
  const r1 = Calc.simular({ ...base, amortizacoes: [A2, B2] });
  const r2 = Calc.simular({ ...base, amortizacoes: [B2, A2] });
  eq(r1.totalJurosCent, r2.totalJurosCent,
     'sequencias distintas: ordem do array e irrelevante');
  eq(r1.prazoEfetivo, r2.prazoEfetivo, 'mesmo prazo efetivo nas duas ordens');
}

// ═══ 7. contrato_taxa NÃO pode duplicar o "%" ═══
grupo('7. contrato_taxa exibido sem duplicar simbolo');
{
  // O texto vem do cadastro como o usuário digitou — pode já ter "%".
  eq(UI._simTaxaOrigemTexto('7,95%'), '7,95%', 'texto ja com % e preservado');
  eq(UI._simTaxaOrigemTexto('7,95'), '7,95', 'texto sem % nao ganha sufixo');
  eq(UI._simTaxaOrigemTexto('10,47% a.a.'), '10,47% a.a.', 'texto completo preservado');
  eq(UI._simTaxaOrigemTexto(''), null, 'vazio -> null');
  eq(UI._simTaxaOrigemTexto(null), null, 'null -> null');

  // O defeito original: concatenar sempre produzia "%%"
  eq(/%%/.test(UI._simTaxaOrigemTexto('7,95%') || ''), false,
     'nunca renderiza %% duplo');
  eq(/a\.a\..*a\.a\./.test(UI._simTaxaOrigemTexto('10,47% a.a.') || ''), false,
     'nunca duplica a.a.');
}

// ═══ 8. EVENTO NA DATA-BASE OCORRE ANTES DA 1ª PARCELA ═══
// Achado da auditoria do Codex (2026-08-03): o motor aplicava os eventos DEPOIS
// de gerar a parcela do mês, então a amortização da data de corte incidia sobre
// um saldo já reduzido pela prestação de agosto — contrariando a regra central.
grupo('8. Evento na data-base ocorre ANTES da 1a parcela');
{
  const base = {
    saldoCent: 38000000n,            // R$ 380.000,00 — saldo do extrato
    taxaMensalPpb: 8328340n,
    prazoMeses: 416,
    sistema: 'SAC',
    dataPrimeiraParcela: '2026-08-30',   // um mês após o corte
    dataBase: '2026-07-30'               // data de corte
  };
  const r = Calc.simular({ ...base, amortizacoes: [
    { id: 'ev', dataAplicacao: '2026-07-30', sequencia: 1,
      valorCent: 400000n, modalidade: 'reduzir_prazo' }] });
  const s = r.snapshots[0];

  // O evento incide sobre o saldo do extrato, intocado.
  eq(s.saldoAntesCent, 38000000n, 'saldo antes do evento = saldo do extrato');
  eq(s.saldoDepoisCent, 37600000n, 'saldo depois = 380.000 - 4.000');

  // O evento pertence à data-base, não à primeira parcela.
  eq(s.parcelaReferencia, 0, 'parcelaReferencia = 0 (antes de qualquer parcela)');
  eq(s.fase, 'data_base', 'fase = data_base');

  // A primeira parcela continua um mês depois e usa o saldo JÁ amortizado.
  const l1 = r.linhas[0];
  eq(l1.vencimento, '2026-08-30', '1a parcela um mes apos o corte');
  eq(l1.jurosCent, Calc.calcularJuros(37600000n, 8328340n),
     'juros da 1a parcela sobre o saldo pos-amortizacao');

  // Contraste: juros sobre o saldo do extrato seriam MAIORES.
  difere(l1.jurosCent, Calc.calcularJuros(38000000n, 8328340n),
         'juros da 1a parcela nao usam o saldo pre-amortizacao');

  // A linha da 1ª parcela não carrega o evento — ele é anterior a ela.
  eq(l1.eventoAmortizacao, null, '1a parcela nao carrega o evento da data-base');

  // Evento posterior ao corte continua ligado à sua parcela (fase normal).
  const r2 = Calc.simular({ ...base, amortizacoes: [
    { id: 'ev2', dataAplicacao: '2026-09-30', sequencia: 1,
      valorCent: 400000n, modalidade: 'reduzir_prazo' }] });
  const s2 = r2.snapshots[0];
  eq(s2.fase, 'parcela', 'evento apos o corte tem fase parcela');
  eq(s2.parcelaReferencia > 0, true, 'evento apos o corte referencia uma parcela');
}

// ═══ 9. AUTOCOMPLETE: obras homônimas ═══
// Resolver a obra pelo NOME escolhe a primeira encontrada e pode selecionar a
// obra errada quando duas têm o mesmo nome. A opção precisa de id único.
grupo('9. Obras com nome identico nao podem ser resolvidas pelo nome');
{
  const lista = [
    { id: 10, nome: 'RESIDENCIAL CENTRO' },
    { id: 20, nome: 'RESIDENCIAL CENTRO' },   // homônima
    { id: 30, nome: 'MIRELI' }
  ];

  // Rótulo único por obra: nomes repetidos ganham desambiguação.
  const r10 = UI._simRotuloObra(lista[0], lista);
  const r20 = UI._simRotuloObra(lista[1], lista);
  const r30 = UI._simRotuloObra(lista[2], lista);
  difere(r10, r20, 'obras homonimas recebem rotulos distintos');
  eq(r30, 'MIRELI', 'nome unico permanece sem sufixo');

  // Resolver pelo rótulo devolve a obra certa, não a primeira.
  eq(UI._simResolverObra(r20, lista), '20', 'rotulo da 2a homonima resolve id 20');
  eq(UI._simResolverObra(r10, lista), '10', 'rotulo da 1a homonima resolve id 10');
  eq(UI._simResolverObra('MIRELI', lista), '30', 'nome unico resolve normalmente');

  // Texto ambíguo NÃO pode escolher por conta própria.
  eq(UI._simResolverObra('RESIDENCIAL CENTRO', lista), '',
     'nome ambiguo nao seleciona nenhuma obra');
  eq(UI._simResolverObra('NAO EXISTE', lista), '', 'texto sem correspondencia -> vazio');
  eq(UI._simResolverObra('', lista), '', 'vazio -> vazio');
}

// ═══ RESUMO ═══
console.log('\n' + '═'.repeat(64));
console.log(`RESULTADO TEMPORAL: ${ok} OK · ${fail} FALHA`);
if (fail > 0) {
  console.log('\nFALHAS:');
  falhas.forEach(f => console.log(`  - ${f.nome}\n      esperado: ${f.esperado}\n      atual:    ${f.atual}`));
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
