-- ============================================================================
-- CUSTOS — grava repasse CEF no servidor com tenant e papel derivados da sessao.
--
-- Incidente 2026-08-28: POST direto em repasses_cef recebeu 403/RLS repetidamente.
-- A RPC elimina a dependencia do company_id montado no navegador e mantem as
-- mesmas permissoes de escrita: somente admin e operacional da propria empresa.
-- Aplicada em producao (mepzoxoahpwcvvlymlfh) em 2026-08-28 como
-- `custos_salvar_repasse_cef_rpc`.
-- ============================================================================
begin;

create or replace function public.salvar_repasse_cef(
  p_obra_id uuid,
  p_medicao_numero integer,
  p_valor numeric,
  p_data_credito date,
  p_observacao text default '',
  p_tipo text default 'pls',
  p_repasse_id uuid default null
)
returns setof public.repasses_cef
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_company uuid := public.auth_company_id();
  v_role text := public.auth_user_role();
  v_criado_por text;
  v_repasse public.repasses_cef%rowtype;
begin
  if v_company is null then
    raise exception 'sessao sem empresa' using errcode = '28000';
  end if;
  if v_role not in ('admin', 'operacional') then
    raise exception 'perfil sem permissao para salvar repasse' using errcode = '42501';
  end if;
  if p_tipo not in ('pls', 'entrada', 'terreno') then
    raise exception 'tipo de repasse invalido' using errcode = '22023';
  end if;
  if p_tipo = 'pls' and coalesce(p_medicao_numero, 0) < 1 then
    raise exception 'numero da medicao obrigatorio' using errcode = '22023';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'valor do repasse deve ser positivo' using errcode = '22023';
  end if;
  if p_data_credito is null then
    raise exception 'data do credito obrigatoria' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.obras o
    where o.id = p_obra_id and o.company_id = v_company
  ) then
    raise exception 'obra nao pertence a empresa autenticada' using errcode = '42501';
  end if;

  select coalesce(nullif(cu.nome, ''), nullif(cu.email, ''), '')
    into v_criado_por
  from public.company_users cu
  where cu.user_id = auth.uid() and cu.company_id = v_company
  limit 1;

  if p_repasse_id is null then
    insert into public.repasses_cef (
      obra_id, medicao_numero, valor, data_credito, observacao, tipo,
      criado_por, company_id
    ) values (
      p_obra_id,
      case when p_tipo = 'pls' then p_medicao_numero else 0 end,
      p_valor,
      p_data_credito,
      coalesce(p_observacao, ''),
      p_tipo,
      coalesce(v_criado_por, ''),
      v_company
    )
    returning * into v_repasse;
  else
    update public.repasses_cef r
       set obra_id = p_obra_id,
           medicao_numero = case when p_tipo = 'pls' then p_medicao_numero else 0 end,
           valor = p_valor,
           data_credito = p_data_credito,
           observacao = coalesce(p_observacao, ''),
           tipo = p_tipo
     where r.id = p_repasse_id
       and r.company_id = v_company
    returning * into v_repasse;

    if not found then
      raise exception 'repasse nao encontrado na empresa autenticada' using errcode = 'P0002';
    end if;
  end if;

  return next v_repasse;
end;
$$;

revoke all on function public.salvar_repasse_cef(uuid, integer, numeric, date, text, text, uuid) from public;
revoke all on function public.salvar_repasse_cef(uuid, integer, numeric, date, text, text, uuid) from anon;
grant execute on function public.salvar_repasse_cef(uuid, integer, numeric, date, text, text, uuid) to authenticated;

commit;
