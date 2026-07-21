-- ============================================================================
-- ⚠️ DRAFT NAO APLICADO — NAO REPRESENTA O ESTADO DO BANCO.
-- Este era o rascunho original da "Migration B" (lockdown de leitura + revoke de
-- escrita num passo so). Foi SUPERADO e dividido:
--   - LEITURA admin-only  -> APLICADA como diarias-migration-b1-read-lockdown.sql
--   - ESCRITA admin-only  -> APLICADA como diarias-migration-b2a-escrita-admin-only.sql
--   - REVOKE de grants     -> PENDENTE (B2b real), so apos migrar os 5 fluxos admin
--                             diretos (diarConfirmarLancamento/SalvarEdicao/ConfirmarAdd/
--                             ExcluirRegistro/DeletarDia) para RPC.
-- Mantido no repo apenas como referencia historica do plano original. NAO EXECUTAR:
-- o `revoke ... from authenticated` abaixo QUEBRARIA os 5 fluxos admin legados hoje.
-- ============================================================================
-- ============================================================================
-- MIGRATION B (LOCKDOWN) — fecha o acesso bruto que vaza `diaria` e o POST forjado.
-- APLICAR POR ULTIMO: so depois do front novo publicado E testado (mestre+admin).
-- Aplicar B antes do front novo QUEBRA o mestre. Irreversivel-na-pratica em producao.
-- ============================================================================

-- ============================================================================
-- MIGRATION B — LOCKDOWN (migration ATÔMICA SEPARADA — aplicar por ÚLTIMO)
-- Fecha o acesso bruto que hoje vaza `diaria` e permite POST forjado. Aplicar
-- SOMENTE quando o front novo (lendo via RPC) já estiver em produção e testado,
-- senão o mestre perde a tela na hora. É irreversível-na-prática em produção.
-- ============================================================================
begin;
--
-- B.1 mestre perde o SELECT direto na tabela bruta; só admin lê a tabela crua
--     (com a coluna `diaria`). Mestre passa a ler nomes só via diarias_funcionarios_publico().
drop policy if exists df_select on diarias_funcionarios;
create policy df_select_admin_only on diarias_funcionarios
  for select
  using (company_id = auth_company_id() and auth_user_role() = 'admin');
--
-- B.2 fechar a ESCRITA direta em `diarias`: só a RPC (SECURITY DEFINER) grava.
--     Manter SELECT para as telas de leitura. Aplicar só quando admin TAMBÉM usar a RPC.
revoke insert, update, delete on diarias from authenticated;
--
commit;
-- ============================================================================


