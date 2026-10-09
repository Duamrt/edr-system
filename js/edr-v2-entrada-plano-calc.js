/* EDR — regras monetárias da prévia v6. Sem estado, autenticação ou persistência. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EntradaPlanoCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MAX_INPUT = 100000000;
  function cents(v, signed = false) {
    if (!Number.isSafeInteger(v) || (!signed && v < 0)) throw Error('Valor em centavos inválido.');
    return v;
  }
  function sum(values) {
    const total = values.reduce((n, v) => n + BigInt(cents(v, true)), 0n);
    const n = Number(total);
    if (!Number.isSafeInteger(n)) throw Error('O total excede o limite monetário.');
    return n;
  }
  function ratio(a, b, divisor) {
    cents(a); cents(b); cents(divisor);
    if (!divisor) throw Error('Divisor monetário inválido.');
    const num = BigInt(a) * BigInt(b), den = BigInt(divisor);
    const n = Number((num * 2n + den) / (den * 2n));
    return cents(n);
  }
  function moneyInput(value, allowZero = false) {
    const raw = String(value ?? '').trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw)) throw Error('Informe um valor sem milhar e com até 2 casas decimais.');
    const [a, b = ''] = raw.replace(',', '.').split('.');
    const n = Number(a) * 100 + Number(b.padEnd(2, '0'));
    if (!Number.isSafeInteger(n) || n < (allowZero ? 0 : 1) || n > MAX_INPUT) throw Error('O valor deve ser positivo e no máximo R$ 1.000.000,00.');
    return n;
  }
  function rateInput(value) {
    const n = moneyInput(value, true);
    if (n > 10000) throw Error('Use uma taxa entre 0% e 100%.');
    return n;
  }
  function validDate(value, optional = false) {
    if (optional && (value == null || value === '')) return '';
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Informe uma data completa válida.');
    const [y, m, d] = value.split('-').map(Number);
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    if (y < 1 || m < 1 || m > 12 || d < 1 || d > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) throw Error('Informe uma data completa válida.');
    return value;
  }
  function negotiated(row) {
    if (!row || !['waived', 'percent', 'final'].includes(row.mode)) throw Error('Escolha um único modo de negociação.');
    cents(row.base);
    if (row.mode === 'final') return cents(row.final);
    if (row.mode === 'waived') return row.base;
    cents(row.rate);
    if (row.rate > 10000) throw Error('Use uma taxa entre 0% e 100%.');
    return sum([row.base, ratio(row.base, row.rate, 10000)]);
  }
  function components(row, allReceipts = []) {
    if (!Array.isArray(allReceipts)) throw Error('Histórico de recebimentos inválido.');
    const agreed = negotiated(row), receipts = allReceipts.filter(r => r && r.rowId === row.id);
    receipts.forEach(r => {
      cents(r.amount, true); cents(r.principal ?? r.amount, true);
      cents(r.additionPaid ?? 0, true); cents(r.cancelled ?? 0, true);
      if ((r.principal ?? r.amount) + (r.additionPaid ?? 0) !== r.amount) throw Error('Recebimento sem conservação monetária.');
    });
    const principalDue = Math.min(row.base, agreed), additionDue = Math.max(0, agreed - row.base);
    const principalPaid = sum(receipts.map(r => r.principal ?? r.amount));
    const additionPaid = sum(receipts.map(r => r.additionPaid ?? 0));
    const cancelled = sum(receipts.map(r => r.cancelled ?? 0));
    const received = sum(receipts.map(r => r.amount));
    const principalRemaining = principalDue - principalPaid, additionRemaining = additionDue - additionPaid - cancelled;
    if ([principalPaid, additionPaid, cancelled, received, principalRemaining, additionRemaining].some(n => n < 0)) throw Error('A negociação conflita com o histórico recebido ou cancelado.');
    return { principalDue, additionDue, principalPaid, additionPaid, cancelled, principalRemaining, additionRemaining,
      received, total: agreed - cancelled, remaining: principalRemaining + additionRemaining };
  }
  function allocation(row, c) {
    const a = row.allocation || { principal: c.principalDue, addition: c.additionDue, principalPaidStart: 0, feeRelievedStart: 0 };
    ['principal', 'addition', 'principalPaidStart', 'feeRelievedStart'].forEach(k => cents(a[k]));
    return { ...a };
  }
  function paymentQuote(row, receipts, amountCent, date, delivery) {
    cents(amountCent);
    if (!amountCent) throw Error('Informe um recebimento positivo.');
    const day = validDate(date), deliveryDay = validDate(delivery, true), c = components(row, receipts);
    const beforeDelivery = !!deliveryDay && day < deliveryDay;
    const eligible = beforeDelivery && c.additionRemaining > 0 && c.principalRemaining > 0;
    const a = allocation(row, c);
    let principal, additionPaid = 0, cancelled = 0;
    if (eligible) {
      if (amountCent > c.principalRemaining) throw Error('Antes da entrega, informe apenas o principal antecipado. O acréscimo proporcional será cancelado, não recebido.');
      principal = amountCent;
      const paidInAllocation = c.principalPaid - a.principalPaidStart + principal;
      if (paidInAllocation < 0) throw Error('A alocação não corresponde ao histórico atual.');
      const target = ratio(a.addition, paidInAllocation, a.principal);
      cancelled = Math.min(c.additionRemaining, Math.max(0, target - (c.additionPaid + c.cancelled - a.feeRelievedStart)));
      if (principal === c.principalRemaining) cancelled = c.additionRemaining;
    } else {
      if (amountCent > c.remaining) throw Error('O valor supera o saldo aberto desta parcela.');
      principal = amountCent === c.remaining ? c.principalRemaining : Math.min(c.principalRemaining, ratio(amountCent, c.principalRemaining, c.remaining));
      additionPaid = amountCent - principal;
      if (additionPaid > c.additionRemaining) { additionPaid = c.additionRemaining; principal = amountCent - additionPaid; }
    }
    return { date: day, beforeDelivery, eligible, amount: amountCent, principal, additionPaid, cancelled,
      principalRemaining: c.principalRemaining - principal, additionRemaining: c.additionRemaining - additionPaid - cancelled,
      remaining: c.remaining - amountCent - cancelled, total: c.total - cancelled, delivery: deliveryDay,
      allocation: a, previousPrincipalPaid: c.principalPaid, previousAdditionRelieved: c.additionPaid + c.cancelled };
  }
  function reversalQuote(receipt, allReceipts, amountCent) {
    if (!receipt || !Array.isArray(allReceipts) || !Number.isSafeInteger(receipt.amount) || receipt.amount <= 0) throw Error('Recebimento não encontrado.');
    cents(amountCent);
    if (!amountCent) throw Error('Informe um estorno positivo.');
    const reversed = allReceipts.filter(r => r && r.reverses === receipt.id);
    if (reversed.some(r => !Number.isSafeInteger(r.amount) || r.amount >= 0)) throw Error('Histórico de estornos inválido.');
    const already = -sum(reversed.map(r => r.amount)), principalAlready = -sum(reversed.map(r => r.principal ?? r.amount));
    const cancelledAlready = -sum(reversed.map(r => r.cancelled ?? 0));
    if (amountCent > receipt.amount - already) throw Error('O estorno supera o valor ainda recebido.');
    const principal = ratio(receipt.principal ?? receipt.amount, already + amountCent, receipt.amount) - principalAlready;
    const cancelled = ratio(receipt.cancelled ?? 0, already + amountCent, receipt.amount) - cancelledAlready;
    return { amount: amountCent, principal, additionPaid: amountCent - principal, cancelled };
  }
  function summarize(rows, receipts = []) {
    if (!Array.isArray(rows)) throw Error('Plano inválido.');
    const ids = new Set();
    const normalized = rows.map(row => {
      if (!row || row.id == null || ids.has(row.id)) throw Error('Parcela sem identificador único.');
      ids.add(row.id);
      return { ...row, ...components(row, receipts) };
    });
    if (receipts.some(r => !r || !ids.has(r.rowId))) throw Error('Recebimento sem parcela no plano.');
    const totals = { original: sum(rows.map(r => r.base)), agreed: sum(normalized.map(r => r.total)),
      received: sum(normalized.map(r => r.received)), remaining: sum(normalized.map(r => r.remaining)),
      cancelled: sum(normalized.map(r => r.cancelled)) };
    totals.delta = totals.agreed - totals.original;
    return { rows: normalized, totals };
  }
  return Object.freeze({ moneyInput, rateInput, validDate, negotiated, components, paymentQuote, reversalQuote, summarize });
});
