-- Integridade de NF, estoque e financeiro.
-- Aplicar somente via Supabase migration, depois de validar em transação.
-- Não altera NF, distribuição ou lançamento histórico.

-- Impede novas distribuições apontando para custo inexistente. NOT VALID mantém
-- quatro registros históricos órfãos fora desta migration para reconciliação
-- humana, mas valida toda escrita nova a partir de agora.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'distribuicoes_lancamento_id_fkey'
      and conrelid = 'public.distribuicoes'::regclass
  ) then
    alter table public.distribuicoes
      add constraint distribuicoes_lancamento_id_fkey
      foreign key (lancamento_id)
      references public.lancamentos(id)
      on delete restrict
      not valid;
  end if;
end;
$$;

-- Liga contas históricas apenas quando há exatamente uma NF com mesmo tenant,
-- número e fornecedor. O caso sem correspondência fica intocado para revisão.
with candidatos as (
  select c.id as conta_id, min(n.id::text)::uuid as nota_id
  from public.contas_pagar c
  join public.notas_fiscais n
    on n.company_id = c.company_id
   and upper(trim(n.numero_nf)) = upper(trim(c.nota_ref))
   and upper(trim(coalesce(n.fornecedor, ''))) = upper(trim(coalesce(c.fornecedor, '')))
  where c.nota_id is null
    and nullif(trim(c.nota_ref), '') is not null
  group by c.id
  having count(n.id) = 1
)
update public.contas_pagar c
set nota_id = candidatos.nota_id
from candidatos
where c.id = candidatos.conta_id;

-- Exclusão atômica: distribuições, lançamentos e NF são estornados na mesma
-- transação. Contas vinculadas pagas ou pendentes bloqueiam a exclusão. A função
-- nunca confia em tenant ou papel do cliente e mantém o fallback de texto apenas
-- para lançamentos legados.
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

  -- A ordem preserva o FK distribuicoes.lancamento_id para todas as novas linhas.
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
