-- ============================================================================
-- MIGRATION C (ADITIVA) — Roster do admin COM `diaria` (previa financeira).
-- JA APLICADA no banco EDR (mepzoxoahpwcvvlymlfh) em 2026-07-20 via apply_migration
-- 'diarias_funcionarios_admin_roster_com_diaria'. Este arquivo versiona a definicao
-- EXATA para banco e repo compartilharem a mesma fonte de verdade. NAO reaplicar.
--
-- Contexto: a RPC diarias_funcionarios_publico() (Migration A) omite `diaria` para
-- proteger o mestre. Isso cegou tambem o admin, que precisa da taxa para a PREVIA
-- do resumo/linhas. Solucao: leitura server-side por perfil.
--   - mestre/operacional/qualquer nao-admin: usam a _publico (sem diaria).
--   - admin: usa esta _admin (com diaria). Negacao de nao-admin no SERVIDOR.
-- A RPC de ESCRITA (diarias_apontar) permanece SEM campos financeiros no payload.
--
-- Autorizacao (allowlist explicita, provada empiricamente 2026-07-20):
--   admin -> EXECUTA; mestre -> NEGADO; operacional -> NEGADO.
-- ============================================================================
create or replace function diarias_funcionarios_admin()
returns table (id uuid, nome text, cargo text, apelidos text[], ativo boolean, diaria numeric)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare v_company uuid := public.auth_company_id();
begin
  if v_company is null then
    raise exception 'sem company' using errcode = '28000';
  end if;
  -- APENAS admin recebe a taxa. Mestre e negado no SERVIDOR (nao confia no cliente).
  if public.auth_user_role() <> 'admin' then
    raise exception 'apenas admin pode ler valores de diaria' using errcode = '42501';
  end if;
  return query
    select f.id, f.nome, f.cargo, f.apelidos, f.ativo, f.diaria
    from public.diarias_funcionarios f
    where f.company_id = v_company and f.ativo = true
    order by f.nome asc;
end;
$$;

revoke all on function diarias_funcionarios_admin() from public;
revoke all on function diarias_funcionarios_admin() from anon;
grant execute on function diarias_funcionarios_admin() to authenticated;
