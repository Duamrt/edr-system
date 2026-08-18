const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'sql', 'catalogo-padronizacao-2026-08-18.sql'),
  'utf8'
);

assert.match(migration, /company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'/);
assert.match(migration, /set unidade = 'UN'/);
assert.match(migration, /set unidade = 'KG'/);
assert.match(migration, /set unidade = 'M2'/);
assert.match(migration, /000524.*000525.*000526.*000527/s);
assert.match(migration, /000441.*000446.*000447.*000448.*000449.*000450.*000606/s);
assert.match(migration, /set nome = 'CAFE 250G'/);
assert.match(migration, /set nome = 'RALO SIFONADO 100X50'/);
assert.doesNotMatch(migration, /delete\s+from/i);
assert.doesNotMatch(migration, /set\s+codigo\s*=/i);
assert.match(migration, /begin;[\s\S]*commit;/i);

console.log('catalogo-padronizacao: 11 verificações estruturais aprovadas');
