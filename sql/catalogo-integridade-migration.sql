-- Catálogo: proteção de histórico e isolamento entre empresas.
-- Aplicar somente após revisão e autorização para produção.

begin;

-- O nome pode se repetir entre empresas; dentro da mesma empresa permanece único.
create unique index if not exists materiais_company_nome_unique
  on public.materiais (company_id, lower(nome));

drop index if exists public.materiais_nome_idx;

create or replace function public.proteger_material_com_historico()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tem_historico boolean;
begin
  -- Código é a ligação com lançamentos históricos. Mudar a regra de estoque
  -- de um item já usado também pode esconder saldos existentes.
  if tg_op = 'DELETE'
     or (tg_op = 'UPDATE'
         and (
           new.codigo is distinct from old.codigo
           or (old.movimenta_estoque is distinct from false and new.movimenta_estoque = false)
         )) then
    select exists (
      select 1
      from public.distribuicoes d
      where d.company_id = old.company_id
        and (
          upper(trim(coalesce(d.codigo_catalogo, ''))) = upper(trim(old.codigo))
          or (
            nullif(trim(d.codigo_catalogo), '') is null
            and lower(regexp_replace(trim(coalesce(d.item_desc, '')), '\\s+', ' ', 'g'))
                = lower(regexp_replace(trim(old.nome), '\\s+', ' ', 'g'))
          )
        )
    ) or exists (
      select 1
      from public.entradas_diretas e
      where e.company_id = old.company_id
        and (
          upper(trim(coalesce(e.codigo_catalogo, ''))) = upper(trim(old.codigo))
          or (
            nullif(trim(e.codigo_catalogo), '') is null
            and lower(regexp_replace(trim(coalesce(e.item_desc, '')), '\\s+', ' ', 'g'))
                = lower(regexp_replace(trim(old.nome), '\\s+', ' ', 'g'))
          )
        )
    ) or exists (
      select 1
      from public.ajustes_estoque a
      where a.company_id = old.company_id
        and (
          upper(trim(coalesce(a.codigo_catalogo, ''))) = upper(trim(old.codigo))
          or (
            nullif(trim(a.codigo_catalogo), '') is null
            and lower(regexp_replace(trim(coalesce(a.item_desc, '')), '\\s+', ' ', 'g'))
                = lower(regexp_replace(trim(old.nome), '\\s+', ' ', 'g'))
          )
        )
    ) or exists (
      select 1
      from public.material_depara md
      where md.company_id = old.company_id
        and upper(trim(md.codigo_catalogo)) = upper(trim(old.codigo))
    ) or exists (
      select 1
      from public.material_conversao mc
      where mc.company_id = old.company_id
        and mc.material_id = old.id
    ) or exists (
      select 1
      from public.notas_fiscais nf
      cross join lateral jsonb_array_elements(nf.itens::jsonb) item
      where nf.company_id = old.company_id
        and (
          item ->> 'material_id' = old.id::text
          or upper(trim(coalesce(item ->> 'codigo_catalogo', item ->> 'codigo', item ->> 'cod', ''))) = upper(trim(old.codigo))
          or (
            nullif(trim(coalesce(item ->> 'codigo_catalogo', item ->> 'codigo', item ->> 'cod', '')), '') is null
            and lower(regexp_replace(trim(coalesce(item ->> 'desc', item ->> 'descricao', '')), '\\s+', ' ', 'g'))
                = lower(regexp_replace(trim(old.nome), '\\s+', ' ', 'g'))
          )
        )
    ) into v_tem_historico;

    if v_tem_historico then
      raise exception 'Material % possui histórico e não pode ser excluído, ter o código alterado ou deixar de movimentar estoque.', old.codigo
        using errcode = '23503';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_material_com_historico on public.materiais;
create trigger trg_proteger_material_com_historico
before delete or update of codigo, movimenta_estoque on public.materiais
for each row execute function public.proteger_material_com_historico();

commit;
