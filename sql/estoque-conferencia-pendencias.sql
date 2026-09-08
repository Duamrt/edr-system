-- EST-CONF-01: fila de conferencia SOMENTE LEITURA para a empresa da sessao.
-- Requer EST-TX-01 instalado no ambiente consultado e sessao autenticada.
-- Nao usar como baixa de pendencia, prova de origem ou autorizacao de devolucao.
-- Uma entrada/contagem posterior nao encerra automaticamente a pendencia.
select
  o.id as pendencia_id,
  o.company_id,
  o.material_id,
  m.codigo as codigo_material,
  m.nome as material,
  m.unidade,
  d.id as distribuicao_id,
  d.obra_id,
  d.obra_nome,
  d.etapa,
  d.estoque_efetivo_em as saida_efetiva_em,
  d.criado_em as saida_cadastrada_em,
  d.qtd as quantidade_saida,
  o.qtd as quantidade_sem_origem,
  o.custo as custo_estimado_sem_origem,
  d.lancamento_id,
  d.valor as valor_total_saida,
  'aguarda_comprovacao'::text as situacao
from public.estoque_saida_origens o
join public.distribuicoes d on d.company_id=o.company_id and d.id=o.distribuicao_id
join public.materiais m on m.company_id=o.company_id and m.id=o.material_id
where o.company_id=public.auth_company_id()
  and o.tipo='sem_origem'
order by d.estoque_efetivo_em, d.id, o.id;
