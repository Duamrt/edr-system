-- Correção da RPC já aplicada: remove também distribuições que referenciam
-- lançamentos da NF sem carregar nota_id. Evita que a FK futura bloqueie um
-- estorno válido; a operação continua integralmente transacional.
create or replace function public.excluir_nota_fiscal(p_nota_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := public.auth_company_id();
  v_nota public.notas_fiscais%rowtype;
  v_distribuicoes integer := 0;
  v_lancamentos integer := 0;
begin
  if v_company is null then
    raise exception 'sessao sem empresa' using errcode = '28000';
  end if;
  if public.auth_user_role() <> 'admin' then
    raise exception 'apenas admin pode excluir nota fiscal' using errcode = '42501';
  end if;

  select * into v_nota
  from public.notas_fiscais
  where id = p_nota_id and company_id = v_company
  for update;

  if not found then
    raise exception 'nota fiscal nao encontrada' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.contas_pagar c
    where c.company_id = v_company
      and c.status in ('pago', 'pendente')
      and (
        c.nota_id = v_nota.id
        or (
          c.nota_id is null
          and upper(trim(coalesce(c.nota_ref, ''))) = upper(trim(v_nota.numero_nf))
          and upper(trim(coalesce(c.fornecedor, ''))) = upper(trim(coalesce(v_nota.fornecedor, '')))
        )
      )
  ) then
    raise exception 'exclusao bloqueada: resolva a conta financeira vinculada' using errcode = 'P0001';
  end if;

  delete from public.distribuicoes d
  where d.company_id = v_company
    and (
      d.nota_id = v_nota.id
      or d.lancamento_id in (
        select l.id
        from public.lancamentos l
        where l.company_id = v_company
          and (
            l.nota_id = v_nota.id
            or (
              l.nota_id is null
              and upper(coalesce(l.obs, '')) like
                'NF ' || upper(trim(v_nota.numero_nf)) || ' · ' || upper(trim(v_nota.fornecedor)) || '%'
            )
          )
      )
    );
  get diagnostics v_distribuicoes = row_count;

  delete from public.lancamentos
  where company_id = v_company
    and (
      nota_id = v_nota.id
      or (
        nota_id is null
        and upper(coalesce(obs, '')) like
          'NF ' || upper(trim(v_nota.numero_nf)) || ' · ' || upper(trim(v_nota.fornecedor)) || '%'
      )
    );
  get diagnostics v_lancamentos = row_count;

  delete from public.notas_fiscais
  where id = v_nota.id and company_id = v_company;

  return jsonb_build_object(
    'nota_id', p_nota_id,
    'distribuicoes_removidas', v_distribuicoes,
    'lancamentos_removidos', v_lancamentos
  );
end;
$$;

revoke all on function public.excluir_nota_fiscal(uuid) from public;
revoke all on function public.excluir_nota_fiscal(uuid) from anon;
grant execute on function public.excluir_nota_fiscal(uuid) to authenticated;
