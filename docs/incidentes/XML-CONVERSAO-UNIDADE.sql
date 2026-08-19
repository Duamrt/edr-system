-- EDR System — conversao de unidade fiscal para estoque
-- STATUS: APLICADA EM PRODUCAO EM 2026-08-13.
-- Regra inicial aplicada: TELHA CERAMICA QUADRADA, MI -> PC, fator 1000,
-- vigente a partir de 2026-08-13. Nenhuma NF historica foi alterada.
--
-- Pre-requisito: notas_fiscais.data_efetiva_estoque ja deve existir.
-- Itens continuam em text contendo JSON nesta etapa de transicao. O trigger abaixo e a
-- autoridade: ele ignora fator recebido do navegador e recalcula pela regra
-- vigente do proprio banco.
--
-- 2026-08-19: a importacao passou a oferecer uma confirmacao explicita para
-- equivalencias 1:1 ainda desconhecidas (ex.: BRITA 19, MT -> M³). A regra e'
-- salva por material em material_conversao; a unidade original do XML continua
-- preservada. Conversoes nao confirmadas continuam bloqueadas.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas_fiscais'
      and column_name = 'data_efetiva_estoque'
  ) then
    raise exception 'Pre-requisito ausente: notas_fiscais.data_efetiva_estoque';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas_fiscais'
      and column_name = 'itens' and udt_name = 'text'
  ) then
    raise exception 'Pre-requisito ausente: notas_fiscais.itens precisa ser text com JSON';
  end if;
end $$;

create table if not exists public.material_conversao (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  material_id uuid not null references public.materiais(id),
  unidade_origem text not null,
  unidade_destino text not null,
  fator numeric(20,8) not null check (fator > 0),
  vigente_de date not null,
  -- Inicio da proxima regra; intervalo semiaberto [vigente_de, vigente_ate).
  vigente_ate date,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  encerrado_em timestamptz,
  encerrado_por uuid,
  check (vigente_ate is null or vigente_ate > vigente_de)
);

create unique index if not exists material_conversao_ativa_unica
  on public.material_conversao(company_id, material_id, upper(unidade_origem), upper(unidade_destino))
  where vigente_ate is null;

create or replace function public.fn_unidade_normalizada(p_unidade text)
returns text language sql immutable strict as $$
  select case upper(trim(p_unidade))
    when 'UND' then 'UN' when 'UNID' then 'UN' when 'UNIDADE' then 'UN'
    when 'M2' then 'M²' when 'M^2' then 'M²'
    when 'M3' then 'M³' when 'M^3' then 'M³'
    else upper(trim(p_unidade))
  end
$$;

create or replace function public.trg_material_conversao_validar()
returns trigger language plpgsql as $$
begin
  new.unidade_origem := public.fn_unidade_normalizada(new.unidade_origem);
  new.unidade_destino := public.fn_unidade_normalizada(new.unidade_destino);

  if not exists (
    select 1 from public.materiais m
    where m.id = new.material_id and m.company_id = new.company_id
  ) then
    raise exception 'Material de conversao nao pertence a empresa';
  end if;

  if exists (
    select 1 from public.material_conversao r
    where r.company_id = new.company_id
      and r.material_id = new.material_id
      and r.unidade_origem = new.unidade_origem
      and r.unidade_destino = new.unidade_destino
      and r.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and daterange(r.vigente_de, r.vigente_ate, '[)') && daterange(new.vigente_de, new.vigente_ate, '[)')
  ) then
    raise exception 'Periodo de vigencia sobreposto para esta conversao';
  end if;

  if tg_op = 'UPDATE'
    and (old.company_id, old.material_id, old.unidade_origem, old.unidade_destino, old.fator)
        is distinct from (new.company_id, new.material_id, new.unidade_origem, new.unidade_destino, new.fator)
    and exists (
      select 1 from public.notas_fiscais n
      cross join lateral jsonb_array_elements(n.itens::jsonb) i
      where n.company_id = old.company_id and i ->> 'regra_conversao_id' = old.id::text
    ) then
    raise exception 'Regra ja usada por NF: encerre a vigencia e crie uma nova regra';
  end if;
  return new;
end $$;

drop trigger if exists material_conversao_validar on public.material_conversao;
create trigger material_conversao_validar
before insert or update on public.material_conversao
for each row execute function public.trg_material_conversao_validar();

alter table public.material_conversao enable row level security;
drop policy if exists material_conversao_select on public.material_conversao;
create policy material_conversao_select on public.material_conversao
  for select using (company_id = auth_company_id());
drop policy if exists material_conversao_insert on public.material_conversao;
create policy material_conversao_insert on public.material_conversao
  for insert with check (company_id = auth_company_id() and auth_user_role() = 'admin');
drop policy if exists material_conversao_update on public.material_conversao;
create policy material_conversao_update on public.material_conversao
  for update using (company_id = auth_company_id() and auth_user_role() = 'admin')
  with check (company_id = auth_company_id() and auth_user_role() = 'admin');
drop policy if exists material_conversao_delete on public.material_conversao;
create policy material_conversao_delete on public.material_conversao
  for delete using (company_id = auth_company_id() and auth_user_role() = 'admin');

