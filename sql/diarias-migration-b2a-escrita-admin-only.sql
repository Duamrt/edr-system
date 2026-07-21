-- ============================================================================
-- MIGRATION B2a (P0 SEGURANCA) — escrita DIRETA em diarias so admin.
-- JA APLICADA no banco EDR (mepzoxoahpwcvvlymlfh) em 2026-07-21 via apply_migration
-- 'diarias_b2a_escrita_direta_admin_only'. Este arquivo versiona a definicao EXATA
-- (conferida contra pg_policies). NAO reaplicar.
--
-- PROBLEMA QUE FECHA (P0): a policy antiga diar_insert permitia
-- auth_user_role() IN ('admin','mestre','operacional') em escrita direta. PROVADO
-- 2026-07-21 que o mestre fazia POST /rest/v1/diarias com valor:99999 e gravava
-- (contraprova REST real: HTTP 403 apos B2a). Agora INSERT/UPDATE/DELETE diretos
-- exigem auth_user_role()='admin'.
--
-- NAO revoga grants de authenticated (isso e a B2b, apos migrar os 5 fluxos admin
-- diretos para RPC): diarConfirmarLancamento, diarSalvarEdicao, diarConfirmarAdd,
-- diarExcluirRegistro, diarDeletarDia. Preserva as telas administrativas do admin.
--
-- A RPC diarias_apontar (SECURITY DEFINER, owner postgres) grava independente destas
-- policies -> o fluxo oficial do mestre continua funcionando.
--
-- Provado em BEGIN..ROLLBACK e pos-aplicacao:
--   mestre  INSERT=42501, UPDATE=0, DELETE=0, POST REST=403; RPC ok=true.
--   operacional INSERT=42501, UPDATE=0, DELETE=0.
--   admin   INSERT=1 (passa).
-- ============================================================================

drop policy if exists diar_insert on diarias;
create policy diar_insert on diarias
  for insert
  with check (company_id = auth_company_id() and auth_user_role() = 'admin');

drop policy if exists diar_update on diarias;
create policy diar_update on diarias
  for update
  using (company_id = auth_company_id() and auth_user_role() = 'admin')
  with check (company_id = auth_company_id() and auth_user_role() = 'admin');

drop policy if exists diar_delete on diarias;
create policy diar_delete on diarias
  for delete
  using (company_id = auth_company_id() and auth_user_role() = 'admin');
