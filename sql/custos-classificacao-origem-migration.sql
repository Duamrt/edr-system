-- Separa custo da obra padrao, adicional especifico e historico nao classificado.
-- Aplicada no banco EDR (mepzoxoahpwcvvlymlfh) em 2026-08-25 via apply_migration.
begin;

alter table public.lancamentos
  add column if not exists destino_custo text not null default 'nao_classificado',
  add column if not exists adicional_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lancamentos_destino_custo_check'
      and conrelid = 'public.lancamentos'::regclass
  ) then
    alter table public.lancamentos
      add constraint lancamentos_destino_custo_check
      check (destino_custo in ('padrao', 'adicional', 'nao_classificado'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lancamentos_adicional_coerente_check'
      and conrelid = 'public.lancamentos'::regclass
  ) then
    alter table public.lancamentos
      add constraint lancamentos_adicional_coerente_check
      check (
        (destino_custo = 'adicional' and adicional_id is not null)
        or (destino_custo <> 'adicional' and adicional_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lancamentos_adicional_id_fkey'
      and conrelid = 'public.lancamentos'::regclass
  ) then
    alter table public.lancamentos
      add constraint lancamentos_adicional_id_fkey
      foreign key (adicional_id)
      references public.obra_adicionais(id)
      on delete restrict;
  end if;
end;
$$;

create or replace function public.validar_destino_custo_lancamento()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
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
$$;

drop trigger if exists trg_validar_destino_custo_lancamento on public.lancamentos;
create trigger trg_validar_destino_custo_lancamento
before insert or update of company_id, obra_id, destino_custo, adicional_id
on public.lancamentos
for each row execute function public.validar_destino_custo_lancamento();

drop index if exists public.lancamentos_adicional_id_idx;
create index lancamentos_adicional_id_idx
  on public.lancamentos(adicional_id, company_id)
  where adicional_id is not null;

drop index if exists public.lancamentos_mao_unico;
create unique index lancamentos_mao_unico
  on public.lancamentos(
    company_id,
    obra_id,
    obs
  )
  where etapa = '28_mao'
    and obs is not null
    and obs <> '';

commit;
