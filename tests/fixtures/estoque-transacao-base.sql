-- Esquema de teste isolado, baseado nas colunas lidas em 2026-09-06.
-- Dados sinteticos. Auth simulada; nao substitui teste autenticado no Supabase.
create role anon; create role authenticated;
create schema auth;
create table public.companies(id uuid primary key);
create table public.company_users(user_id uuid, company_id uuid references companies(id),role text);
create table public.obra_adicionais(id uuid primary key,company_id uuid,obra_id uuid,status text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.ajustes_estoque(
  id uuid default gen_random_uuid() not null primary key,
  item_desc text not null,
  unidade text default 'UN'::text,
  qtd numeric not null,
  tipo text default 'inventario'::text not null,
  motivo text default ''::text,
  criado_por text default ''::text,
  criado_em timestamptz default now(),
  company_id uuid not null,
  codigo_catalogo text
);
create table public.distribuicoes(
  id uuid default gen_random_uuid() not null primary key,
  nota_id uuid,
  item_desc text not null,
  item_idx int4 not null,
  obra_id uuid,
  obra_nome text not null,
  qtd numeric not null,
  valor numeric not null,
  data date default CURRENT_DATE,
  lancamento_id uuid,
  criado_em timestamptz default now(),
  etapa text default ''::text,
  criado_por text default ''::text,
  company_id uuid not null,
  codigo_catalogo text
);
create table public.entradas_diretas(
  id uuid default gen_random_uuid() not null primary key,
  item_desc text not null,
  unidade text default 'UN'::text,
  qtd numeric not null,
  preco numeric default 0,
  fornecedor text default ''::text,
  data date default CURRENT_DATE,
  obs text default ''::text,
  criado_em timestamptz default now(),
  criado_por text default ''::text,
  company_id uuid not null,
  obra text default 'EDR'::text,
  foto_url text,
  status text default 'pendente'::text,
  nf_vinculada uuid,
  codigo_catalogo text
);
create table public.lancamentos(
  id uuid default gen_random_uuid() not null primary key,
  obra_id uuid,
  descricao text not null,
  qtd numeric default 1,
  preco numeric default 0,
  total numeric default 0,
  data date,
  obs text default ''::text,
  criado_em timestamptz default now(),
  etapa text default ''::text,
  criado_por text default ''::text,
  company_id uuid not null,
  pago bool default false,
  data_vencimento date,
  parcela_n int4 default 1,
  total_parcelas int4 default 1,
  origem text default 'manual'::text,
  nota_id uuid,
  destino_custo text default 'nao_classificado'::text not null,
  adicional_id uuid
);
create table public.materiais(
  id uuid default gen_random_uuid() not null primary key,
  codigo text not null,
  nome text not null,
  unidade text default 'UN'::text,
  categoria text default ''::text,
  criado_em timestamptz default now(),
  auto bool default false,
  company_id uuid not null,
  tipo_item text default 'material'::text,
  movimenta_estoque bool default true,
  valor_referencia_manual numeric,
  valor_ref_por text,
  valor_ref_em timestamptz,
  valor_ref_fonte text
);
create table public.notas_fiscais(
  id uuid default gen_random_uuid() not null primary key,
  data date not null,
  data_recebimento date,
  natureza text default 'VENDA'::text,
  numero_nf text default ''::text,
  fornecedor text not null,
  cnpj text default ''::text,
  obra text default 'EDR'::text,
  valor_bruto numeric default 0,
  imposto numeric default 0,
  gera_credito bool default false,
  credito_status text default 'nao'::text,
  itens text default '[]'::text,
  obs text default ''::text,
  obs_distribuicao text default ''::text,
  criado_em timestamptz default now(),
  frete numeric default 0,
  criado_por text default ''::text,
  company_id uuid not null,
  outras_despesas numeric default 0,
  frete_rateado numeric default 0,
  chave_acesso text,
  desconto_total numeric default 0 not null,
  data_efetiva_estoque date,
  nota_origem_id uuid,
  motivo_devolucao text
);
create table public.obras(
  id uuid default gen_random_uuid() not null primary key,
  nome text not null,
  criado_em timestamptz default now(),
  arquivada bool default false,
  cidade text default ''::text,
  valor_venda numeric default 0,
  contratante text default ''::text,
  cpf_contratante text default ''::text,
  proprietario text,
  endereco_rua text,
  endereco_numero text,
  endereco_bairro text,
  endereco_cep text,
  slug_entrega text default ''::text,
  clickup_list_id text,
  area_m2 numeric default 0,
  contrato_valor numeric default 0,
  contrato_entrada numeric default 0,
  contrato_terreno numeric default 0,
  contrato_taxa text default ''::text,
  contrato_prazo text default ''::text,
  contrato_data date,
  contrato_valor_edr numeric default 0,
  entrada_paga bool default false,
  terreno_pago bool default false,
  contrato_subsidio numeric default 0,
  contrato_fgts numeric default 0,
  contrato_extras numeric default 0,
  company_id uuid not null,
  data_entrega date
);
alter table public.ajustes_estoque add constraint ajustes_estoque_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.distribuicoes add constraint distribuicoes_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.distribuicoes add constraint distribuicoes_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id) ON DELETE RESTRICT NOT VALID;
alter table public.distribuicoes add constraint distribuicoes_nota_id_fkey FOREIGN KEY (nota_id) REFERENCES notas_fiscais(id) ON DELETE CASCADE;
alter table public.entradas_diretas add constraint entradas_diretas_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.entradas_diretas add constraint entradas_diretas_nf_vinculada_fkey FOREIGN KEY (nf_vinculada) REFERENCES notas_fiscais(id) ON DELETE SET NULL;
alter table public.entradas_diretas add constraint entradas_diretas_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'faturada'::text])));
alter table public.lancamentos add constraint lancamentos_adicional_coerente_check CHECK ((((destino_custo = 'adicional'::text) AND (adicional_id IS NOT NULL)) OR ((destino_custo <> 'adicional'::text) AND (adicional_id IS NULL))));
alter table public.lancamentos add constraint lancamentos_adicional_id_fkey FOREIGN KEY (adicional_id) REFERENCES obra_adicionais(id) ON DELETE RESTRICT;
alter table public.lancamentos add constraint lancamentos_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
alter table public.lancamentos add constraint lancamentos_destino_custo_check CHECK ((destino_custo = ANY (ARRAY['padrao'::text, 'adicional'::text, 'nao_classificado'::text])));
alter table public.lancamentos add constraint lancamentos_nota_id_fkey FOREIGN KEY (nota_id) REFERENCES notas_fiscais(id) ON DELETE SET NULL;
alter table public.lancamentos add constraint lancamentos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES obras(id) ON DELETE CASCADE;
alter table public.materiais add constraint materiais_codigo_company_key UNIQUE (company_id, codigo);
alter table public.materiais add constraint materiais_company_codigo_unique UNIQUE (company_id, codigo);
alter table public.materiais add constraint materiais_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
CREATE OR REPLACE FUNCTION public.auth_company_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id
  FROM company_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.auth_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role
  FROM company_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$function$
