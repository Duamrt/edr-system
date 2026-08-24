-- Exclusao atomica de uma saida do almoxarifado.
-- Remove primeiro a distribuicao (FK RESTRICT) e depois o custo vinculado.
-- Qualquer falha aborta a funcao inteira e preserva os dois registros.
create or replace function public.excluir_distribuicao_estoque(p_distribuicao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := public.auth_company_id();
  v_distribuicao public.distribuicoes%rowtype;
  v_lancamento_id uuid;
  v_distribuicoes integer := 0;
  v_lancamentos integer := 0;
begin
  if v_company is null then
    raise exception 'sessao sem empresa' using errcode = '28000';
  end if;
  if public.auth_user_role() <> 'admin' then
    raise exception 'apenas admin pode excluir movimentacao de estoque' using errcode = '42501';
  end if;

  select * into v_distribuicao
  from public.distribuicoes
  where id = p_distribuicao_id
    and company_id = v_company
  for update;

  if not found then
    raise exception 'movimentacao de estoque nao encontrada' using errcode = 'P0002';
  end if;

  v_lancamento_id := v_distribuicao.lancamento_id;

  if v_lancamento_id is not null and exists (
    select 1 from public.lancamentos l
    where l.id = v_lancamento_id and l.company_id <> v_company
  ) then
    raise exception 'custo vinculado pertence a outra empresa' using errcode = '42501';
  end if;

  delete from public.distribuicoes
  where id = v_distribuicao.id and company_id = v_company;
  get diagnostics v_distribuicoes = row_count;

  if v_distribuicoes <> 1 then
    raise exception 'movimentacao nao foi removida' using errcode = 'P0001';
  end if;

  if v_lancamento_id is not null then
    if exists (
      select 1 from public.distribuicoes d
      where d.lancamento_id = v_lancamento_id
    ) then
      raise exception 'custo vinculado a mais de uma movimentacao' using errcode = 'P0001';
    end if;

    delete from public.lancamentos
    where id = v_lancamento_id and company_id = v_company;
    get diagnostics v_lancamentos = row_count;
  end if;

  return jsonb_build_object(
    'distribuicao_id', p_distribuicao_id,
    'lancamento_id', v_lancamento_id,
    'distribuicoes_removidas', v_distribuicoes,
    'lancamentos_removidos', v_lancamentos
  );
end;
$$;

revoke all on function public.excluir_distribuicao_estoque(uuid) from public;
revoke all on function public.excluir_distribuicao_estoque(uuid) from anon;
grant execute on function public.excluir_distribuicao_estoque(uuid) to authenticated;
