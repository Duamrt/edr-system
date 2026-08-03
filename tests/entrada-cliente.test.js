/* ═══════════════════════════════════════════════════════════════════════════
   EDR — Testes da regra de ENTRADA DO CLIENTE
   Rodar:  node tests/entrada-cliente.test.js

   Defeito que originou estes testes (2026-08-03): com contrato de R$ 14.000 e
   lançamento de R$ 5.000, o selo exibia "Entrada: R$ 14.000,00 pendente" —
   o valor contratado inteiro, ignorando o recebido.
   ═══════════════════════════════════════════════════════════════════════════ */

const EC = require('../js/edr-v2-entrada-cliente.js');

let ok = 0, fail = 0;
const falhas = [];

function eq(atual, esperado, nome) {
  const a = String(atual), e = String(esperado);
  if (a === e) { ok++; console.log('  OK   ' + nome); }
  else { fail++; falhas.push({ nome, esperado: e, atual: a });
         console.log('  FAIL ' + nome + '\n         esperado: ' + e + '\n         atual:    ' + a); }
}
function grupo(t) { console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 56 - t.length))); }

const OBRA = { id: 'o1', contrato_entrada: 14000 };
const rep = (valor, tipo) => ({ obra_id: 'o1', valor: valor, tipo: tipo || 'entrada' });

// ═══ 1. Sem lançamento ═══
grupo('1. Contratado sem nenhum repasse');
{
  const p = EC.calcular(OBRA, []);
  eq(p.contratado, 14000, 'contratado 14.000');
  eq(p.recebido, 0, 'recebido 0');
  eq(p.pendente, 14000, 'pendente 14.000');
  eq(p.status, 'pendente', 'status pendente');
  eq(p.quitada, false, 'nao quitada');
  eq(EC.rotulo(p, v => v), 'Entrada: 14000 pendente', 'rotulo mostra o contratado');
}

// ═══ 2. O CASO DO DEFEITO — parcial 14k / 5k ═══
grupo('2. Parcial: 14.000 contratado, 5.000 lancado');
{
  const p = EC.calcular(OBRA, [rep(5000)]);
  eq(p.recebido, 5000, 'recebido 5.000');
  eq(p.pendente, 9000, 'pendente 9.000  <- o defeito exibia 14.000');
  eq(p.excedente, 0, 'sem excedente');
  eq(p.status, 'parcial', 'status parcial');
  eq(p.quitada, false, 'nao quitada');
  eq(EC.rotulo(p, v => v), 'Entrada: 9000 pendente · 5000 recebido',
     'rotulo mostra pendente E recebido');
  eq(EC.cor(p), 'yellow', 'cor amarela');
}

// ═══ 3. Quitação exata ═══
grupo('3. Quitacao exata');
{
  const p = EC.calcular(OBRA, [rep(14000)]);
  eq(p.recebido, 14000, 'recebido 14.000');
  eq(p.pendente, 0, 'pendente 0');
  eq(p.status, 'quitada', 'status quitada');
  eq(p.quitada, true, 'quitada');
  eq(EC.cor(p), 'green', 'cor verde');
}

// ═══ 4. Múltiplos lançamentos ═══
grupo('4. Multiplos lancamentos');
{
  const p = EC.calcular(OBRA, [rep(5000), rep(4000), rep(2000)]);
  eq(p.recebido, 11000, 'soma dos 3 = 11.000');
  eq(p.pendente, 3000, 'pendente 3.000');
  eq(p.lancamentos, 3, 'conta 3 lancamentos');
  eq(p.status, 'parcial', 'status parcial');

  // Somando ate quitar
  const q = EC.calcular(OBRA, [rep(5000), rep(4000), rep(5000)]);
  eq(q.recebido, 14000, 'soma exata quita');
  eq(q.status, 'quitada', 'status quitada');
}

// ═══ 5. Pagamento acima do contratado ═══
grupo('5. Recebido acima do contratado');
{
  const p = EC.calcular(OBRA, [rep(16000)]);
  eq(p.recebido, 16000, 'recebido 16.000');
  eq(p.pendente, 0, 'pendente 0, NUNCA negativo');
  eq(p.excedente, 2000, 'excedente 2.000');
  eq(p.status, 'quitada', 'status quitada');
  eq(EC.rotulo(p, v => v), 'Entrada quitada · 2000 acima do contratado',
     'rotulo declara o excedente');
}

// ═══ 6. LEGADO — entrada_paga=true sem repasse ═══
grupo('6. Legado: entrada_paga=true sem repasse');
{
  const p = EC.calcular({ id: 'o1', contrato_entrada: 14000, entrada_paga: true }, []);
  eq(p.recebido, 0, 'recebido 0 — o booleano NAO fabrica dinheiro');
  eq(p.pendente, 14000, 'pendente 14.000');
  eq(p.quitada, false, 'NAO e tratada como quitada');
  eq(p.status, 'inconsistente', 'status inconsistente');
  eq(p.marcadaNoCadastro, true, 'registra que o cadastro diz pago');
  eq(/sem repasse registrado/.test(p.alerta), true, 'alerta explica a divergencia');
  eq(EC.cor(p), 'red', 'cor vermelha — pede conciliacao');

  // Coerencia com o resumo geral: ele conta 0 recebido nesses casos.
  eq(p.recebido, 0, 'coerente com totalRecebido do resumo geral');
}

