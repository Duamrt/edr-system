-- Reversao local proposta. Exige frontend anterior e nenhuma NF pela RPC nova.
-- Depois do primeiro uso, conservar recibos e preparar correcao adiante.
begin;
do $$begin
  if exists(select 1 from public.notas_operacoes) then raise exception 'preservar recibos: reversao bloqueada apos uso'; end if;
  if to_regprocedure('public._estoque_tx_lotes(public.materiais,timestamp with time zone)') is not null then
    raise exception 'reverter primeiro o candidato de saidas que depende do calculo de NF';
  end if;
end $$;
drop function public.registrar_nota_fiscal_atomica(uuid,jsonb,jsonb,jsonb);
drop table public.notas_operacoes;
drop function public.custos_itens_nota(jsonb);
drop function public.ratear_centavos_nota(numeric,numeric[]);
commit;