create or replace function public.trg_notas_fiscais_validar_conversao()
returns trigger language plpgsql as $$
declare
  v_item jsonb;
  v_itens jsonb := '[]'::jsonb;
  v_material uuid;
  v_regra_id uuid;
  v_fator numeric;
  v_unidade_fiscal text;
  v_unidade_estoque text;
  v_qtd_fiscal numeric;
  v_total_fiscal numeric;
  v_qtd_estoque numeric;
  v_preco_estoque numeric;
begin
  if new.itens is null then return new; end if;

  for v_item in select value from jsonb_array_elements(new.itens::jsonb)
  loop
    -- Itens manuais legados nao carregam os campos fiscais e permanecem compativeis.
    if coalesce(v_item ->> 'descricao_fiscal', '') = '' then
      v_itens := v_itens || jsonb_build_array(v_item);
      continue;
    end if;
    if new.data_efetiva_estoque is null then
      raise exception 'NF XML sem data efetiva de estoque';
    end if;

    v_qtd_fiscal := nullif(v_item ->> 'qtd_fiscal', '')::numeric;
    v_total_fiscal := nullif(v_item ->> 'total_fiscal', '')::numeric;
    v_unidade_fiscal := public.fn_unidade_normalizada(v_item ->> 'unidade_fiscal');
    v_material := nullif(v_item ->> 'material_id', '')::uuid;
    if v_qtd_fiscal is null or v_qtd_fiscal <= 0 or v_total_fiscal is null or v_unidade_fiscal is null then
      raise exception 'Item XML fiscal incompleto';
    end if;

    if v_material is null then
      -- Sem catalogo nao ha unidade de estoque para converter; preserva o fiscal.
      v_item := v_item || jsonb_build_object(
        'qtd_estoque', v_qtd_fiscal, 'unidade_estoque', v_unidade_fiscal,
        'preco_estoque', v_total_fiscal / v_qtd_fiscal,
        'regra_conversao_id', null, 'status_conversao', 'sem_catalogo'
      );
    else
      select public.fn_unidade_normalizada(m.unidade) into v_unidade_estoque
      from public.materiais m where m.id = v_material and m.company_id = new.company_id;
      if not found then raise exception 'Material do item nao pertence a empresa'; end if;

      if v_unidade_fiscal = v_unidade_estoque then
        v_qtd_estoque := v_qtd_fiscal;
        v_regra_id := null;
      else
        select r.id, r.fator into v_regra_id, v_fator
        from public.material_conversao r
        where r.company_id = new.company_id and r.material_id = v_material
          and r.unidade_origem = v_unidade_fiscal and r.unidade_destino = v_unidade_estoque
          and new.data_efetiva_estoque >= r.vigente_de
          and (r.vigente_ate is null or new.data_efetiva_estoque < r.vigente_ate)
        order by r.vigente_de desc limit 1;
        if not found then
          raise exception 'Sem regra de conversao % para % no material %', v_unidade_fiscal, v_unidade_estoque, v_material;
        end if;
        v_qtd_estoque := v_qtd_fiscal * v_fator;
      end if;
      v_preco_estoque := v_total_fiscal / v_qtd_estoque;
      if abs((v_qtd_estoque * v_preco_estoque) - v_total_fiscal) > 0.005 then
        raise exception 'Conversao nao preserva o total fiscal';
      end if;
      v_item := v_item || jsonb_build_object(
        'qtd_estoque', v_qtd_estoque, 'unidade_estoque', v_unidade_estoque,
        'preco_estoque', v_preco_estoque,
        'regra_conversao_id', case when v_regra_id is null then null else v_regra_id::text end,
        'status_conversao', case when v_regra_id is null then 'igual' else 'convertido' end
      );
    end if;
    v_itens := v_itens || jsonb_build_array(v_item);
  end loop;
  new.itens := v_itens::text;
  return new;
end $$;

drop trigger if exists notas_fiscais_validar_conversao on public.notas_fiscais;
create trigger notas_fiscais_validar_conversao
before insert or update of itens, data_efetiva_estoque on public.notas_fiscais
for each row execute function public.trg_notas_fiscais_validar_conversao();

-- Validacao minima para a janela de aplicacao (executar em transacao e rollback):
-- 1. MI -> PC com fator 1000: 0.8 MI / R$799.20 deve virar 800 PC / R$0.999.
-- 2. Conversao sem regra deve ser rejeitada.
-- 3. Regra encerrada em 2026-07-24 nao vale nessa data; a nova vale.
-- 4. company_id/material_id cruzados devem ser rejeitados.
--
-- Validacao executada em 2026-08-13 dentro de BEGIN/ROLLBACK no banco EDR:
-- os quatro cenarios acima passaram; tabela, funcao e trigger nao permaneceram.
-- Apos a aplicacao permanente, o gatilho foi exercitado novamente em tabela
-- temporaria e rollback: 0.8 MI / R$799.20 -> 800 PC / R$0.999. A tabela
-- temporaria nao permaneceu e a contagem de notas fiscais continuou em 156.
