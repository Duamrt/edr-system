-- Rollback somente antes de uso. Não remove histórico nem dados de produção.
-- Depois do primeiro registro: preservar schema/ledger, reverter frontend ou
-- aplicar correção para frente após conferência de backup e trilha auditada.
-- NOWAIT recusa financeiro/DDL em uso (55P03), sem encerrar clientes ou forcar locks.
-- Em erro execute ROLLBACK; tente novamente apenas em janela vazia autorizada.
begin;
lock table public.entrada_plano_operacoes,public.entrada_planos,public.entrada_plano_parcelas,
 public.entrada_plano_propostas,public.entrada_plano_recebimentos,public.entrada_plano_historico,
 public.entrada_plano_responsaveis,public.obras,public.repasses_cef,public.caixa_movimentos in access exclusive mode nowait;
do $$
begin
 if exists(select 1 from public.entrada_planos) or exists(select 1 from public.entrada_plano_operacoes)
   or exists(select 1 from public.entrada_plano_parcelas) or exists(select 1 from public.entrada_plano_propostas)
   or exists(select 1 from public.entrada_plano_recebimentos) or exists(select 1 from public.entrada_plano_historico)
   or exists(select 1 from public.entrada_plano_responsaveis) then
   raise exception 'Rollback bloqueado: ha configuracao ou dados auditados; preservar e revisar recuperacao para frente';
 end if;
end $$;
drop trigger entrada_plano_guard_obra on public.obras;
drop trigger entrada_plano_guard_repasse on public.repasses_cef;
drop trigger entrada_plano_guard_caixa on public.caixa_movimentos;
drop function public.entrada_plano_operar(uuid,uuid,jsonb);
drop function public.entrada_plano_estado(uuid);
drop function public.entrada_plano_resumo();
drop function public.entrada_plano_avisos(date);
drop function public.entrada_plano_guard_obra();
drop function public.entrada_plano_guard_repasse();
drop function public.entrada_plano_guard_caixa();
drop function public.entrada_plano_cotar(uuid,bigint,date);
drop function public.entrada_plano_cotar_estorno(uuid,bigint);
drop function public.entrada_plano_validar(uuid,jsonb,date);
drop function public.entrada_plano_linha(uuid);
drop table public.entrada_plano_operacoes,public.entrada_plano_historico,public.entrada_plano_recebimentos,
 public.entrada_plano_propostas,public.entrada_plano_parcelas,public.entrada_planos,public.entrada_plano_responsaveis;
drop function public.entrada_plano_imutavel();
commit;
