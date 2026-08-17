-- EDR System V2 — devolucao parcial ao fornecedor
-- STATUS: ROTEIRO DE REGRESSAO LOCAL. O DDL foi aplicado em producao pelas
-- migrations 20260817112045_devolucao_fornecedor e
-- 20260817112156_harden_devolucao_trigger_execute. Este arquivo continua com
-- BEGIN ... ROLLBACK somente para repetir testes sem deixar residuos.
--
-- Objetivo:
--   1. vincular uma NF de devolucao a uma unica compra de origem;
--   2. validar no banco empresa, fornecedor, item, quantidade, valor e saldo;
--   3. impedir devolucao de compra que ja saiu para obra;
--   4. criar um reembolso PENDENTE, auditavel e vinculado a NF de devolucao.
--
-- Regra financeira: a devolucao fiscal cria o direito ao reembolso, mas NAO
-- aumenta o caixa ate o usuario confirmar que o dinheiro foi recebido.
--
-- Uso atual: executar inteiro dentro de BEGIN ... ROLLBACK somente como teste
-- de regressao. A aplicacao permanente ja ocorreu pelas migrations registradas
-- no cabecalho deste arquivo.

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas_fiscais'
      and column_name = 'id' and udt_name = 'uuid'
  ) then
    raise exception 'Pre-requisito ausente: notas_fiscais.id uuid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas_fiscais'
      and column_name = 'company_id' and udt_name = 'uuid'
  ) then
    raise exception 'Pre-requisito ausente: notas_fiscais.company_id uuid';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notas_fiscais'
      and column_name = 'itens' and udt_name = 'text'
  ) then
    raise exception 'Pre-requisito ausente: notas_fiscais.itens text contendo JSON';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contas_pagar'
      and column_name = 'company_id' and udt_name = 'uuid'
  ) then
    raise exception 'Pre-requisito ausente: contas_pagar.company_id uuid';
  end if;
end $$;

alter table public.notas_fiscais
  add column if not exists nota_origem_id uuid,
  add column if not exists motivo_devolucao text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notas_fiscais'::regclass
      and conname = 'notas_fiscais_nota_origem_fk'
  ) then
    alter table public.notas_fiscais
      add constraint notas_fiscais_nota_origem_fk
      foreign key (nota_origem_id) references public.notas_fiscais(id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_notas_fiscais_nota_origem
  on public.notas_fiscais(company_id, nota_origem_id)
  where nota_origem_id is not null;

alter table public.contas_pagar
  add column if not exists nota_id uuid,
  add column if not exists tipo text,
  add column if not exists data_recebimento date;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.contas_pagar'::regclass
      and conname = 'contas_pagar_nota_fk'
  ) then
    alter table public.contas_pagar
      add constraint contas_pagar_nota_fk
      foreign key (nota_id) references public.notas_fiscais(id)
      on delete cascade;
  end if;
end $$;

create unique index if not exists contas_pagar_reembolso_por_nf_unico
  on public.contas_pagar(nota_id)
  where tipo = 'reembolso_fornecedor';

create or replace function public.trg_notas_fiscais_validar_devolucao()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_origem public.notas_fiscais%rowtype;
  v_item jsonb;
  v_item_origem jsonb;
  v_ord bigint;
  v_idx_origem integer;
  v_qtd_origem numeric;
  v_qtd_devolvida numeric;
  v_qtd_anterior numeric;
  v_total_origem numeric;
  v_total_devolvido numeric;
  v_chave_origem text;
  v_chave_devolucao text;
