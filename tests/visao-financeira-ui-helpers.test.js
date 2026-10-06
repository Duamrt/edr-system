'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../js/edr-v2-visao-financeira-ui.js');

test('dinheiro desconhecido e zero confirmado continuam distintos', () => {
  assert.equal(ui.helpers.money(null), 'Indisponível');
  assert.equal(ui.helpers.money(NaN), 'Indisponível');
  assert.match(ui.helpers.money(0), /0,00/);
  assert.match(ui.helpers.money(-123), /1,23/);
});
test('formatacao preserva cada centavo ate o limite inteiro seguro', () => {
  assert.equal(ui.helpers.money(Number.MAX_SAFE_INTEGER), 'R$\u00a090.071.992.547.409,91');
  assert.equal(ui.helpers.money(Number.MIN_SAFE_INTEGER), '-R$\u00a090.071.992.547.409,91');
  assert.equal(ui.helpers.money(1), 'R$\u00a00,01');
  assert.equal(ui.helpers.money(-1), '-R$\u00a00,01');
  assert.equal(ui.helpers.money(100000), 'R$\u00a01.000,00');
  assert.equal(ui.helpers.money(Number.MAX_SAFE_INTEGER + 1), 'Indisponível');
});
test('origens e IDs sao escapados em atributos e texto', () => {
  const html = ui.helpers.nButton('" onclick="alert(1)', 100, '<img src=x>');
  assert.ok(!html.includes('onclick="alert'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&quot;/);
  assert.match(ui.helpers.metric('<script>', 1, '&payload', 'cost', 'cost'), /&lt;script&gt;/);
});
test('resultados negativos e indisponiveis ganham sinalizacao propria', () => {
  assert.match(ui.helpers.metric('Resultado', -1, '', 'result', 'result'), /class="metric [^"]*negative/);
  assert.match(ui.helpers.metric('Resultado', null, '', 'result', 'result'), /unavailable/);
  assert.doesNotMatch(ui.helpers.metric('Resultado', 0, '', 'result', 'result'), /negative|unavailable/);
});
test('barras nao fabricam quantidade quando valor nao esta confirmado', () => {
  assert.match(ui.helpers.bar('Custo', null, 100, 'cost'), /width:0%/);
  assert.match(ui.helpers.bar('Custo', null, 100, 'cost'), /Indisponível/);
  assert.match(ui.helpers.bar('Custo', -10, 100, 'cost'), /width:0%/);
  assert.match(ui.helpers.bar('Custo', 200, 100, 'cost'), /width:100%/);
});
