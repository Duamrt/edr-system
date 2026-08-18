-- Valoração estimada de saídas históricas sem custo.
-- Escopo fechado: somente EDR Engenharia, 90 distribuições / 90 lançamentos
-- consistentes e simultaneamente zerados em 18/08/2026.
-- Dez lançamentos com distribuição duplicada ficam fora deste lote.
-- Não altera estoque, valor médio, notas fiscais, nem lançamentos já precificados.

begin;

create table if not exists public.valoracoes_legado_custo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lancamento_id uuid not null,
  distribuicao_id uuid not null unique,
  codigo_origem text not null,
  codigo_catalogo text not null,
  descricao_origem text not null,
  quantidade_lancamento numeric not null,
  quantidade_distribuida numeric not null,
  preco_unitario_estimado numeric not null check (preco_unitario_estimado > 0),
  total_lancamento_anterior numeric not null,
  total_lancamento_novo numeric not null,
  valor_distribuicao_anterior numeric not null,
  valor_distribuicao_novo numeric not null,
  fonte text not null,
  metodo text not null default 'VALORACAO_ESTIMADA_LEGADO',
  aplicado_em timestamptz not null default now()
);

alter table public.valoracoes_legado_custo enable row level security;
alter table public.valoracoes_legado_custo force row level security;
revoke all on public.valoracoes_legado_custo from anon, authenticated;

drop policy if exists valoracoes_legado_custo_select_company on public.valoracoes_legado_custo;
create policy valoracoes_legado_custo_select_company
on public.valoracoes_legado_custo
for select to authenticated
using (company_id = public.auth_company_id());
grant select on public.valoracoes_legado_custo to authenticated;

create temporary table valoracao_base on commit drop as
with base as (
  select
    l.id as lancamento_id,
    d.id as distribuicao_id,
    l.descricao,
    l.qtd as qtd_lancamento,
    d.qtd as qtd_distribuida,
    l.preco as preco_anterior,
    l.total as total_lancamento_anterior,
    d.valor as valor_distribuicao_anterior,
    coalesce(nullif(d.codigo_catalogo, ''), substring(l.descricao from '^([0-9]{4,6})')) as codigo_origem
  from public.lancamentos l
  join public.distribuicoes d on d.lancamento_id = l.id
  where l.company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
    and d.company_id = l.company_id
    and l.total = 0
    and d.valor = 0
    and l.qtd > 0
    and d.qtd > 0
), precificada as (
  select
    b.*,
    case when b.codigo_origem = '000297' then '000050' else b.codigo_origem end as codigo_catalogo,
    case
      when b.codigo_origem = '000297' then 28.50::numeric
      when b.codigo_origem = '000169' then 44.50::numeric
      else m.valor_referencia_manual
    end as preco_unitario_estimado,
    case
      when b.codigo_origem = '000297' then 'NF 000200305 e NF 219025/1: R$ 28,50/un'
      when b.codigo_origem = '000169' then 'NF 284/1 e NF 285/1: R$ 44,50/SC'
      else coalesce(m.valor_ref_fonte, 'referencia manual do catalogo')
    end as fonte,
    case when b.codigo_origem = '000297' then '000050 · MALHA POP LEVE 3X2' else b.descricao end as descricao_nova
  from base b
  left join public.materiais m
    on m.company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
   and m.codigo = case when b.codigo_origem = '000297' then '000050' else b.codigo_origem end
)
select
  p.*,
  round(p.qtd_lancamento * p.preco_unitario_estimado, 2) as total_lancamento_novo,
  round(p.qtd_distribuida * p.preco_unitario_estimado, 2) as valor_distribuicao_novo
from precificada p
where p.preco_unitario_estimado is not null;

create temporary table valoracao_alvo on commit drop as
select b.*
from valoracao_base b
join (
  select lancamento_id
  from valoracao_base
  group by lancamento_id
  having round(sum(qtd_distribuida), 6) = round(max(qtd_lancamento), 6)
     and count(distinct preco_unitario_estimado) = 1
) consistente using (lancamento_id);

