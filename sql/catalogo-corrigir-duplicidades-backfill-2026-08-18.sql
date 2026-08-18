-- Remove somente as 10 distribuições duplicadas pelo backfill de 25/05/2026.
-- Em seguida, precifica os 10 lançamentos originais que ficaram fora de CAT-VAL-01.

begin;

create table if not exists public.correcoes_distribuicoes_legado (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  distribuicao_id uuid not null unique,
  lancamento_id uuid not null,
  registro_original jsonb not null,
  motivo text not null,
  corrigido_em timestamptz not null default now()
);

alter table public.correcoes_distribuicoes_legado enable row level security;
alter table public.correcoes_distribuicoes_legado force row level security;
revoke all on public.correcoes_distribuicoes_legado from anon, authenticated;

drop policy if exists correcoes_distribuicoes_legado_select_company on public.correcoes_distribuicoes_legado;
create policy correcoes_distribuicoes_legado_select_company
on public.correcoes_distribuicoes_legado
for select to authenticated
using (company_id = public.auth_company_id());
grant select on public.correcoes_distribuicoes_legado to authenticated;

create temporary table distribuicoes_duplicadas on commit drop as
select d.*
from public.distribuicoes d
where d.id in (
  'ef7f425e-a34b-4755-9164-35f2c20806a0',
  '4d1a4f0b-450b-49db-baf9-141854e6f895',
  '66be92ef-00c9-431f-aa9b-ba393fd80bd7',
  '5fad0290-30e3-44a7-ba72-db008b94303e',
  '92a41107-244c-4274-880e-3826b0b7c5a5',
  '3f9a33d5-f71f-4fde-a2a0-ca031338e1c6',
  '67f4f3ca-0c92-4963-9e33-1478be5e412d',
  '88972cdc-07fe-46b1-bca2-37b51e9bd42c',
  '0ffd64c5-936a-4776-bc2f-ee7a2a11dc00',
  '8dc89bc3-3d66-46e5-be98-9f414a8fcf66'
)
and d.company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
and d.criado_por = 'backfill_material_20260525'
and d.valor = 0;

create temporary table valoracao_origem on commit drop as
select
  l.id as lancamento_id,
  d.id as distribuicao_id,
  l.descricao,
  l.qtd as qtd_lancamento,
  d.qtd as qtd_distribuida,
  l.total as total_lancamento_anterior,
  d.valor as valor_distribuicao_anterior,
  d.codigo_catalogo,
  m.valor_referencia_manual as preco_unitario_estimado,
  coalesce(m.valor_ref_fonte, 'referencia manual do catalogo') as fonte,
  round(l.qtd * m.valor_referencia_manual, 2) as total_lancamento_novo,
  round(d.qtd * m.valor_referencia_manual, 2) as valor_distribuicao_novo
from public.lancamentos l
join public.distribuicoes d on d.lancamento_id = l.id
join public.materiais m
  on m.company_id = l.company_id
 and m.codigo = d.codigo_catalogo
where l.id in (select distinct lancamento_id from distribuicoes_duplicadas)
  and d.id not in (select id from distribuicoes_duplicadas)
  and l.company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and l.total = 0
  and l.preco = 0
  and d.valor = 0
  and m.valor_referencia_manual > 0;

do $$
declare
  v_duplicadas integer;
  v_origens integer;
  v_total numeric;
begin
  select count(*) into v_duplicadas from distribuicoes_duplicadas;
  if v_duplicadas <> 10 then
    raise exception 'Conjunto de duplicidades divergente: esperado 10, encontrado %', v_duplicadas;
  end if;

  select count(*), round(sum(valor_distribuicao_novo), 2)
    into v_origens, v_total
  from valoracao_origem;
  if v_origens <> 10 or v_total <> 148.78 then
    raise exception 'Conjunto de origens divergente: linhas %, total %', v_origens, v_total;
  end if;

  if exists (
    select 1
    from valoracao_origem
    group by lancamento_id, qtd_lancamento
    having round(sum(qtd_distribuida), 6) <> round(max(qtd_lancamento), 6)
  ) then
    raise exception 'A origem remanescente não fecha quantidade; nenhuma alteração aplicada.';
  end if;
end $$;

insert into public.correcoes_distribuicoes_legado (
  company_id, distribuicao_id, lancamento_id, registro_original, motivo
)
select
  company_id, id, lancamento_id, to_jsonb(distribuicoes_duplicadas),
  'Duplicidade de backfill: mesmo lançamento, obra, item, etapa, data e quantidade já presentes na distribuição original.'
from distribuicoes_duplicadas;

delete from public.distribuicoes d
using distribuicoes_duplicadas x
where d.id = x.id;

insert into public.valoracoes_legado_custo (
  company_id, lancamento_id, distribuicao_id, codigo_origem, codigo_catalogo,
  descricao_origem, quantidade_lancamento, quantidade_distribuida,
  preco_unitario_estimado, total_lancamento_anterior, total_lancamento_novo,
  valor_distribuicao_anterior, valor_distribuicao_novo, fonte
)
select
  '3d040713-320f-4639-8a0e-35f62ef10ba7', lancamento_id, distribuicao_id,
  codigo_catalogo, codigo_catalogo, descricao, qtd_lancamento, qtd_distribuida,
  preco_unitario_estimado, total_lancamento_anterior, total_lancamento_novo,
  valor_distribuicao_anterior, valor_distribuicao_novo, fonte
from valoracao_origem;

update public.lancamentos l
set
  preco = a.preco_unitario_estimado,
  total = a.total_lancamento_novo,
  obs = concat_ws(' · ', nullif(l.obs, ''), 'VALORACAO ESTIMADA DE LEGADO 2026-08-18')
from valoracao_origem a
where l.id = a.lancamento_id
  and l.total = 0
  and l.preco = 0;

update public.distribuicoes d
set valor = a.valor_distribuicao_novo
from valoracao_origem a
where d.id = a.distribuicao_id
  and d.valor = 0;

do $$
begin
  if (select count(*) from public.correcoes_distribuicoes_legado where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7') <> 10 then
    raise exception 'Auditoria da correção não registrou as 10 duplicidades.';
  end if;

  if (select count(*) from public.valoracoes_legado_custo where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7') <> 100 then
    raise exception 'Auditoria da valoração não registrou as 100 distribuições esperadas.';
  end if;

  if exists (
    select 1
    from valoracao_origem a
    join public.lancamentos l on l.id = a.lancamento_id
    join public.distribuicoes d on d.id = a.distribuicao_id
    where l.total <> a.total_lancamento_novo
       or d.valor <> a.valor_distribuicao_novo
  ) then
    raise exception 'A valoração remanescente diverge da auditoria.';
  end if;
end $$;

commit;
