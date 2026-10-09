-- EXCLUSIVO PARA STACK NOVA SUPABASE LOCAL edr-entrada-qa-20261008.
-- Não é migração de produção. Não cria auth.uid(), roles, JWT nem usuários.
-- GoTrue/PostgREST/roles/auth.* são instalados pela CLI oficial antes deste script.
begin;
do $$ begin
  if current_setting('edr.entrada_qa_local',true) is distinct from 'EDR_ENTRADA_AUTH_LOCAL_ONLY' then raise exception 'BOOTSTRAP exige autorização/marcador LOCAL explícito'; end if;
  if to_regprocedure('auth.uid()') is null or to_regclass('auth.users') is null
    or not exists(select 1 from pg_roles where rolname='authenticated') or not exists(select 1 from pg_roles where rolname='anon') then
    raise exception 'Stack Supabase real LOCAL ausente'; end if;
  if to_regclass('public.companies') is not null or to_regclass('public.company_users') is not null
    or to_regclass('public.obras') is not null or to_regclass('public.repasses_cef') is not null
    or to_regclass('public.caixa_contas') is not null or to_regclass('public.entrada_planos') is not null
    or to_regclass('edr_entrada_qa.marker') is not null then raise exception 'Bootstrap não sobrescreve schema ou ensaio existente'; end if;
end $$;
create schema edr_entrada_qa;
create table edr_entrada_qa.marker(id integer primary key,project_id text not null);
insert into edr_entrada_qa.marker values(1,'edr-entrada-qa-20261008');
revoke all on schema edr_entrada_qa from public,anon,authenticated,service_role;
revoke all on edr_entrada_qa.marker from public,anon,authenticated,service_role;
-- Reproduz defaults legados amplos: a nova migração precisa revogar privilégios
-- de todas as tabelas/RPCs do plano, independentemente dos defaults anteriores.
alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
create table public.companies(id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id),name text not null,slug text not null unique,saldo_manual numeric);
create table public.company_users(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
  user_id uuid not null references auth.users(id),role text default 'operacional' check(role in ('admin','operacional','mestre','visitante')),
  active boolean default true,nome text,email text,senha_inicial text,permissions jsonb default '{}',unique(company_id,user_id));
-- Helpers públicos preservam o contrato legado: identidade vem da auth.uid real.
-- Ignoram active por desenho legado; plano/Caixa devem conferi-lo explicitamente.
create function public.auth_company_id() returns uuid language sql stable security definer set search_path=public as $$
  select company_id from public.company_users where user_id=auth.uid() limit 1
$$;
create function public.auth_user_role() returns text language sql stable security definer set search_path=public as $$
  select role from public.company_users where user_id=auth.uid() limit 1
$$;
grant usage on schema public,auth to anon,authenticated;
alter table public.company_users enable row level security;
create policy cu_select on public.company_users for select to authenticated using(company_id=public.auth_company_id());
grant select on public.company_users to authenticated;
create table public.obras(id uuid primary key,company_id uuid not null references public.companies(id),nome text,
  contrato_entrada numeric,data_entrega date,valor_venda numeric default 0,entrada_paga boolean default false,arquivada boolean default false);
create table public.notas_fiscais(id uuid primary key,company_id uuid not null references public.companies(id));
create table public.contas_pagar(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
  fornecedor text not null,descricao text default '',valor numeric not null,data_vencimento date not null,status text default 'pendente',data_pagamento date,
  obra_id uuid references public.obras(id),nota_id uuid references public.notas_fiscais(id),nota_ref text default '',tipo text,data_recebimento date);
create table public.repasses_cef(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
  obra_id uuid references public.obras(id),tipo text,valor numeric not null,data_credito date not null,
  medicao_numero integer not null default 0,observacao text default '',criado_por text,criado_em timestamp default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),tabela text not null,
  operacao text not null check(operacao in ('INSERT','UPDATE','DELETE')),registro_id uuid,dados_antes jsonb,dados_depois jsonb,
  usuario_id uuid,usuario_nome text,company_id uuid,ip text,created_at timestamptz default now());
create function public.fn_audit_log() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
  declare registro jsonb; empresa uuid; ator uuid:=auth.uid(); begin
    registro:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; empresa:=(registro->>'company_id')::uuid;
    insert into public.audit_logs(tabela,operacao,registro_id,dados_antes,dados_depois,usuario_id,usuario_nome,company_id)
    values(tg_table_name,tg_op,(registro->>'id')::uuid,case when tg_op<>'INSERT' then to_jsonb(old) end,
      case when tg_op<>'DELETE' then to_jsonb(new) end,ator,(select cu.nome from public.company_users cu where cu.user_id=ator and cu.company_id=empresa limit 1),empresa);
    if tg_op='DELETE' then return old; end if; return new;
  end $$;
create trigger audit_repasses_cef after insert or update or delete on public.repasses_cef for each row execute function public.fn_audit_log();
create trigger audit_contas_pagar after insert or update or delete on public.contas_pagar for each row execute function public.fn_audit_log();
alter table public.obras enable row level security;
alter table public.repasses_cef enable row level security;
alter table public.contas_pagar enable row level security;
create policy obras_select on public.obras for select to authenticated using(company_id=public.auth_company_id());
create policy obras_update on public.obras for update to authenticated using(company_id=public.auth_company_id() and public.auth_user_role() in ('admin','operacional')) with check(company_id=public.auth_company_id());
create policy repasses_select on public.repasses_cef for select to authenticated using(company_id=public.auth_company_id());
create policy repasses_insert on public.repasses_cef for insert to authenticated with check(company_id=public.auth_company_id() and public.auth_user_role() in ('admin','operacional'));
create policy repasses_update on public.repasses_cef for update to authenticated using(company_id=public.auth_company_id() and public.auth_user_role() in ('admin','operacional')) with check(company_id=public.auth_company_id());
create policy repasses_delete on public.repasses_cef for delete to authenticated using(company_id=public.auth_company_id() and public.auth_user_role() in ('admin','operacional'));
create policy cp_select on public.contas_pagar for select to authenticated using(company_id=public.auth_company_id());
create policy cp_update on public.contas_pagar for update to authenticated using(company_id=public.auth_company_id() and public.auth_user_role()='admin') with check(company_id=public.auth_company_id());
grant select,update on public.obras to authenticated;
grant select,insert,update,delete on public.repasses_cef to authenticated;
grant select,update on public.contas_pagar to authenticated;
create table public.lancamentos(id integer primary key,total numeric);
create table public.diarias_quinzenas(id integer primary key,status text);
create table public.distribuicoes(id integer primary key,qtd numeric);
insert into public.lancamentos values(1,91.23);
insert into public.diarias_quinzenas values(1,'fechada');
insert into public.distribuicoes values(1,7);
revoke all on public.lancamentos,public.diarias_quinzenas,public.distribuicoes,public.audit_logs from anon,authenticated;
commit;