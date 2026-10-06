-- Ensaio PostgreSQL local descartavel. Dados integralmente sinteticos.
-- Helpers reproduzem o contrato EDR; nao usa Supabase, credenciais ou dados reais.
create role anon;
create role authenticated;
create schema auth;
create table public.companies(id uuid primary key,saldo_manual numeric not null default 123.45);
create table public.company_users(user_id uuid primary key,company_id uuid not null references companies(id),role text not null,active boolean default true);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
-- Contrato real: os dois helpers legados ignoram active. A protecao nova precisa
-- conferir o vinculo ativo mesmo quando a sessao/Auth UID continua valida.
create function public.auth_company_id() returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select company_id from public.company_users where user_id=auth.uid()
$$;
create function public.auth_user_role() returns text language sql stable security definer set search_path=pg_catalog,public as $$
  select role from public.company_users where user_id=auth.uid()
$$;
grant usage on schema public,auth to authenticated,anon;
-- Somente no ensaio, reproduz a leitura company_users cu_select observada.
-- Nao depende das tabelas de caixa e nao recorre a profiles.
alter table public.company_users enable row level security;
create policy cu_select on public.company_users for select to authenticated
  using(company_id=public.auth_company_id());
grant select on public.company_users to authenticated;
create table public.contas_pagar(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),
  valor numeric not null,descricao text,data_vencimento date,status text,data_pagamento date,tipo text,
  obra_id uuid,nota_id uuid,nota_ref text,
  check(status is null or status in ('pendente','pago','vencido','cancelado','reembolsado'))
);
alter table public.contas_pagar enable row level security;
create policy contas_pagar_ensaio on public.contas_pagar to authenticated
  using(company_id=public.auth_company_id()) with check(company_id=public.auth_company_id() and public.auth_user_role()='admin');
grant select,insert,update,delete on public.contas_pagar to authenticated;
-- Sentinelas para provar que os fluxos nao criam/alteram custos, folha ou estoque.
create table public.lancamentos(id integer primary key,total numeric);
create table public.diarias_quinzenas(id integer primary key,status text);
create table public.distribuicoes(id integer primary key,qtd numeric);
insert into public.lancamentos values(1,91.23);
insert into public.diarias_quinzenas values(1,'fechada');
insert into public.distribuicoes values(1,7);
