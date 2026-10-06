-- SOMENTE STACK SUPABASE LOCAL DESCARTAVEL. NAO E MIGRACAO EDR.
-- Colunas/defaults: snapshot real 2026-10-06-preflight-metadados.json.
-- auth.*, roles Supabase e emissao/validacao JWT sao fornecidos pela stack oficial.
-- Dependencias auxiliares minimas: obras/NFs/audit_logs/sentinelas; nao copia dados.
begin;
do $$ begin
  if current_setting('edr.caixa_qa_local',true) is distinct from 'EDR_CAIXA_AUTH_LOCAL_ONLY' then
    raise exception 'BOOTSTRAP LOCAL exige marcador explicito';
  end if;
  if to_regprocedure('auth.uid()') is null or to_regclass('auth.users') is null
     or not exists(select 1 from pg_roles where rolname='authenticated') then
    raise exception 'Stack Supabase real local ausente';
  end if;
  if to_regclass('public.companies') is not null or to_regclass('public.company_users') is not null
     or to_regclass('public.contas_pagar') is not null or to_regclass('public.caixa_contas') is not null then
    raise exception 'Bootstrap nao sobrescreve schema existente';
  end if;
end $$;
create schema edr_caixa_qa;
create table edr_caixa_qa.marker(id integer primary key,project_id text not null);
insert into edr_caixa_qa.marker values(1,'edr-caixa-qa-20261006');
revoke all on schema edr_caixa_qa from public,anon,authenticated,service_role;
revoke all on edr_caixa_qa.marker from public,anon,authenticated,service_role;

-- Reproduz o default legado observado, para provar que a migracao revoga DML
-- dos clientes nas novas tabelas mesmo com defaults originalmente amplos.
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
create table public.companies(
  id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),name text not null,slug text not null unique,
  cnpj text,phone text,city text,state text default 'PE',address text,email_domain text,
  delivery_base_url text,logo_url text,plan text default 'trial',
  trial_ends_at timestamptz default (now()+'30 days'::interval),created_at timestamptz default now(),
  notes text,role_permissions jsonb default '{}',permissions jsonb,saldo_manual numeric,
  onboarding_done boolean default false,status_pagamento text not null default 'trial'
    check(status_pagamento in ('trial','ativo','atrasado','bloqueado','cancelado')),
  dias_atraso integer not null default 0,bloqueado_em timestamptz,asaas_customer_id text
);
create table public.company_users(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,role text default 'operacional'
    check(role in ('admin','operacional','mestre','visitante')),active boolean default true,
  created_at timestamptz default now(),senha_inicial text,permissions jsonb default '{}',nome text,email text,
  unique(company_id,user_id)
);
create table public.obras(id uuid primary key,company_id uuid not null references public.companies(id));
create table public.notas_fiscais(id uuid primary key,company_id uuid not null references public.companies(id));
create table public.contas_pagar(
  id uuid primary key default gen_random_uuid(),fornecedor text not null,descricao text default '',
  valor numeric not null,data_vencimento date not null,status text default 'pendente',data_pagamento date,
  obra_id uuid references public.obras(id) on delete set null,nota_ref text default '',
  criado_em timestamptz default now(),atualizado_em timestamptz default now(),
  company_id uuid not null references public.companies(id),
  nota_id uuid references public.notas_fiscais(id) on delete cascade,tipo text,data_recebimento date
);
create table public.audit_logs(
  id uuid primary key default gen_random_uuid(),tabela text not null,
  operacao text not null check(operacao in ('INSERT','UPDATE','DELETE')),registro_id uuid,
  dados_antes jsonb,dados_depois jsonb,usuario_id uuid,usuario_nome text,company_id uuid,
  ip text,created_at timestamptz default now()
);
-- Custos/folha/estoque sao sentinelas; nenhum cliente recebe acesso neste ensaio.
create table public.lancamentos(id integer primary key,total numeric);
create table public.diarias_quinzenas(id integer primary key,status text);
create table public.distribuicoes(id integer primary key,qtd numeric);
insert into public.lancamentos values(1,91.23);
insert into public.diarias_quinzenas values(1,'fechada');
insert into public.distribuicoes values(1,7);

-- O bootstrap JS concatena APENAS os helpers, policies e trigger do snapshot
-- versionado. O marcador local acima e validacao loopback sao obrigatorios.
-- Nao cria auth.uid(), roles nem JWT mock. Commit ocorre ao final do script JS.