;
CREATE OR REPLACE FUNCTION public.excluir_distribuicao_estoque(p_distribuicao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.trg_notas_fiscais_validar_devolucao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.validar_destino_custo_lancamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_adicional public.obra_adicionais%rowtype;
begin
  if tg_op = 'UPDATE'
    and (new.destino_custo, new.adicional_id) is distinct from (old.destino_custo, old.adicional_id)
    and auth.uid() is not null
    and public.auth_user_role() is distinct from 'admin' then
    raise exception 'apenas administrador pode reclassificar custo' using errcode = '42501';
  end if;

  if new.destino_custo <> 'adicional' then
    new.adicional_id := null;
    return new;
  end if;

  select * into v_adicional
  from public.obra_adicionais
  where id = new.adicional_id;

  if not found
    or v_adicional.company_id is distinct from new.company_id
    or v_adicional.obra_id is distinct from new.obra_id then
    raise exception 'adicional nao pertence a mesma empresa e obra do custo' using errcode = '23514';
  end if;
  if v_adicional.status in ('pendente', 'cancelado') then
    raise exception 'adicional pendente ou cancelado nao aceita custos' using errcode = '23514';
  end if;
  return new;
end;
$function$
;
create trigger validar_custo before insert or update on public.lancamentos for each row execute function public.validar_destino_custo_lancamento();
create trigger notas_fiscais_validar_devolucao before insert or update of natureza,nota_origem_id,motivo_devolucao,itens,obra,fornecedor,cnpj on public.notas_fiscais for each row execute function public.trg_notas_fiscais_validar_devolucao();
