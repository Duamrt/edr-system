-- ============================================================================
-- MIGRATION D — completa o roster do admin usado pelo PDF das diarias.
--
-- Causa: a RPC diarias_funcionarios_admin() foi criada antes das colunas de
-- pagamento e continuou devolvendo somente ate `diaria`. O front usa essa RPC
-- como fonte de funcionariosRaw; assim, o PDF recebia `chave_pix` ausente e
-- imprimia "—", embora a chave estivesse cadastrada na tabela.
--
-- A RPC publica do mestre permanece inalterada e nao expoe diaria nem PIX.
-- Aplicada em producao (mepzoxoahpwcvvlymlfh) em 2026-08-28 como
-- `diarias_admin_pix_pdf`; validada com 7/7 funcionarios ativos retornando PIX.
-- ============================================================================
begin;

-- PostgreSQL nao permite mudar o tipo de retorno com CREATE OR REPLACE.
drop function if exists public.diarias_funcionarios_admin();

create function public.diarias_funcionarios_admin()
returns table (
  id uuid,
  nome text,
  cargo text,
  apelidos text[],
  ativo boolean,
  diaria numeric,
  nome_completo text,
  chave_pix text,
  admissao date,
  admissao_manual boolean
)
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

  if public.auth_user_role() <> 'admin' then
    raise exception 'apenas admin pode ler valores de diaria' using errcode = '42501';
  end if;

  return query
    select
      f.id,
      f.nome,
      f.cargo,
      f.apelidos,
      f.ativo,
      f.diaria,
      f.nome_completo,
      f.chave_pix,
      f.admissao,
      f.admissao_manual
    from public.diarias_funcionarios f
    where f.company_id = v_company
      and f.ativo = true
    order by f.nome asc;
end;
$$;

revoke all on function public.diarias_funcionarios_admin() from public;
revoke all on function public.diarias_funcionarios_admin() from anon;
grant execute on function public.diarias_funcionarios_admin() to authenticated;

commit;