begin
  if new.natureza is distinct from 'DEVOLUCAO' then
    if new.nota_origem_id is not null or nullif(trim(coalesce(new.motivo_devolucao, '')), '') is not null then
      raise exception 'Campos de devolucao so podem ser usados quando natureza for DEVOLUCAO';
    end if;
    return new;
  end if;

  if new.company_id is distinct from public.auth_company_id() then
    raise exception 'Empresa da devolucao nao confere com a sessao';
  end if;
  if new.nota_origem_id is null then
    raise exception 'Devolucao exige a nota de compra de origem';
  end if;
  if nullif(trim(coalesce(new.motivo_devolucao, '')), '') is null then
    raise exception 'Devolucao exige o motivo';
  end if;
  if new.obra is distinct from 'EDR' then
    raise exception 'Devolucao ao fornecedor so pode retornar ao Estoque EDR';
  end if;

  select * into v_origem
  from public.notas_fiscais
  where id = new.nota_origem_id and company_id = new.company_id;
  if not found then
    raise exception 'Nota de compra de origem inexistente ou de outra empresa';
  end if;
  if v_origem.natureza = 'DEVOLUCAO' then
    raise exception 'Uma devolucao nao pode ser origem de outra devolucao';
  end if;
  if v_origem.obra is distinct from 'EDR' then
    raise exception 'A compra de origem precisa estar no Estoque EDR';
  end if;
  if regexp_replace(coalesce(v_origem.cnpj, ''), '\\D', '', 'g') = ''
     or regexp_replace(coalesce(new.cnpj, ''), '\\D', '', 'g') = ''
     or regexp_replace(v_origem.cnpj, '\\D', '', 'g') <> regexp_replace(new.cnpj, '\\D', '', 'g') then
    raise exception 'Fornecedor/CNPJ da devolucao nao confere com a compra de origem';
  end if;
  if exists (
    select 1 from public.distribuicoes d
    where d.nota_id = v_origem.id and coalesce(d.qtd, 0) > 0
  ) then
    raise exception 'A compra de origem ja teve saida para obra; devolucao bloqueada';
  end if;
  if new.itens is null or jsonb_array_length(new.itens::jsonb) = 0 then
    raise exception 'Devolucao exige ao menos um item';
  end if;

  for v_item, v_ord in
    select value, ordinality from jsonb_array_elements(new.itens::jsonb) with ordinality
  loop
    v_idx_origem := nullif(v_item ->> 'item_idx_origem', '')::integer;
    if v_idx_origem is null or v_idx_origem < 0 then
      raise exception 'Item % da devolucao sem vinculo com a linha da compra', v_ord;
    end if;

    select value into v_item_origem
    from jsonb_array_elements(v_origem.itens::jsonb) with ordinality
    where ordinality = v_idx_origem + 1;
    if v_item_origem is null then
      raise exception 'Item % aponta para uma linha inexistente na compra', v_ord;
    end if;

    v_chave_origem := case
      when nullif(upper(trim(v_item_origem ->> 'codigo_produto_fiscal')), '') is not null then 'F:' || upper(trim(v_item_origem ->> 'codigo_produto_fiscal'))
      when nullif(upper(trim(v_item_origem ->> 'cProd')), '') is not null then 'F:' || upper(trim(v_item_origem ->> 'cProd'))
      when nullif(upper(trim(v_item_origem ->> 'codigo_catalogo')), '') is not null then 'C:' || upper(trim(v_item_origem ->> 'codigo_catalogo'))
      when nullif(upper(trim(v_item_origem ->> 'codigo')), '') is not null then 'C:' || upper(trim(v_item_origem ->> 'codigo'))
    end;
    v_chave_devolucao := case
      when nullif(upper(trim(v_item ->> 'codigo_produto_fiscal')), '') is not null then 'F:' || upper(trim(v_item ->> 'codigo_produto_fiscal'))
      when nullif(upper(trim(v_item ->> 'cProd')), '') is not null then 'F:' || upper(trim(v_item ->> 'cProd'))
      when nullif(upper(trim(v_item ->> 'codigo_catalogo')), '') is not null then 'C:' || upper(trim(v_item ->> 'codigo_catalogo'))
      when nullif(upper(trim(v_item ->> 'codigo')), '') is not null then 'C:' || upper(trim(v_item ->> 'codigo'))
    end;
    if v_chave_origem is null or v_chave_devolucao is null or v_chave_origem <> v_chave_devolucao then
      raise exception 'Item % nao confere com a linha vinculada da compra', v_ord;
    end if;

    v_qtd_origem := coalesce(
      nullif(v_item_origem ->> 'qtd_estoque', '')::numeric,
      nullif(v_item_origem ->> 'quantidade', '')::numeric,
      nullif(v_item_origem ->> 'qtd', '')::numeric
    );
    v_qtd_devolvida := coalesce(
      nullif(v_item ->> 'qtd_estoque', '')::numeric,
      nullif(v_item ->> 'quantidade', '')::numeric,
      nullif(v_item ->> 'qtd', '')::numeric
    );
    if v_qtd_origem is null or v_qtd_origem <= 0 or v_qtd_devolvida is null or v_qtd_devolvida <= 0 then
      raise exception 'Quantidade invalida no item % da devolucao', v_ord;
    end if;

    select coalesce(sum(coalesce(
      nullif(prev_item ->> 'qtd_estoque', '')::numeric,
      nullif(prev_item ->> 'quantidade', '')::numeric,
      nullif(prev_item ->> 'qtd', '')::numeric,
      0
    )), 0)
    into v_qtd_anterior
    from public.notas_fiscais prev
    cross join lateral jsonb_array_elements(prev.itens::jsonb) prev_item
    where prev.company_id = new.company_id
      and prev.natureza = 'DEVOLUCAO'
      and prev.nota_origem_id = v_origem.id
      and prev.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
      and nullif(prev_item ->> 'item_idx_origem', '')::integer = v_idx_origem;
    if v_qtd_devolvida + v_qtd_anterior > v_qtd_origem + 0.000001 then
      raise exception 'Devolucao do item % excede o saldo da compra', v_ord;
    end if;

    v_total_origem := coalesce(
      nullif(v_item_origem ->> 'total', '')::numeric,
      v_qtd_origem * coalesce(
        nullif(v_item_origem ->> 'preco_estoque', '')::numeric,
        nullif(v_item_origem ->> 'preco_unitario', '')::numeric,
        nullif(v_item_origem ->> 'preco', '')::numeric
      )
    );
    v_total_devolvido := coalesce(
      nullif(v_item ->> 'total', '')::numeric,
      v_qtd_devolvida * coalesce(
        nullif(v_item ->> 'preco_estoque', '')::numeric,
        nullif(v_item ->> 'preco_unitario', '')::numeric,
        nullif(v_item ->> 'preco', '')::numeric
      )
    );
    if v_total_origem is null or v_total_devolvido is null
       or abs(v_total_devolvido - (v_total_origem * v_qtd_devolvida / v_qtd_origem)) > 0.01 then
      raise exception 'Valor do item % nao confere proporcionalmente com a compra', v_ord;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists notas_fiscais_validar_devolucao on public.notas_fiscais;
