-- CAT-VAL-01 complementar: fonte de preço informada pelo responsável do estoque.
-- Escopo fechado: 1 lançamento/distribuição de DISCO FERRO 4.1/2, R$ 3,50 por unidade.

begin;

create temporary table valoracao_disco on commit drop as
select
  l.company_id,
  l.id as lancamento_id,
  d.id as distribuicao_id,
  l.descricao,
  l.qtd as quantidade_lancamento,
  d.qtd as quantidade_distribuida,
  l.preco as preco_anterior,
  l.total as total_anterior,
  d.valor as valor_anterior,
  d.codigo_catalogo,
  3.50::numeric as preco_unitario_estimado,
  round(l.qtd * 3.50::numeric, 2) as total_novo,
  round(d.qtd * 3.50::numeric, 2) as valor_novo
from public.lancamentos l
join public.distribuicoes d on d.lancamento_id = l.id
where l.id = '7dd357a2-e79f-4395-ba5a-7f37bf21e4ba'
  and d.id = 'd8606aa8-4653-49c4-8a59-6b187b53a606'
  and l.company_id = '3d040713-320f-4639-8a0e-35f62ef10ba7'
  and l.preco = 0
  and l.total = 0
  and d.valor = 0
  and d.codigo_catalogo = '000533';

do $$
begin
  if (select count(*) from valoracao_disco) <> 1 then
    raise exception 'Disco pendente divergente; nenhuma alteração aplicada.';
  end if;

  if exists (
    select 1 from valoracao_disco
    where quantidade_lancamento <> quantidade_distribuida
       or quantidade_lancamento <> 1
       or total_novo <> 3.50
       or valor_novo <> 3.50
  ) then
    raise exception 'Quantidade ou valor do disco divergente; nenhuma alteração aplicada.';
  end if;
end $$;

insert into public.valoracoes_legado_custo (
  company_id, lancamento_id, distribuicao_id, codigo_origem, codigo_catalogo,
  descricao_origem, quantidade_lancamento, quantidade_distribuida,
  preco_unitario_estimado, total_lancamento_anterior, total_lancamento_novo,
  valor_distribuicao_anterior, valor_distribuicao_novo, fonte, metodo
)
select
  company_id, lancamento_id, distribuicao_id, codigo_catalogo, codigo_catalogo,
  descricao, quantidade_lancamento, quantidade_distribuida,
  preco_unitario_estimado, total_anterior, total_novo,
  valor_anterior, valor_novo,
  'Valor informado por Duam em 2026-08-18',
  'VALORACAO_ESTIMADA_LEGADO'
from valoracao_disco;

update public.lancamentos l
set
  preco = a.preco_unitario_estimado,
  total = a.total_novo,
  obs = concat_ws(' · ', nullif(l.obs, ''), 'VALORACAO ESTIMADA DE LEGADO 2026-08-18')
from valoracao_disco a
where l.id = a.lancamento_id
  and l.preco = 0
  and l.total = 0;

update public.distribuicoes d
set valor = a.valor_novo
from valoracao_disco a
where d.id = a.distribuicao_id
  and d.valor = 0;

do $$
begin
  if (select count(*) from public.valoracoes_legado_custo where distribuicao_id = 'd8606aa8-4653-49c4-8a59-6b187b53a606') <> 1 then
    raise exception 'Auditoria da valoração do disco não foi registrada.';
  end if;

  if exists (
    select 1
    from valoracao_disco a
    join public.lancamentos l on l.id = a.lancamento_id
    join public.distribuicoes d on d.id = a.distribuicao_id
    where l.preco <> 3.50 or l.total <> 3.50 or d.valor <> 3.50
  ) then
    raise exception 'Valoração do disco divergente da auditoria.';
  end if;
end $$;

commit;
