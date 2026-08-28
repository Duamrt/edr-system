const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const migration = fs.readFileSync(
  path.join(raiz, 'sql', 'diarias-migration-d-admin-pix-pdf.sql'),
  'utf8'
);
const diarias = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-diarias.js'), 'utf8');
const rpcPublica = fs.readFileSync(path.join(raiz, 'sql', 'diarias-migration-a.sql'), 'utf8');

test('roster do admin entrega os dados que o PDF usa para pagamento', () => {
  assert.match(migration, /returns table\s*\([\s\S]*nome_completo text[\s\S]*chave_pix text/i);
  assert.match(migration, /select[\s\S]*f\.nome_completo[\s\S]*f\.chave_pix/i);
  assert.match(diarias, /const pix = \(cad\?\.chave_pix \|\| ['"]—['"]\)/);
  assert.match(diarias, /doc\.text\(['"]CHAVE PIX['"]/);
});

test('PIX continua restrito ao admin e ao tenant autenticado', () => {
  assert.match(migration, /public\.auth_user_role\(\) <> ['"]admin['"]/i);
  assert.match(migration, /f\.company_id = v_company/i);
  assert.match(migration, /revoke all on function public\.diarias_funcionarios_admin\(\) from public/i);
  assert.match(migration, /revoke all on function public\.diarias_funcionarios_admin\(\) from anon/i);

  const blocoPublico = rpcPublica.match(
    /create or replace function diarias_funcionarios_publico\(\)[\s\S]*?grant execute on function diarias_funcionarios_publico\(\) to authenticated;/i
  );
  assert.ok(blocoPublico, 'definicao da RPC publica deve existir');
  assert.doesNotMatch(blocoPublico[0], /chave_pix|nome_completo|diaria numeric/i);
});

test('migration e atomica e restaura apenas o grant autenticado', () => {
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.match(migration, /drop function if exists public\.diarias_funcionarios_admin\(\)/i);
  assert.match(migration, /grant execute on function public\.diarias_funcionarios_admin\(\) to authenticated/i);
});
