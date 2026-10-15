-- PREPARADO PARA REVISAO. Nova publicacao/migracao requer aprovacao especifica.
-- Base: pagamento_sem_abertura publicado em 15/10/2026. Nao altera dados existentes.
begin;
do $migration$
declare definicao text; trecho text;
begin
  if (select md5(btrim(replace(prosrc,chr(13),''),chr(32)||chr(10)||chr(9)))
      from pg_proc where oid='public.caixa_registrar(uuid,jsonb)'::regprocedure)
      is distinct from '58a3430cddabfb2d18a97f40e22e1b5a' then
    raise exception 'Versao de caixa_registrar divergente; revisar antes de aplicar';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.caixa_movimentos'::regclass and conname='caixa_movimentos_descricao_check')
      is distinct from 'CHECK (((length(TRIM(BOTH FROM descricao)) >= 1) AND (length(TRIM(BOTH FROM descricao)) <= 500)))' then
    raise exception 'Constraint de descricao divergente; revisar antes de aplicar';
  end if;
  definicao:=replace(pg_get_functiondef('public.caixa_registrar(uuid,jsonb)'::regprocedure),chr(13),'');
  trecho:=$old$descr:=trim(p_pedido->>'descricao');
      if coalesce(length(descr),0) not between 1 and 500 then raise exception 'Descricao obrigatoria (ate 500 caracteres)'; end if;$old$;
  if strpos(definicao,trecho)=0 then raise exception 'Validacao de descricao nao localizada'; end if;
  definicao:=replace(definicao,trecho,$new$descr:=trim(coalesce(p_pedido->>'descricao',''));
      if length(descr)>500 or (tipo<>'pagamento' and length(descr)=0) then raise exception 'Descricao obrigatoria para movimentos avulsos; limite de 500 caracteres'; end if;$new$);
  execute definicao;
end $migration$;
alter table public.caixa_movimentos drop constraint caixa_movimentos_descricao_check;
alter table public.caixa_movimentos add constraint caixa_movimentos_descricao_check
  check(length(trim(descricao))<=500 and (tipo='pagamento' or length(trim(descricao))>=1));
-- descricao continua NOT NULL: ausencia/null/vazio viram texto vazio apenas em pagamentos.
-- conta_pagar_id, recibos, locks, autoria, ACLs, RLS e demais validacoes permanecem iguais.
commit;