create trigger notas_fiscais_validar_devolucao
before insert or update of natureza, nota_origem_id, motivo_devolucao, itens, obra, fornecedor, cnpj
on public.notas_fiscais
for each row execute function public.trg_notas_fiscais_validar_devolucao();

create or replace function public.trg_notas_fiscais_criar_reembolso()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.natureza <> 'DEVOLUCAO' then return new; end if;

  insert into public.contas_pagar (
    company_id, nota_id, tipo, fornecedor, descricao, valor,
    data_vencimento, status, nota_ref
  ) values (
    new.company_id, new.id, 'reembolso_fornecedor', new.fornecedor,
    'Reembolso da devolucao NF ' || coalesce(new.numero_nf, new.id::text),
    new.valor_bruto, coalesce(new.data_efetiva_estoque, new.data),
    'pendente', new.numero_nf
  )
  on conflict (nota_id) where tipo = 'reembolso_fornecedor' do nothing;
  return new;
end;
$$;

drop trigger if exists notas_fiscais_criar_reembolso on public.notas_fiscais;
create trigger notas_fiscais_criar_reembolso
after insert on public.notas_fiscais
for each row execute function public.trg_notas_fiscais_criar_reembolso();

-- Funcoes de trigger nao sao APIs publicas.
revoke all on function public.trg_notas_fiscais_validar_devolucao() from public, anon, authenticated;
revoke all on function public.trg_notas_fiscais_criar_reembolso() from public, anon, authenticated;

-- TESTE CONTROLADO (nao executar sem autorizacao):
-- 1. BEGIN;
-- 2. inserir compra temporaria da mesma empresa, com 2 UN e total R$ 792,90;
-- 3. inserir devolucao de 1 UN, item_idx_origem=0 e total R$ 396,45;
-- 4. confirmar: estoque calculado fica em 1 UN; 1 reembolso pendente de R$ 396,45;
-- 5. tentar excesso, outro CNPJ, origem distribuida e tenant cruzado: todos rejeitados;
-- 6. ROLLBACK;

-- NAO TROCAR POR COMMIT: este arquivo e apenas o roteiro de teste reversivel.
rollback;
