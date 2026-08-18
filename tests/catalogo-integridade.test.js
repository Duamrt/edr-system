const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'sql', 'catalogo-integridade-migration.sql'),
  'utf8'
);

assert.match(migration, /materiais_company_nome_unique/i);
assert.match(migration, /\(company_id, lower\(nome\)\)/i);
assert.match(migration, /drop index if exists public\.materiais_nome_idx/i);
assert.match(migration, /public\.distribuicoes/i);
assert.match(migration, /public\.entradas_diretas/i);
assert.match(migration, /public\.ajustes_estoque/i);
assert.match(migration, /public\.material_depara/i);
assert.match(migration, /public\.material_conversao/i);
assert.match(migration, /public\.notas_fiscais/i);
assert.match(migration, /jsonb_array_elements\(nf\.itens::jsonb\)/i);
assert.match(migration, /before delete or update of codigo, movimenta_estoque/i);
assert.match(migration, /errcode = '23503'/i);
assert.match(migration, /begin;[\s\S]*commit;/i);

console.log('catalogo-integridade: 12 verificações estruturais aprovadas');