// ═══ 6b. O BOOLEANO NAO PODE INFLUENCIAR O STATUS DE QUITACAO ═══
// A sabotagem "recebido >= contratado || marcadaNoCadastro" passou despercebida
// porque a checagem de inconsistencia, logo abaixo, sobrescrevia o status.
// Estas asserções travam o ramo de quitação diretamente: o mesmo ledger tem de
// produzir o mesmo `quitada`, com ou sem o booleano.
grupo('6b. Booleano nao altera a decisao de quitacao');
{
  const pares = [
    { rep: [],            nome: 'sem repasse' },
    { rep: [rep(5000)],   nome: 'parcial' },
    { rep: [rep(14000)],  nome: 'quitado' },
    { rep: [rep(16000)],  nome: 'excedente' }
  ];
  pares.forEach(({ rep: r, nome }) => {
    const sem = EC.calcular({ id: 'o1', contrato_entrada: 14000 }, r);
    const com = EC.calcular({ id: 'o1', contrato_entrada: 14000, entrada_paga: true }, r);
    eq(com.quitada, sem.quitada, nome + ': booleano nao muda `quitada`');
    eq(com.recebido, sem.recebido, nome + ': booleano nao muda `recebido`');
    eq(com.pendente, sem.pendente, nome + ': booleano nao muda `pendente`');
  });

  // Sem cobertura, `quitada` e SEMPRE false — independente do booleano.
  eq(EC.calcular({ id: 'o1', contrato_entrada: 14000, entrada_paga: true }, []).quitada,
     false, 'booleano sozinho nunca quita');
  eq(EC.calcular({ id: 'o1', contrato_entrada: 14000, entrada_paga: true }, [rep(13999)]).quitada,
     false, 'um centavo a menos nao quita, mesmo com booleano');
}

// ═══ 7. LEGADO — booleano true com repasse PARCIAL ═══
grupo('7. Legado: entrada_paga=true com repasse parcial');
{
  const p = EC.calcular({ id: 'o1', contrato_entrada: 14000, entrada_paga: true }, [rep(5000)]);
  eq(p.recebido, 5000, 'recebido 5.000 (o ledger vence)');
  eq(p.pendente, 9000, 'pendente 9.000');
  eq(p.status, 'inconsistente', 'status inconsistente');
  eq(/nao cobre|não cobre/.test(p.alerta), true, 'alerta cita cobertura insuficiente');
  eq(p.quitada, false, 'booleano NAO quita');
}

// ═══ 8. Booleano true COM cobertura — sem alarme falso ═══
grupo('8. entrada_paga=true com repasse que cobre');
{
  const p = EC.calcular({ id: 'o1', contrato_entrada: 14000, entrada_paga: true }, [rep(14000)]);
  eq(p.status, 'quitada', 'status quitada, sem inconsistencia');
  eq(p.alerta, 'null', 'sem alerta');
}

// ═══ 9. Isolamento e filtros ═══
grupo('9. Filtra por obra e por tipo');
{
  const outros = [
    rep(5000),
    { obra_id: 'o2', valor: 9999, tipo: 'entrada' },   // outra obra
    { obra_id: 'o1', valor: 7777, tipo: 'pls' },       // outro tipo
    { obra_id: 'o1', valor: 3333, tipo: 'terreno' }    // outro tipo
  ];
  const p = EC.calcular(OBRA, outros);
  eq(p.recebido, 5000, 'ignora outra obra e outros tipos');
  eq(p.lancamentos, 1, 'conta so o repasse de entrada da obra');

  // repasse sem `tipo` cai no default 'pls' — nao conta como entrada
  const semTipo = EC.calcular(OBRA, [{ obra_id: 'o1', valor: 1000 }]);
  eq(semTipo.recebido, 0, 'repasse sem tipo nao vira entrada');
}

// ═══ 10. Bordas ═══
grupo('10. Bordas');
{
  eq(EC.calcular({ id: 'o1', contrato_entrada: 0 }, []).status, 'sem_contrato',
     'contrato 0 -> sem_contrato');
  eq(EC.rotulo(EC.calcular({ id: 'o1', contrato_entrada: 0 }, []), v => v), 'null',
     'sem contrato nao gera rotulo');
  eq(EC.calcular({ id: 'o1' }, []).contratado, 0, 'sem campo -> 0');
  eq(EC.calcular(null, null).status, 'sem_contrato', 'entradas nulas nao quebram');
  eq(EC.calcular(OBRA, [{ obra_id: 'o1', valor: 'abc', tipo: 'entrada' }]).recebido, 0,
     'valor nao numerico vira 0');
  // obra_id numerico vs string
  eq(EC.calcular({ id: 1, contrato_entrada: 100 },
     [{ obra_id: '1', valor: 100, tipo: 'entrada' }]).recebido, 100,
     'compara obra_id por string');
}

// ═══ RESUMO ═══
console.log('\n' + '='.repeat(64));
console.log('RESULTADO ENTRADA: ' + ok + ' OK · ' + fail + ' FALHA');
if (fail > 0) {
  console.log('\nFALHAS:');
  falhas.forEach(f => console.log('  - ' + f.nome + '\n      esperado: ' + f.esperado +
                                  '\n      atual:    ' + f.atual));
}
console.log('='.repeat(64));
process.exit(fail > 0 ? 1 : 0);
