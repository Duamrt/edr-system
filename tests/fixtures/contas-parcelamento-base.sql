-- Somente ensaio descartável, dados sintéticos. Não instalar em ambiente real.
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table companies(id uuid primary key);
create table company_users(user_id uuid,company_id uuid,role text,active boolean default true);
create function auth_company_id() returns uuid language sql stable security definer
  as $$select company_id from company_users where user_id=auth.uid() limit 1$$;
create function auth_user_role() returns text language sql stable security definer
  as $$select role from company_users where user_id=auth.uid() limit 1$$;
create table obras(id uuid primary key,company_id uuid,nome text);
create table notas_fiscais(id uuid primary key,company_id uuid,numero_nf text,fornecedor text,
  natureza text default 'VENDA',valor_bruto numeric,imposto numeric,gera_credito boolean default false);
create table contas_pagar(id uuid primary key default gen_random_uuid(),company_id uuid not null,
  fornecedor text,descricao text,valor numeric not null,data_vencimento date,obra_id uuid,
  nota_id uuid references notas_fiscais(id) on delete cascade,nota_ref text,status text,
  data_pagamento date,data_recebimento date,tipo text);
create table lancamentos(id uuid primary key default gen_random_uuid(),company_id uuid,obs text);
create table caixa_obrigacoes(company_id uuid,conta_pagar_id uuid,valor_centavos bigint);
create table caixa_movimentos(id uuid primary key default gen_random_uuid(),company_id uuid,
  conta_pagar_id uuid,cancelado_em timestamptz,valor_centavos bigint);
-- Reproduzir privilégios de leitura dos helpers/usuário; todo dado é sintético.
grant usage on schema auth to authenticated;
grant select on company_users to authenticated;
alter table company_users enable row level security;
create policy tenant on company_users to authenticated using(company_id=auth_company_id());
