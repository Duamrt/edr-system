const assert = require('node:assert/strict');
const fs = require('node:fs');

const obras = fs.readFileSync(require.resolve('../js/edr-v2-obras.js'), 'utf8');
const sql = fs.readFileSync(require.resolve('../sql/estoque-exclusao-distribuicao-rpc-migration.sql'), 'utf8');

const inicio = obras.indexOf('async function excluirDistribuicao(id)');
const fim = obras.indexOf('// ── CRUD: NOVA / EDITAR OBRA', inicio);
assert.ok(inicio >= 0 && fim > inicio, 'funcao de exclusao deve existir');
const funcao = obras.slice(inicio, fim);

assert.match(funcao, /sbRpc\('excluir_distribuicao_estoque', \{ p_distribuicao_id: id \}\)/);
assert.doesNotMatch(funcao, /sbDelete\('lancamentos'/);
assert.doesNotMatch(funcao, /sbDelete\('distribuicoes'/);
assert.match(funcao, /await loadLancamentos\(\)/);
assert.match(funcao, /await loadDistribuicoes\(\)/);

assert.match(sql, /create or replace function public\.excluir_distribuicao_estoque\(p_distribuicao_id uuid\)/i);
assert.match(sql, /security definer/i);
assert.match(sql, /v_company uuid := public\.auth_company_id\(\)/i);
assert.match(sql, /public\.auth_user_role\(\) <> 'admin'/i);
assert.match(sql, /for update/i);

const deleteDistribuicao = sql.search(/delete from public\.distribuicoes/i);
const deleteLancamento = sql.search(/delete from public\.lancamentos/i);
assert.ok(deleteDistribuicao >= 0 && deleteLancamento > deleteDistribuicao,
  'a distribuicao deve ser removida antes do lancamento protegido por FK');

assert.match(sql, /revoke all on function public\.excluir_distribuicao_estoque\(uuid\) from public/i);
assert.match(sql, /revoke all on function public\.excluir_distribuicao_estoque\(uuid\) from anon/i);
assert.match(sql, /grant execute on function public\.excluir_distribuicao_estoque\(uuid\) to authenticated/i);

console.log('estoque-exclusao-atomica: 14 verificacoes aprovadas');