do $$
declare
  v_linhas integer;
  v_lancamentos integer;
  v_total numeric;
  v_base_linhas integer;
  v_base_lancamentos integer;
  v_base_total numeric;
begin
  select count(*), count(distinct lancamento_id), round(sum(total_lancamento_novo), 2)
    into v_base_linhas, v_base_lancamentos, v_base_total
  from valoracao_base;

  if v_base_linhas <> 110 or v_base_lancamentos <> 100 or v_base_total <> 6301.38 then
    raise exception 'Base de valoração divergente: linhas %, lançamentos %, total %', v_base_linhas, v_base_lancamentos, v_base_total;
  end if;

  select count(*), count(distinct lancamento_id), round(sum(total_lancamento_novo), 2)
    into v_linhas, v_lancamentos, v_total
  from valoracao_alvo;

  if v_linhas <> 90 or v_lancamentos <> 90 or v_total <> 6003.82 then
    raise exception 'Escopo de valoração divergente: linhas %, lançamentos %, total %', v_linhas, v_lancamentos, v_total;
  end if;

  if (select count(*) from valoracao_base) - v_linhas <> 20
     or (select count(distinct lancamento_id) from valoracao_base) - v_lancamentos <> 10 then
    raise exception 'A fila de distribuições duplicadas mudou; nenhuma valoração foi aplicada.';
  end if;
end $$;

insert into public.valoracoes_legado_custo (
  company_id, lancamento_id, distribuicao_id, codigo_origem, codigo_catalogo,
  descricao_origem, quantidade_lancamento, quantidade_distribuida,
  preco_unitario_estimado, total_lancamento_anterior, total_lancamento_novo,
  valor_distribuicao_anterior, valor_distribuicao_novo, fonte
)
select
  '3d040713-320f-4639-8a0e-35f62ef10ba7', lancamento_id, distribuicao_id,
  codigo_origem, codigo_catalogo, descricao, qtd_lancamento, qtd_distribuida,
  preco_unitario_estimado, total_lancamento_anterior, total_lancamento_novo,
  valor_distribuicao_anterior, valor_distribuicao_novo, fonte
from valoracao_alvo;

update public.lancamentos l
set
  preco = a.preco_unitario_estimado,
  total = a.total_lancamento_novo,
  descricao = a.descricao_nova,
  obs = concat_ws(' · ', nullif(l.obs, ''), 'VALORACAO ESTIMADA DE LEGADO 2026-08-18')
from (
  select distinct on (lancamento_id)
    lancamento_id, preco_unitario_estimado, total_lancamento_novo, descricao_nova
  from valoracao_alvo
  order by lancamento_id
) a
where l.id = a.lancamento_id
  and l.total = 0
  and l.preco = 0;

update public.distribuicoes d
set
  valor = a.valor_distribuicao_novo,
  codigo_catalogo = a.codigo_catalogo,
  item_desc = case when a.codigo_origem = '000297' then 'MALHA POP LEVE 3X2' else d.item_desc end
from valoracao_alvo a
where d.id = a.distribuicao_id
  and d.valor = 0;

do $$
begin
  if (select count(*) from public.valoracoes_legado_custo where company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7') <> 90 then
    raise exception 'Auditoria da valoração não registrou as 90 distribuições esperadas.';
  end if;

  if exists (
    select 1
    from public.lancamentos l
    join public.distribuicoes d on d.lancamento_id = l.id
    join public.valoracoes_legado_custo a on a.distribuicao_id = d.id
    where l.company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
      and (l.total <> a.total_lancamento_novo or d.valor <> a.valor_distribuicao_novo)
  ) then
    raise exception 'Valoração gravada diverge da auditoria.';
  end if;
end $$;

commit;
