'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const calc = require('../js/edr-v2-entrada-plano-calc.js');
const row = (overrides = {}) => ({ id: 'parcela', base: 700000, mode: 'percent', rate: 1500, final: 805000, ...overrides });
function pay(r, receipts, amount, day = '2026-10-08', delivery = '2027-08-01') {
  const q = calc.paymentQuote(r, receipts, amount, day, delivery);
  receipts.push({ id: 'r' + receipts.length, rowId: r.id, ...q });
  return q;
}
test('entrada v6: valores, percentuais e datas civis sem fuso ou data fictícia', () => {
  assert.equal(calc.moneyInput('46216,58'), 4621658);
  assert.equal(calc.moneyInput('0', true), 0);
  for (const v of ['1.000,00', '-1', '1.001', '1e4', 'Infinity', '', '1000000.01']) assert.throws(() => calc.moneyInput(v));
  assert.equal(calc.rateInput('15'), 1500);
  assert.throws(() => calc.rateInput('100.01'));
  assert.equal(calc.validDate(null, true), '');
  assert.equal(calc.validDate('2024-02-29'), '2024-02-29');
  for (const d of ['2026-02-29', '2026-04-31', '0000-01-01', '2026-1-1', '2026-10-08T00:00:00Z']) assert.throws(() => calc.validDate(d));
});
test('entrada v6: modo exclusivo percentual, dispensado ou valor final', () => {
  assert.equal(calc.negotiated(row()), 805000);
  assert.equal(calc.negotiated(row({ mode: 'waived' })), 700000);
  assert.equal(calc.negotiated(row({ mode: 'final', final: 750000 })), 750000);
  assert.equal(calc.components(row({ mode: 'final', final: 650000 }), []).principalDue, 650000);
  assert.throws(() => calc.negotiated(row({ mode: 'ambos' })));
});
test('entrada v6: antecipação inteira cancela acréscimo sem recebê-lo', () => {
  const receipts = [], r = row(), q = pay(r, receipts, 700000);
  assert.equal(q.principal, 700000); assert.equal(q.additionPaid, 0); assert.equal(q.cancelled, 105000);
  const s = calc.summarize([r], receipts);
  assert.deepEqual(s.totals, { original: 700000, agreed: 700000, received: 700000, remaining: 0, cancelled: 105000, delta: 0 });
  assert.throws(() => pay(r, [], 805000));
});
test('entrada v6: antecipações parciais conservam centavos por arredondamento acumulado', () => {
  const r = row({ base: 103, rate: 1500 }), receipts = [];
  for (let i = 0; i < 103; i++) pay(r, receipts, 1);
  const c = calc.components(r, receipts);
  assert.equal(c.cancelled, 15); assert.equal(c.received, 103); assert.equal(c.remaining, 0);
  assert.equal(receipts.reduce((s, v) => s + v.cancelled, 0), 15);
});
test('entrada v6: entrega indefinida, dia da entrega ou depois não cancela', () => {
  for (const delivery of [null, '2026-10-08', '2026-10-07']) {
    const receipts = [], q = pay(row(), receipts, 805000, '2026-10-08', delivery);
    assert.equal(q.cancelled, 0); assert.equal(q.principal, 700000); assert.equal(q.additionPaid, 105000);
    assert.equal(q.remaining, 0);
  }
});
test('entrada v6: renegociação usa apenas saldo remanescente e preserva histórico', () => {
  let r = row(), receipts = [];
  pay(r, receipts, 350000);
  const before = calc.components(r, receipts);
  r = { ...r, mode: 'final', final: 875000 };
  const c = calc.components(r, receipts);
  r.allocation = { principal: c.principalRemaining, addition: c.additionRemaining, principalPaidStart: c.principalPaid, feeRelievedStart: c.additionPaid + c.cancelled };
  const q = pay(r, receipts, 175000);
  assert.equal(before.cancelled, 52500); assert.equal(q.cancelled, 61250);
  assert.equal(receipts[0].cancelled, 52500);
  assert.throws(() => calc.components({ ...r, mode: 'final', final: 400000 }, receipts));
});
test('entrada v6: estorno parcial acumulado restaura principal e cancelamento sem duplicar', () => {
  const r = row({ base: 103, rate: 1500 }), receipts = [];
  pay(r, receipts, 103);
  const original = receipts[0];
  for (let i = 0; i < 103; i++) {
    const q = calc.reversalQuote(original, receipts, 1);
    receipts.push({ id: 's' + i, rowId: r.id, reverses: original.id, amount: -q.amount, principal: -q.principal, additionPaid: -q.additionPaid, cancelled: -q.cancelled });
  }
  assert.equal(calc.components(r, receipts).cancelled, 0);
  assert.equal(calc.components(r, receipts).principalPaid, 0);
  assert.equal(calc.components(r, receipts).remaining, 118);
  assert.throws(() => calc.reversalQuote(original, receipts, 1));
});
test('entrada v6: estorno de pagamento com principal e acréscimo recompõe ambos', () => {
  const r = row(), receipts = [];
  pay(r, receipts, 805000, '2027-08-01', '2027-08-01');
  const q = calc.reversalQuote(receipts[0], receipts, 402500);
  assert.deepEqual(q, { amount: 402500, principal: 350000, additionPaid: 52500, cancelled: 0 });
});
test('entrada v6: grandes valores conservam precisão e rejeitam históricos inválidos', () => {
  assert.equal(calc.negotiated(row({ base: 8000000000000000, rate: 1 })), 8000800000000000);
  assert.throws(() => calc.negotiated(row({ base: Number.MAX_SAFE_INTEGER, rate: 1500 })));
  assert.throws(() => calc.summarize([row(), row()], []));
  assert.throws(() => calc.summarize([row()], [{ rowId: 'fora', amount: 1 }]));
  assert.throws(() => calc.components(row(), [{ rowId: 'parcela', amount: 2, principal: 1, additionPaid: 0 }]));
  assert.throws(() => calc.components(row(), [{ rowId: 'parcela', amount: -1 }]));
});
test('entrada v6: comparação com fonte v6 recuperada em pagamentos e estornos', { skip: !process.env.EDR_PREVIA_V6 }, () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(process.env.EDR_PREVIA_V6, 'dist', 'installments-model.js'), 'utf8'), context);
  const src = context.EDRInstallments;
  src.setDates({ id: 'dates', actor: 'Duam', delivery: '2027-08-01' });
  const sourceRow = src.snapshot().rows.find(r => r.id === 'oct'), receipts = [];
  for (const [i, amount] of [123456, 7, 200000, 123].entries()) {
    const ours = calc.paymentQuote(sourceRow, receipts, amount, '2026-10-08', '2027-08-01');
    const their = src.paymentQuote('oct', (amount / 100).toFixed(2), '2026-10-08');
    for (const key of ['amount', 'principal', 'additionPaid', 'cancelled', 'remaining', 'total']) assert.equal(ours[key], their[key], key);
    receipts.push({ id: 'p' + i, rowId: 'oct', ...ours });
    src.pay({ id: 'p' + i, rowId: 'oct', amount: (amount / 100).toFixed(2), date: '2026-10-08', method: 'Pix', actor: 'Elyda' });
  }
  src.requestReversal({ id: 'reversal', receiptId: 'p0', amount: '555.55', actor: 'Elyda', why: 'Correção documentada' });
  const theirs = src.snapshot().requests.find(r => r.kind === 'reversal').reversal;
  assert.deepEqual(calc.reversalQuote(receipts[0], receipts, 55555), JSON.parse(JSON.stringify(theirs)));
});
