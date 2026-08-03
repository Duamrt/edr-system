/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Testes locais do motor do Simulador
   Rodar:  node tests/simulador-calc.test.js
   Sem dependência externa. Sem rede. Sem banco.
   ═══════════════════════════════════════════════════════════════════════════ */

const C = require('../js/edr-v2-simulador-calc.js');
const T = require('../js/edr-v2-simulador-taxa.js');

let ok = 0, fail = 0;
const falhas = [];

function eq(atual, esperado, nome) {
  const a = typeof atual === 'bigint' ? atual.toString() : String(atual);
  const e = typeof esperado === 'bigint' ? esperado.toString() : String(esperado);
  if (a === e) { ok++; console.log(`  OK   ${nome}`); }
  else {
    fail++; falhas.push({ nome, esperado: e, atual: a });
    console.log(`  FAIL ${nome}\n         esperado: ${e}\n         atual:    ${a}`);
  }
}
function lanca(fn, codigo, nome) {
  try { fn(); fail++; falhas.push({ nome, esperado: codigo, atual: 'nao lancou' });
        console.log(`  FAIL ${nome} — nao lancou (esperava ${codigo})`); }
  catch (e) {
    if (e.codigo === codigo) { ok++; console.log(`  OK   ${nome} [${codigo}]`); }
    else { fail++; falhas.push({ nome, esperado: codigo, atual: e.codigo || e.message });
           console.log(`  FAIL ${nome} — codigo ${e.codigo || e.message}, esperava ${codigo}`); }
  }
}
function grupo(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}`); }

// ═══ 1. PRICE: vetor canônico ═══
grupo('1. PRICE 100.000,00 · 1% a.m. · 100 meses');
{
  const r = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  });
  eq(r.linhas.length, 100, 'gera 100 linhas');
  eq(r.linhas[0].parcelaCent, 158658n, 'parcela 1 = 1.586,58');
  eq(r.linhas[98].parcelaCent, 158658n, 'parcela 99 = 1.586,58');
  eq(r.linhas[99].parcelaCent, 158556n, 'parcela 100 (ultima) = 1.585,56');
  eq(r.saldoFinalCent, 0n, 'saldo final zero');
  eq(r.totalPagoCent, 15865698n, 'total pago = 158.656,98');
  eq(C.centavosParaTexto(r.totalPagoCent), '158.656,98', 'total formatado');
  // soma das linhas EXIBIDAS bate com o total (teste que pegou o erro anterior)
  const soma = r.linhas.reduce((s, l) => s + l.parcelaCent, 0n);
  eq(soma, r.totalPagoCent, 'soma das linhas == total');
  eq(r.linhas[0].jurosCent, 100000n, 'juros mes 1 = 1.000,00');
  eq(r.linhas[0].amortizacaoCent, 58658n, 'amortizacao mes 1 = 586,58');
}

// ═══ 2. PRICE com 1 centavo a menos deixa saldo ═══
grupo('2. PRICE: pagamento 1 centavo menor NAO quita');
{
  const P = C.parcelaPrice(10000000n, 10000000n, 100);
  eq(P, 158658n, 'busca binaria acha 158.658 centavos');
  // simular manualmente com P-1
  let sd = 10000000n, quitou = false;
  for (let k = 0; k < 100; k++) {
    const j = C.calcularJuros(sd, 10000000n);
    let a = (P - 1n) - j;
    if (a <= 0n) break;
    if (a > sd) a = sd;
    sd -= a;
    if (sd === 0n) { quitou = true; break; }
  }
  eq(quitou, false, 'P-1 nao quita em 100 parcelas');
  eq(sd > 0n, true, 'sobra saldo devedor');
}

// ═══ 3. SAC básico ═══
grupo('3. SAC 100.000,00 · 1% a.m. · 100 meses');
{
  const r = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'SAC', dataPrimeiraParcela: '2026-01-10'
  });
  eq(r.linhas.length, 100, 'gera 100 linhas');
  eq(r.linhas[0].amortizacaoCent, 100000n, 'amortizacao constante = 1.000,00');
  eq(r.linhas[0].parcelaCent, 200000n, 'parcela 1 = 2.000,00');
  eq(r.linhas[99].parcelaCent, 101000n, 'parcela 100 = 1.010,00');
  eq(r.saldoFinalCent, 0n, 'saldo final zero');
  const soma = r.linhas.reduce((s, l) => s + l.parcelaCent, 0n);
  eq(soma, r.totalPagoCent, 'soma das linhas == total');
  eq(r.linhas[0].parcelaCent > r.linhas[99].parcelaCent, true, 'parcela decrescente');
}

// ═══ 4. Taxa zero ═══
grupo('4. Taxa zero');
{
  const rp = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 0n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  });
  eq(rp.linhas[0].parcelaCent, 100000n, 'PRICE i=0: parcela = 1.000,00');
  eq(rp.totalJurosCent, 0n, 'PRICE i=0: juros total zero');
  eq(rp.totalPagoCent, 10000000n, 'PRICE i=0: total = principal');
  eq(rp.saldoFinalCent, 0n, 'PRICE i=0: saldo zero');

  const rs = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 0n, prazoMeses: 100,
    sistema: 'SAC', dataPrimeiraParcela: '2026-01-10'
  });
  eq(rs.totalJurosCent, 0n, 'SAC i=0: juros total zero');
  eq(rs.totalPagoCent, 10000000n, 'SAC i=0: total = principal');

  // divisão não exata
  const rd = C.gerarTabela({
    saldoCent: 10000n, taxaMensalPpb: 0n, prazoMeses: 3,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  });
  eq(rd.saldoFinalCent, 0n, 'i=0 divisao inexata: saldo zero');
  eq(rd.linhas.reduce((s, l) => s + l.parcelaCent, 0n), 10000n, 'i=0 divisao inexata: soma exata');
}

// ═══ 5. Prazo de uma parcela ═══
grupo('5. Prazo = 1 parcela');
{
  const rp = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 1,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  });
  eq(rp.linhas.length, 1, 'PRICE n=1: 1 linha');
  eq(rp.linhas[0].parcelaCent, 10100000n, 'PRICE n=1: 101.000,00');
  eq(rp.saldoFinalCent, 0n, 'PRICE n=1: saldo zero');

  const rs = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 1,
    sistema: 'SAC', dataPrimeiraParcela: '2026-01-10'
  });
  eq(rs.linhas[0].parcelaCent, 10100000n, 'SAC n=1: 101.000,00');
}

// ═══ 6. Conversão anual → ppb ═══
grupo('6. Adaptador de taxa');
{
  eq(T.anualParaMensalPpb(0.0795), 6395193n, '7,95% a.a. -> 6.395.193 ppb');
  eq(T.anualParaMensalPpb(0), 0n, '0% a.a. -> 0 ppb');
  eq(T.mensalParaPpb(0.01), 10000000n, '1% a.m. -> 10.000.000 ppb');
  // regra: valor exibido nunca volta como entrada
  const exibido = 0.00639519;  // 6 casas, como sairia na tela
  eq(T.mensalParaPpb(exibido), 6395190n, 'reusar exibido da 6.395.190 (ERRADO por 3 ppb)');
  eq(T.anualParaMensalPpb(0.0795) - T.mensalParaPpb(exibido), 3n, 'diferenca documentada = 3 ppb');
  // parsers de texto livre
  eq(T.interpretarTextoTaxa('7,95%'), 0.0795, 'interpreta "7,95%"');
  eq(T.interpretarTextoTaxa('7.95 % a.a.'), 0.0795, 'interpreta "7.95 % a.a."');
  eq(T.interpretarTextoTaxa('abc'), null, 'texto invalido -> null');
  eq(T.interpretarTextoTaxa(''), null, 'vazio -> null');
  eq(T.interpretarTextoPrazo('360 meses'), 360, 'interpreta "360 meses"');
  eq(T.interpretarTextoPrazo('360'), 360, 'interpreta "360"');
  eq(T.interpretarTextoPrazo('trinta'), null, 'prazo invalido -> null');
}

// ═══ 7. Arredondamento half-up ═══
grupo('7. Juros half-up (BigInt)');
{
  eq(C.calcularJuros(10000000n, 10000000n), 100000n, '100.000,00 x 1% = 1.000,00');
  // 1 centavo x 0,5 ppb-equivalente: exatamente meio -> arredonda para cima
  eq(C.calcularJuros(1n, 500000000n), 1n, 'meio centavo exato -> arredonda para cima');
  eq(C.calcularJuros(1n, 499999999n), 0n, 'abaixo de meio -> para baixo');
  eq(C.calcularJuros(1n, 500000001n), 1n, 'acima de meio -> para cima');
  eq(C.calcularJuros(0n, 10000000n), 0n, 'saldo zero -> juros zero');
  eq(C.calcularJuros(10000000n, 0n), 0n, 'taxa zero -> juros zero');
  eq(C.calcularJuros(3n, 6395193n), 0n, '3 centavos x 0,639% -> 0');
  lanca(() => C.calcularJuros(100, 10000000n), C.ERR.TIPO_INVALIDO, 'rejeita Number como saldo');
  lanca(() => C.calcularJuros(10000000n, 0.01), C.ERR.TIPO_INVALIDO, 'rejeita Number como taxa');
}

// ═══ 8. Datas sem timezone ═══
grupo('8. Datas');
{
  eq(C.formatarDataISO(C.somarMeses({ ano: 2026, mes: 1, dia: 31 }, 1)), '2026-02-28',
     '31/01/2026 + 1 mes = 28/02 (nao bissexto)');
  eq(C.formatarDataISO(C.somarMeses({ ano: 2028, mes: 1, dia: 31 }, 1)), '2028-02-29',
     '31/01/2028 + 1 mes = 29/02 (bissexto)');
  eq(C.formatarDataISO(C.somarMeses({ ano: 2026, mes: 1, dia: 31 }, 3)), '2026-04-30',
     '31/01 + 3 meses = 30/04');
  eq(C.formatarDataISO(C.somarMeses({ ano: 2026, mes: 12, dia: 15 }, 1)), '2027-01-15',
     'vira o ano');
  eq(C.formatarDataISO(C.somarMeses({ ano: 2026, mes: 3, dia: 15 }, 12)), '2027-03-15',
     '+12 meses');
  eq(C.bissexto(2028), true, '2028 bissexto');
  eq(C.bissexto(2100), false, '2100 NAO bissexto (regra 100)');
  eq(C.bissexto(2000), true, '2000 bissexto (regra 400)');
  eq(C.diasNoMes(2026, 2), 28, 'fev 2026 = 28 dias');
  lanca(() => C.parseDataISO('2026-02-30'), C.ERR.DATA_INVALIDA, 'rejeita 30/02');
  lanca(() => C.parseDataISO('10/01/2026'), C.ERR.DATA_INVALIDA, 'rejeita formato BR');
  lanca(() => C.parseDataISO('2026-13-01'), C.ERR.DATA_INVALIDA, 'rejeita mes 13');
}

// ═══ 9. Redução de PRAZO ═══
grupo('9. Amortizacao: reduzir_prazo');
{
  const base = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  });
  const r = C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'a1', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: 2000000n, modalidade: 'reduzir_prazo' }]
  });
  eq(r.snapshots.length, 1, 'gera 1 snapshot');
  eq(r.snapshots[0].parcelaReferencia, 6, 'aplica na parcela 6');
  eq(r.snapshots[0].modalidade, 'reduzir_prazo', 'modalidade registrada');
  eq(r.snapshots[0].saldoDepoisCent, r.snapshots[0].saldoAntesCent - 2000000n, 'saldo coerente');
  eq(r.snapshots[0].parcelaDepoisCent, r.snapshots[0].parcelaAntesCent, 'parcela preservada');
  eq(r.prazoEfetivo < base.prazoEfetivo, true, 'prazo reduziu');
  eq(r.saldoFinalCent, 0n, 'saldo final zero');
  eq(r.totalJurosCent < base.totalJurosCent, true, 'juros totais menores que a base');
  eq(r.linhas[5].eventoAmortizacao !== null, true, 'linha 6 marcada com evento');
  const somaAmort = r.linhas.reduce((s, l) => s + l.amortizacaoCent, 0n);
  eq(somaAmort + r.totalAmortExtraCent, 10000000n, 'amortizacoes somam o principal');
}

// ═══ 10. Redução de PRESTAÇÃO ═══
grupo('10. Amortizacao: reduzir_prestacao');
{
  const r = C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'b1', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: 2000000n, modalidade: 'reduzir_prestacao' }]
  });
  eq(r.prazoEfetivo, 100, 'prazo preservado em 100');
  eq(r.snapshots[0].prazoDepois, r.snapshots[0].prazoAntes, 'prazo inalterado no snapshot');
  eq(r.snapshots[0].parcelaDepoisCent < r.snapshots[0].parcelaAntesCent, true, 'parcela reduziu');
  eq(r.saldoFinalCent, 0n, 'saldo final zero');
  eq(r.linhas[6].parcelaCent < r.linhas[4].parcelaCent, true, 'parcela pos-evento menor');
  const somaAmort = r.linhas.reduce((s, l) => s + l.amortizacaoCent, 0n);
  eq(somaAmort + r.totalAmortExtraCent, 10000000n, 'amortizacoes somam o principal');

  // SAC com reducao de prestacao
  const rs = C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'SAC', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'b2', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: 2000000n, modalidade: 'reduzir_prestacao' }]
  });
  eq(rs.saldoFinalCent, 0n, 'SAC reduzir_prestacao: saldo zero');
  eq(rs.snapshots[0].parcelaDepoisCent < rs.snapshots[0].parcelaAntesCent, true, 'SAC: parcela reduziu');
}

// ═══ 11. Duas amortizações na MESMA data, sequências diferentes ═══
grupo('11. Duas amortizacoes na mesma data');
{
  const r = C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [
      { id: 'c2', dataAplicacao: '2026-06-10', sequencia: 2,
        valorCent: 500000n, modalidade: 'reduzir_prestacao' },
      { id: 'c1', dataAplicacao: '2026-06-10', sequencia: 1,
        valorCent: 1000000n, modalidade: 'reduzir_prazo' }
    ]
  });
  eq(r.snapshots.length, 2, 'dois snapshots');
  eq(r.snapshots[0].eventoId, 'c1', 'sequencia 1 processada primeiro');
  eq(r.snapshots[1].eventoId, 'c2', 'sequencia 2 processada depois');
  eq(r.snapshots[0].modalidade, 'reduzir_prazo', '1o evento: reduzir_prazo');
  eq(r.snapshots[1].modalidade, 'reduzir_prestacao', '2o evento: reduzir_prestacao');
  eq(r.snapshots[1].saldoAntesCent, r.snapshots[0].saldoDepoisCent, 'encadeamento de saldo');
  eq(r.saldoFinalCent, 0n, 'saldo final zero');
  eq(r.totalAmortExtraCent, 1500000n, 'total extra = 15.000,00');
  eq(r.linhas[5].eventoAmortizacao.length, 2, 'linha 6 tem os 2 eventos');

  // ordem inversa na entrada produz o mesmo resultado
  const r2 = C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [
      { id: 'c1', dataAplicacao: '2026-06-10', sequencia: 1,
        valorCent: 1000000n, modalidade: 'reduzir_prazo' },
      { id: 'c2', dataAplicacao: '2026-06-10', sequencia: 2,
        valorCent: 500000n, modalidade: 'reduzir_prestacao' }
    ]
  });
  eq(r2.totalPagoCent, r.totalPagoCent, 'ordem de entrada nao altera resultado');
  eq(r2.prazoEfetivo, r.prazoEfetivo, 'prazo identico');
}

// ═══ 12. Quitação integral e valores inválidos ═══
grupo('12. Quitacao integral e entradas invalidas');
{
  // quitação integral
  const base = C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  });
  const saldoApos5 = base.linhas[4].saldoCent;
  const r = C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'q1', dataAplicacao: '2026-05-10', sequencia: 1,
                     valorCent: saldoApos5, modalidade: 'reduzir_prazo' }]
  });
  eq(r.prazoEfetivo, 5, 'quitacao na parcela 5 encerra em 5 linhas');
  eq(r.saldoFinalCent, 0n, 'saldo zero apos quitacao');
  eq(r.snapshots[0].prazoDepois, 0, 'prazo depois = 0');
  eq(r.snapshots[0].parcelaDepoisCent, 0n, 'parcela depois = 0');

  // valores inválidos
  lanca(() => C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'x', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: 99999999n, modalidade: 'reduzir_prazo' }]
  }), C.ERR.AMORT_EXCEDE_SALDO, 'amortizacao maior que saldo');

  lanca(() => C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'x', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: 0n, modalidade: 'reduzir_prazo' }]
  }), C.ERR.AMORT_INVALIDA, 'amortizacao valor zero');

  lanca(() => C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'x', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: -100n, modalidade: 'reduzir_prazo' }]
  }), C.ERR.AMORT_INVALIDA, 'amortizacao valor negativo');

  lanca(() => C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'x', dataAplicacao: '2026-06-10', sequencia: 1,
                     valorCent: 100000n, modalidade: 'reduzir_tudo' }]
  }), C.ERR.MODALIDADE_INVALIDA, 'modalidade invalida');

  lanca(() => C.simular({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10',
    amortizacoes: [{ id: 'x', dataAplicacao: '2099-06-10', sequencia: 1,
                     valorCent: 100000n, modalidade: 'reduzir_prazo' }]
  }), C.ERR.AMORT_FORA_PRAZO, 'amortizacao depois do fim do prazo');

  lanca(() => C.gerarTabela({
    saldoCent: 0n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  }), C.ERR.SALDO_INVALIDO, 'saldo zero');

  lanca(() => C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 0,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  }), C.ERR.PRAZO_INVALIDO, 'prazo zero');

  lanca(() => C.gerarTabela({
    saldoCent: 10000000n, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'TABELA_X', dataPrimeiraParcela: '2026-01-10'
  }), C.ERR.SISTEMA_INVALIDO, 'sistema invalido');

  lanca(() => C.gerarTabela({
    saldoCent: 100000, taxaMensalPpb: 10000000n, prazoMeses: 100,
    sistema: 'PRICE', dataPrimeiraParcela: '2026-01-10'
  }), C.ERR.TIPO_INVALIDO, 'saldo como Number e rejeitado');
}

// ═══ 13. Integridade estrutural ═══
grupo('13. Integridade (varredura)');
{
  const casos = [
    { s: 10000000n, t: 10000000n, n: 100, sis: 'PRICE' },
    { s: 10000000n, t: 10000000n, n: 100, sis: 'SAC' },
    { s: 25000000n, t: 6395193n,  n: 360, sis: 'PRICE' },
    { s: 25000000n, t: 6395193n,  n: 360, sis: 'SAC' },
    { s: 7777777n,  t: 4123456n,  n: 240, sis: 'PRICE' },
    { s: 7777777n,  t: 4123456n,  n: 240, sis: 'SAC' },
    { s: 100n,      t: 10000000n, n: 12,  sis: 'PRICE' },
    { s: 333n,      t: 1n,        n: 7,   sis: 'SAC' }
  ];
  let todosOk = true;
  for (const c of casos) {
    const r = C.gerarTabela({
      saldoCent: c.s, taxaMensalPpb: c.t, prazoMeses: c.n,
      sistema: c.sis, dataPrimeiraParcela: '2026-01-15'
    });
    const somaP = r.linhas.reduce((x, l) => x + l.parcelaCent, 0n);
    const somaA = r.linhas.reduce((x, l) => x + l.amortizacaoCent, 0n);
    const somaJ = r.linhas.reduce((x, l) => x + l.jurosCent, 0n);
    const bate = r.saldoFinalCent === 0n && somaA === c.s &&
                 somaP === r.totalPagoCent && somaJ === r.totalJurosCent &&
                 somaP === somaA + somaJ;
    if (!bate) { todosOk = false;
      console.log(`       falha em ${c.sis} s=${c.s} t=${c.t} n=${c.n}`); }
  }
  eq(todosOk, true, `${casos.length} casos: saldo zero + somas fecham`);
}

// ═══ RESUMO ═══
console.log('\n' + '═'.repeat(64));
console.log(`RESULTADO: ${ok} OK · ${fail} FALHA`);
if (fail > 0) {
  console.log('\nFALHAS:');
  falhas.forEach(f => console.log(`  - ${f.nome}\n      esperado: ${f.esperado}\n      atual:    ${f.atual}`));
}
console.log('═'.repeat(64));
process.exit(fail > 0 ? 1 : 0);
