'use strict';
// node scripts/caixa-auth-local-bootstrap.cjs
// Requer status JSON privado externo e stack LOCAL identificada pelo runtime.
const fs = require('node:fs');
const path = require('node:path');
const { LocalSupabase, configFromEnvironment, MARKER } = require('../tests/fixtures/caixa-supabase-local-runtime.cjs');
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const quoted = value => '"' + String(value).replaceAll('"', '""') + '"';
function bootstrapSQL() {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/evidencias-caixa/2026-10-06-preflight-metadados.json'), 'utf8'));
  const auditSnapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/evidencias-caixa/2026-10-06-dependencias-auditoria.json'), 'utf8'));
  const lines = ["set edr.caixa_qa_local = " + literal(MARKER) + ';',
    fs.readFileSync(path.join(__dirname, '../tests/fixtures/caixa-supabase-local-bootstrap.sql'), 'utf8')];
  for (const helper of snapshot.schema.helpers) {
    if (!['auth_company_id', 'auth_user_role', 'get_my_company_id'].includes(helper.name) || helper.owner !== 'postgres')
      throw new Error('Helper inesperado no snapshot; revisar bootstrap.');
    lines.push(helper.definition.trimEnd().replace(/;$/, '') + ';');
  }
  // is_platform_admin() nao integra o Caixa. QA nao inclui platform admins.
  // Somente reproduz caminho false da policy companies_member; limite documentado.
  lines.push("create function public.is_platform_admin() returns boolean language sql stable as $$ select false $$;");
  for (const table of ['companies', 'company_users', 'contas_pagar', 'audit_logs']) {
    const relation = snapshot.privilegios.public_relations.find(item => item.name === table);
    if (!relation?.rls || relation.owner !== 'postgres') throw new Error('Relacao legado inesperada; revisar bootstrap.');
    lines.push('alter table public.' + quoted(table) + ' enable row level security;');
    const policies = table === 'audit_logs' ? auditSnapshot.data.audit_policies : snapshot.privilegios.related_policies.filter(item => item.tablename === table);
    for (const policy of policies) {
      if (!['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(policy.cmd) || policy.permissive !== 'PERMISSIVE')
        throw new Error('Policy legado inesperada; revisar bootstrap.');
      lines.push('create policy ' + quoted(policy.policyname) + ' on public.' + quoted(table) + ' as permissive for ' + policy.cmd +
        ' to ' + policy.roles.map(role => role === 'public' ? 'public' : quoted(role)).join(',') + (policy.qual ? ' using (' + policy.qual + ')' : '') +
        (policy.with_check ? ' with check (' + policy.with_check + ')' : '') + ';');
    }
    for (const role of ['anon', 'authenticated']) {
      const grants = ['select', 'insert', 'update', 'delete'].filter(action => relation[role + '_' + action]);
      lines.push('revoke all on public.' + quoted(table) + ' from ' + quoted(role) + ';');
      if (grants.length) lines.push('grant ' + grants.join(',') + ' on public.' + quoted(table) + ' to ' + quoted(role) + ';');
    }
  }
  const audit = snapshot.privilegios.audit_trigger_function;
  if (audit.name !== 'fn_audit_log' || audit.owner !== 'postgres' || !audit.definer)
    throw new Error('Trigger de auditoria inesperado; revisar bootstrap.');
  lines.push(audit.definition.trimEnd().replace(/;$/, '') + ';');
  for (const trigger of snapshot.schema.cp_triggers) {
    if (trigger.name !== 'audit_contas_pagar') throw new Error('Trigger inesperado no snapshot.');
    lines.push(trigger.definition + ';');
  }
  for (const table of ['obras', 'notas_fiscais', 'lancamentos', 'diarias_quinzenas', 'distribuicoes']) {
    lines.push('alter table public.' + quoted(table) + ' enable row level security;');
    lines.push('revoke all on public.' + quoted(table) + ' from public,anon,authenticated,service_role;');
  }
  lines.push('commit;', "notify pgrst, 'reload schema';");
  return lines.join('\n');
}
if (require.main === module) {
  let local;
  try {
    local = new LocalSupabase(configFromEnvironment());
    local.sql(bootstrapSQL());
    local.marker();
    process.stdout.write('PASS bootstrap Supabase LOCAL: dependencias sinteticas; Auth/roles oficiais preservados.\n');
  } catch (error) {
    process.stderr.write('FAIL bootstrap LOCAL: ' + (error.message.startsWith('SQL_LOCAL_') ? error.message : 'pre-requisito/fixture; segredo omitido.') + '\n');
    process.exitCode = 1;
  } finally { local?.dispose(); }
}
module.exports = { bootstrapSQL };
