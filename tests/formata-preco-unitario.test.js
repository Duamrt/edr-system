const assert = require('node:assert/strict');

// O modulo registra apenas um listener no carregamento; o stub evita exigir DOM.
global.document = { addEventListener() {} };
const { formatarPrecoUnitarioNota } = require('../js/edr-v2-notas.js');

assert.equal(formatarPrecoUnitarioNota(0.9990000000000001), 'R$ 0,999');
assert.equal(formatarPrecoUnitarioNota(5.5), 'R$ 5,50');
assert.equal(formatarPrecoUnitarioNota(31.5), 'R$ 31,50');

console.log('formata-preco-unitario: 3 assertions passed');
