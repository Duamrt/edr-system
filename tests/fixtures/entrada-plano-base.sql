-- Somente ensaio local novo: nenhum dado ou credencial reais.
alter table public.company_users add column nome text, add column email text;
create table public.obras(id uuid primary key, company_id uuid not null references companies(id),
  contrato_entrada numeric, data_entrega date, nome text, valor_venda numeric default 0);
create table public.repasses_cef(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),
  obra_id uuid not null references obras(id),tipo text not null,valor numeric not null,data_credito date,
  criado_por text,criado_em timestamp default now(),medicao_numero integer default 0,observacao text default '');
alter table public.obras enable row level security;
alter table public.repasses_cef enable row level security;
create policy obras_ensaio on public.obras to authenticated using(company_id=public.auth_company_id())
  with check(company_id=public.auth_company_id() and public.auth_user_role() in ('admin','operacional'));
create policy repasses_ensaio on public.repasses_cef to authenticated using(company_id=public.auth_company_id())
  with check(company_id=public.auth_company_id() and public.auth_user_role() in ('admin','operacional'));
grant select,insert,update,delete on public.obras,public.repasses_cef to authenticated;
-- Trigger de auditoria legado já existe no banco real; reproduzido sem sobrescrever.
create table public.audit_repasses_cef_ensaio(id uuid default gen_random_uuid(),operacao text,antes jsonb,depois jsonb);
create function public.audit_repasses_cef_ensaio() returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_repasses_cef_ensaio(operacao,antes,depois)
    values(tg_op,case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
  if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger audit_repasses_cef after insert or update or delete on public.repasses_cef for each row execute function public.audit_repasses_cef_ensaio();
