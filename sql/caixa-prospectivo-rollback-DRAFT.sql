-- DRAFT LOCAL. Nao executar em banco real sem autorizacao e backup revisado.
-- Nao restaura saldos manuais nem cria ajustes compensatorios.
-- Rollback apenas de schema totalmente vazio, antes de qualquer uso/abertura.
-- Depois de qualquer dado, manter auditoria e preparar plano especifico revisado.
begin;
-- RPCs leem caixa_operacoes antes de contas/obrigacoes/movimentos. Seguir a mesma
-- ordem de bloqueio e manter os locks ate commit elimina corrida check/drop.
lock table public.caixa_operacoes,public.caixa_contas,public.caixa_obrigacoes,public.caixa_movimentos in access exclusive mode;
do $$
begin
  if exists(select 1 from public.caixa_operacoes) or exists(select 1 from public.caixa_contas)
     or exists(select 1 from public.caixa_obrigacoes) or exists(select 1 from public.caixa_movimentos) then
    raise exception 'Rollback bloqueado: ha dados auditados; preservar abertura/recibos/movimentos e revisar plano/backup especifico';
  end if;
end $$;
drop function public.caixa_registrar(uuid,jsonb);
drop function public.caixa_estado();
drop table public.caixa_movimentos;
drop table public.caixa_obrigacoes;
drop table public.caixa_contas;
drop table public.caixa_operacoes;
commit;
