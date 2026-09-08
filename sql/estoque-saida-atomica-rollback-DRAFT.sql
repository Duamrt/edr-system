-- EST-TX-01 — REVERSAO LOCAL PROPOSTA, NAO APLICADA.
-- Somente antes da primeira operacao atomica. Depois dela, conservar schema,
-- origens e idempotencia; preparar roll-forward/estorno com revisao humana.
begin;
-- BEGIN ESTOQUE TX ROLLBACK
do $$
begin
  if exists(select 1 from public.estoque_operacoes) or exists(select 1 from public.estoque_saida_origens) or exists(select 1 from public.estoque_regularizacoes) then
    raise exception 'reversao bloqueada: preservar historico atomico e preparar roll-forward';
  end if;
end $$;
drop trigger a00_estoque_tx_lock on public.estoque_saida_origens;
drop trigger estoque_tx_origens_historico on public.estoque_saida_origens;
drop table public.estoque_regularizacoes;
drop function public.propor_regularizacao_estoque(uuid,text,uuid,integer,numeric);
drop function public.regularizar_origem_estoque(uuid,uuid,text,uuid,integer,numeric,text,text,text,text);
drop function public._estoque_tx_admin_regularizacao();
drop function public._estoque_tx_auditoria_imutavel();
drop trigger a00_estoque_tx_lock on public.notas_fiscais;
drop trigger z90_estoque_tx_proteger on public.notas_fiscais;
drop trigger a00_estoque_tx_lock on public.entradas_diretas;
drop trigger z90_estoque_tx_proteger on public.entradas_diretas;
drop trigger a00_estoque_tx_lock on public.ajustes_estoque;
drop trigger z90_estoque_tx_proteger on public.ajustes_estoque;
drop trigger a00_estoque_tx_lock on public.distribuicoes;
drop trigger z90_estoque_tx_proteger on public.distribuicoes;
drop trigger a00_estoque_tx_lock on public.lancamentos;
drop trigger z90_estoque_tx_proteger on public.lancamentos;
drop trigger a00_estoque_tx_lock on public.materiais;
drop trigger z90_estoque_tx_proteger on public.materiais;
drop trigger zz_estoque_tx_devolucao on public.notas_fiscais;
drop trigger a10_estoque_tx_exigir_rpc on public.distribuicoes;
drop trigger estoque_tx_dist_invariante on public.distribuicoes;
drop trigger estoque_tx_origens_invariante on public.estoque_saida_origens;
drop trigger estoque_tx_nf_historico on public.notas_fiscais;
drop trigger estoque_tx_ed_historico on public.entradas_diretas;
drop trigger estoque_tx_aj_historico on public.ajustes_estoque;
drop trigger estoque_tx_dist_historico on public.distribuicoes;
drop trigger estoque_tx_lanc_historico on public.lancamentos;
drop trigger estoque_tx_mat_historico on public.materiais;
drop function public.estoque_operacao_status();
drop function public.registrar_saida_estoque_atomica(uuid,uuid,uuid,numeric,timestamptz,text,text,text,uuid,text,numeric,numeric);
drop function public._estoque_tx_validar_historico();
drop function public._estoque_tx_invariante();
drop function public._estoque_tx_proteger();
drop function public._estoque_tx_devolucao();
drop function public._estoque_tx_exigir_rpc();
drop function public._estoque_tx_lotes(public.materiais,timestamptz);
drop function public._estoque_tx_recompor(public.materiais,timestamptz,uuid,jsonb);
drop function public._estoque_tx_consumir(jsonb,numeric,text);
drop function public._estoque_tx_liquido(jsonb);
drop function public._estoque_tx_real(text,text);
drop function public._estoque_tx_momento(date,timestamptz);
drop function public._estoque_tx_confere(text,text,public.materiais);
drop function public._estoque_tx_nome(text);
drop function public._estoque_tx_num(jsonb,text[]);
drop function public._estoque_tx_serializar();
drop function public._estoque_tx_lock(uuid);
drop table public.estoque_saida_origens;
drop table public.estoque_operacoes;
drop table public.estoque_transacao_config;
alter table public.distribuicoes drop column estoque_efetivo_em;
drop index public.estoque_tx_dist_empresa_id;
drop index public.estoque_tx_nf_empresa_id;
drop index public.estoque_tx_ed_empresa_id;
drop index public.estoque_tx_aj_empresa_id;
drop index public.estoque_tx_mat_empresa_id;
-- END ESTOQUE TX ROLLBACK
rollback;
