const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const custos = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-custos.js'), 'utf8');
const sql = fs.readFileSync(path.join(raiz, 'sql', 'custos-repasses-cef-rpc-migration.sql'), 'utf8');

test('front salva repasse pela RPC e mantem fallback enquanto a migration nao existe', () => {
  assert.match(custos, /sbRpc\(['"]salvar_repasse_cef['"], params\)/);
  assert.match(custos, /respostaRpc !== ['"]RPC_AUSENTE['"]/);
  assert.match(custos, /sbPost\(['"]repasses_cef['"], body\)/);
  assert.match(custos, /sbPatch\(['"]repasses_cef['"], `\?id=eq\.\$\{editId\}`, body\)/);
});

test('RPC deriva tenant e papel da sessao e valida a obra', () => {
  assert.match(sql, /v_company uuid := public\.auth_company_id\(\)/i);
  assert.match(sql, /v_role text := public\.auth_user_role\(\)/i);
  assert.match(sql, /v_role not in \(['"]admin['"], ['"]operacional['"]\)/i);
  assert.match(sql, /o\.id = p_obra_id and o\.company_id = v_company/i);
  assert.match(sql, /company_id[\s\S]*v_company/i);
});

test('RPC valida campos financeiros e nao libera anonimo', () => {
  assert.match(sql, /p_valor is null or p_valor <= 0/i);
  assert.match(sql, /p_tipo not in \(['"]pls['"], ['"]entrada['"], ['"]terreno['"]\)/i);
  assert.match(sql, /p_tipo = ['"]pls['"] and coalesce\(p_medicao_numero, 0\) < 1/i);
  assert.match(sql, /revoke all on function public\.salvar_repasse_cef[\s\S]*from anon/i);
  assert.match(sql, /begin;[\s\S]*commit;/i);
});
