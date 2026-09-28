-- APLICADO NO BANCO EDR SYSTEM EM 2026-09-28.
-- Migration: xml_bloquear_rolo_1x_20260928.
-- Protege a autoridade do banco contra clientes antigos e outras rotas de escrita.
-- RL -> M/M²/M³ com fator 1 exige revisao: um rolo nao pode ser apenas
-- renomeado para uma unidade de medida. Regras validas (ex.: RL -> M, 100)
-- e equivalencias 1:1 entre outras unidades permanecem aceitas.

create or replace function public.trg_material_conversao_bloquear_rolo_1x()
returns trigger language plpgsql as $$
begin
  if public.fn_unidade_normalizada(new.unidade_origem) = 'RL'
     and public.fn_unidade_normalizada(new.unidade_destino) in ('M', 'M²', 'M³')
     and new.fator = 1 then
    raise exception 'Fator 1 para RL e unidade de medida nao e permitido; informe o conteudo do rolo ou use material em RL'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists material_conversao_bloquear_rolo_1x on public.material_conversao;
create trigger material_conversao_bloquear_rolo_1x
before insert or update of unidade_origem, unidade_destino, fator
on public.material_conversao
for each row execute function public.trg_material_conversao_bloquear_rolo_1x();

create or replace function public.trg_nota_bloquear_rolo_1x()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
declare
  v_item jsonb;
  v_material_id uuid;
  v_unidade_estoque text;
begin
  if new.itens is null or new.data_efetiva_estoque is null then return new; end if;
  for v_item in select value from jsonb_array_elements(new.itens::jsonb)
  loop
    if coalesce(v_item ->> 'descricao_fiscal', '') = ''
       or public.fn_unidade_normalizada(v_item ->> 'unidade_fiscal') <> 'RL' then
      continue;
    end if;
    v_material_id := nullif(v_item ->> 'material_id', '')::uuid;
    if v_material_id is null then continue; end if;
    select public.fn_unidade_normalizada(m.unidade) into v_unidade_estoque
    from public.materiais m
    where m.id = v_material_id and m.company_id = new.company_id;
    if v_unidade_estoque in ('M', 'M²', 'M³') and exists (
      select 1 from public.material_conversao r
      where r.company_id = new.company_id and r.material_id = v_material_id
        and public.fn_unidade_normalizada(r.unidade_origem) = 'RL'
        and public.fn_unidade_normalizada(r.unidade_destino) = v_unidade_estoque
        and r.fator = 1
        and new.data_efetiva_estoque >= r.vigente_de
        and (r.vigente_ate is null or new.data_efetiva_estoque < r.vigente_ate)
    ) then
      raise exception 'Item XML em RL vinculado a material em % com fator 1; corrija unidade ou fator antes de salvar', v_unidade_estoque
        using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists notas_fiscais_bloquear_rolo_1x on public.notas_fiscais;
create trigger notas_fiscais_bloquear_rolo_1x
before insert or update of itens, data_efetiva_estoque
on public.notas_fiscais
for each row execute function public.trg_nota_bloquear_rolo_1x();
