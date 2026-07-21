-- ============================================================================
-- MIGRATION B1 (LEITURA) — fecha o vazamento de valor para o MESTRE nas DUAS
-- fontes cruas: diarias_funcionarios.diaria E diarias.valor/diaria_base.
-- Mestre passa a ler SOMENTE via RPC segura (diarias_funcionarios_publico,
-- diarias_do_dia). Admin preserva SELECT bruto (Registros/Folha continuam).
--
-- PRE-REQUISITO: front que trava o mestre em "Apontamento do dia" JA publicado
-- e testado (mestre nao abre Registros/Folha/Equipe). Sem isso, o mestre clica
-- em telas que ficariam vazias.
--
-- Provado em BEGIN..ROLLBACK (JWT mestre 07a4d2ac...): 
--   diarias_do_dia sem valor (8 linhas) OK; funcionarios crus=0; diarias cruas=0;
--   RPC publico=8. Admin preservado: funcionarios=9, diarias=8, com taxa e valor.
--
-- B2 (revogacao de INSERT/UPDATE/DELETE) fica SEPARADA — 5 fluxos admin ainda
-- gravam direto em diarias (diarConfirmarLancamento/SalvarEdicao/ConfirmarAdd/
-- ExcluirRegistro/DeletarDia). Migrar para RPC antes de revogar escrita.
-- ============================================================================
begin;

-- B1.a — diarias_funcionarios: SELECT bruto so admin (mestre le via _publico)
drop policy if exists df_select on diarias_funcionarios;
create policy df_select_admin_only on diarias_funcionarios
  for select
  using (company_id = auth_company_id() and auth_user_role() = 'admin');

-- B1.b — diarias: SELECT bruto so admin (mestre le via diarias_do_dia)
--   remove qualquer policy de SELECT aberta existente e cria a admin-only
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname='public' and tablename='diarias' and cmd='SELECT'
  loop
    execute format('drop policy if exists %I on diarias', pol.policyname);
  end loop;
end $$;
create policy diarias_select_admin_only on diarias
  for select
  using (company_id = auth_company_id() and auth_user_role() = 'admin');

commit;
