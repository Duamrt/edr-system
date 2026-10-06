-- DRAFT LOCAL: nao aplicar em banco real sem revisao e autorizacao expressa.
-- Impacto: cria quatro tabelas e duas RPCs, sem dados iniciais/privados.
-- Nao altera estrutura/policies legadas, saldo_manual, receita, custos ou folha.
-- Uma abertura informada inicia o controle por conta; nao concilia o historico.
-- Pagamento explicito atualiza APENAS status/data_pagamento em contas_pagar.
-- SECURITY DEFINER e necessario para escrita exclusiva via RPC, atomicidade e
-- atualizacao restrita da obrigacao. Toda entrada valida auth.uid/company/admin
-- e vinculo ativo em company_users (helpers legados nao verificam active);
-- search_path fixo; nenhum argumento escolhe empresa; PUBLIC/anon sem EXECUTE.
-- Antes da implantacao: conferir schema/roles/helpers legados, homologar auth
-- real e revisar privilegios de owner. Ensaio local: tests/caixa-prospectivo-db.test.js.
-- Rollback: caixa-prospectivo-rollback-DRAFT.sql bloqueia se houver qualquer dado.
begin;

do $$
begin
  if to_regprocedure('public.auth_company_id()') is null
     or to_regprocedure('public.auth_user_role()') is null
     or to_regprocedure('auth.uid()') is null then
    raise exception 'Pre-requisito: helpers de autenticacao EDR';
  end if;
  if to_regclass('public.companies') is null or to_regclass('public.contas_pagar') is null
     or to_regclass('public.company_users') is null then
    raise exception 'Pre-requisito: companies, company_users e contas_pagar';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public'
      and table_name='contas_pagar' and column_name in ('id','company_id','valor','status','data_pagamento','tipo','obra_id','nota_id','nota_ref')) <> 9 then
    raise exception 'Pre-requisito: conferir colunas legadas de contas_pagar';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='company_users'
      and ((column_name in ('user_id','company_id') and udt_name='uuid')
        or (column_name='role' and udt_name in ('text','varchar'))
        or (column_name='active' and udt_name='bool'))) <> 4 then
    raise exception 'Pre-requisito: company_users user_id/company_id uuid, role texto e active boolean';
  end if;
end $$;

create table public.caixa_operacoes (
  company_id uuid not null references public.companies(id), id uuid not null,
  usuario_id uuid not null, pedido jsonb not null, resultado jsonb not null,
  criado_em timestamptz not null default clock_timestamp(), primary key(company_id,id)
);
create table public.caixa_contas (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  codigo text not null check(codigo in ('banco','dinheiro')), nome text not null check(length(trim(nome)) between 1 and 100),
  abertura_centavos bigint not null check(abertura_centavos between 0 and 9007199254740991),
  corte_em timestamptz not null, fuso text not null, usuario_id uuid not null,
  criado_em timestamptz not null default clock_timestamp(), unique(company_id,codigo), unique(company_id,id)
);
create table public.caixa_obrigacoes (
  company_id uuid not null references public.companies(id), conta_pagar_id uuid not null,
  valor_centavos bigint not null check(valor_centavos>0), status_original text, data_pagamento_original date,
  usuario_id uuid not null, criado_em timestamptz not null default clock_timestamp(),
  primary key(company_id,conta_pagar_id)
  -- Sem FK para conta legada: preservar auditoria se removida; cancelar aborta
  -- explicitamente quando a obrigacao nao existe mais, sem fabricar reposicao.
);
create table public.caixa_movimentos (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  operacao_id uuid not null, tipo text not null check(tipo in ('entrada','saida','transferencia','pagamento')),
  conta_id uuid not null, destino_id uuid, valor_centavos bigint not null check(valor_centavos between 1 and 9007199254740991),
  data_efetiva date not null, hora_efetiva time, decisao_corte text not null check(decisao_corte in ('incluido_abertura','apos_corte')),
  afeta_saldo boolean not null, descricao text not null check(length(trim(descricao)) between 1 and 500),
  conta_pagar_id uuid, usuario_id uuid not null, criado_em timestamptz not null default clock_timestamp(),
  cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text,
  unique(company_id,operacao_id),
  foreign key(company_id,conta_id) references public.caixa_contas(company_id,id),
  foreign key(company_id,destino_id) references public.caixa_contas(company_id,id),
  foreign key(company_id,operacao_id) references public.caixa_operacoes(company_id,id) deferrable initially deferred,
  check((tipo='transferencia' and destino_id is not null and destino_id<>conta_id) or (tipo<>'transferencia' and destino_id is null)),
  check((tipo='pagamento')=(conta_pagar_id is not null)),
  check(afeta_saldo=(decisao_corte='apos_corte')),
  check((cancelado_em is null and cancelado_por is null and motivo_cancelamento is null)
    or (cancelado_em is not null and cancelado_por is not null and length(trim(motivo_cancelamento)) between 1 and 500))
);
create index caixa_movimentos_empresa_data on public.caixa_movimentos(company_id,data_efetiva);
create index caixa_movimentos_obrigacao on public.caixa_movimentos(company_id,conta_pagar_id) where tipo='pagamento';

alter table public.caixa_operacoes enable row level security;
alter table public.caixa_contas enable row level security;
alter table public.caixa_obrigacoes enable row level security;
alter table public.caixa_movimentos enable row level security;
revoke all on public.caixa_operacoes,public.caixa_contas,public.caixa_obrigacoes,public.caixa_movimentos from public,anon,authenticated;
create policy caixa_operacoes_admin on public.caixa_operacoes for select to authenticated
  using(caixa_operacoes.company_id=public.auth_company_id() and public.auth_user_role()='admin' and auth.uid() is not null
    and exists(select 1 from public.company_users cu where cu.user_id=auth.uid()
      and cu.company_id=caixa_operacoes.company_id and cu.role='admin' and cu.active is true));
create policy caixa_contas_admin on public.caixa_contas for select to authenticated
  using(caixa_contas.company_id=public.auth_company_id() and public.auth_user_role()='admin' and auth.uid() is not null
    and exists(select 1 from public.company_users cu where cu.user_id=auth.uid()
      and cu.company_id=caixa_contas.company_id and cu.role='admin' and cu.active is true));
create policy caixa_obrigacoes_admin on public.caixa_obrigacoes for select to authenticated
  using(caixa_obrigacoes.company_id=public.auth_company_id() and public.auth_user_role()='admin' and auth.uid() is not null
    and exists(select 1 from public.company_users cu where cu.user_id=auth.uid()
      and cu.company_id=caixa_obrigacoes.company_id and cu.role='admin' and cu.active is true));
create policy caixa_movimentos_admin on public.caixa_movimentos for select to authenticated
  using(caixa_movimentos.company_id=public.auth_company_id() and public.auth_user_role()='admin' and auth.uid() is not null
    and exists(select 1 from public.company_users cu where cu.user_id=auth.uid()
      and cu.company_id=caixa_movimentos.company_id and cu.role='admin' and cu.active is true));
grant select on public.caixa_operacoes,public.caixa_contas,public.caixa_obrigacoes,public.caixa_movimentos to authenticated;

create function public.caixa_estado()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c uuid:=public.auth_company_id(); contas jsonb; movimentos jsonb; pagamentos jsonb; total numeric;
begin
  if c is null or auth.uid() is null then raise exception 'Sessao sem empresa' using errcode='28000'; end if;
  if public.auth_user_role() is distinct from 'admin' or not exists(select 1 from public.company_users cu
      where cu.user_id=auth.uid() and cu.company_id=c and cu.role='admin' and cu.active is true) then
    raise exception 'Apenas administrador ativo acessa o caixa' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'codigo',a.codigo,'nome',a.nome,
    'abertura_centavos',a.abertura_centavos,'corte_em',a.corte_em,'fuso',a.fuso,'saldo_centavos',a.saldo) order by a.codigo),'[]'),
    coalesce(sum(a.saldo),0) into contas,total
  from (
    select ct.*,ct.abertura_centavos+coalesce((select sum(case
      when m.destino_id=ct.id then m.valor_centavos
      when m.tipo='entrada' then m.valor_centavos else -m.valor_centavos end)
      from public.caixa_movimentos m where m.company_id=c and m.cancelado_em is null and m.afeta_saldo
        and (m.conta_id=ct.id or m.destino_id=ct.id)
        and (m.data_efetiva < (now() at time zone ct.fuso)::date or
          (m.data_efetiva=(now() at time zone ct.fuso)::date and (m.hora_efetiva is null or
            (m.data_efetiva+m.hora_efetiva) at time zone ct.fuso<=now())))),0) saldo
    from public.caixa_contas ct where ct.company_id=c
  ) a;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'operacao_id',m.operacao_id,'tipo',m.tipo,
    'conta_id',m.conta_id,'destino_id',m.destino_id,'valor_centavos',m.valor_centavos,
    'data_efetiva',m.data_efetiva,'hora_efetiva',to_char(m.hora_efetiva,'HH24:MI'),'decisao_corte',m.decisao_corte,
    'descricao',m.descricao,'conta_pagar_id',m.conta_pagar_id,'cancelado_em',m.cancelado_em,
    'afeta_saldo',m.afeta_saldo and m.cancelado_em is null,'criado_em',m.criado_em,
    'motivo_cancelamento',m.motivo_cancelamento) order by m.data_efetiva desc,m.criado_em desc),'[]')
  into movimentos from public.caixa_movimentos m where m.company_id=c;
  select coalesce(jsonb_agg(jsonb_build_object('conta_pagar_id',p.id,'pago_centavos',p.pago,
    'restante_centavos',case when p.status='cancelado' then 0 else greatest(0,p.valor-p.pago) end)),'[]')
  into pagamentos from (
    select cp.id,cp.status,round(cp.valor*100) valor,
      case when o.conta_pagar_id is null and cp.status='pago' then round(cp.valor*100)
        else coalesce((select sum(m.valor_centavos) from public.caixa_movimentos m
          where m.company_id=c and m.conta_pagar_id=cp.id and m.cancelado_em is null),0) end pago
    from public.contas_pagar cp left join public.caixa_obrigacoes o on o.company_id=c and o.conta_pagar_id=cp.id
    where cp.company_id=c and coalesce(cp.tipo,'') not like 'reembolso%'
  ) p;
  if abs(total)>9007199254740991 or exists(select 1 from jsonb_array_elements(contas)
      where abs((value->>'saldo_centavos')::numeric)>9007199254740991) then
    raise exception 'Saldo ou total fora da faixa segura em centavos';
  end if;
  return jsonb_build_object('company_id',c,'contas',contas,'movimentos',movimentos,'pagamentos',pagamentos,'total_centavos',total);
end $$;

create function public.caixa_registrar(p_operacao uuid,p_pedido jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); recibo public.caixa_operacoes%rowtype;
  ct public.caixa_contas%rowtype; m public.caixa_movimentos%rowtype; cp public.contas_pagar%rowtype;
  snap public.caixa_obrigacoes%rowtype; item jsonb; acao text; tipo text; nome text; fuso text;
  corte timestamptz; local_corte timestamp; conta uuid; destino uuid; cp_id uuid; valor bigint; dt date; hr time;
  efetivo timestamptz; decisao text; afeta boolean; descr text; motivo text; resultado jsonb;
  soma numeric; ultima date; total_cp bigint; status_esperado text; data_esperada date;
  saldo_maior numeric; total_saldo numeric;
begin
  if c is null or ator is null then raise exception 'Sessao sem empresa' using errcode='28000'; end if;
  if public.auth_user_role() is distinct from 'admin' or not exists(select 1 from public.company_users cu
      where cu.user_id=ator and cu.company_id=c and cu.role='admin' and cu.active is true) then
    raise exception 'Apenas administrador ativo registra caixa' using errcode='42501';
  end if;
  if p_operacao is null or p_pedido is null or jsonb_typeof(p_pedido)<>'object' or p_pedido ? 'company_id' then
    raise exception 'Pedido invalido';
  end if;
  -- Serializa a empresa inteira: aberturas, retry, transferencias e parciais.
  -- Lock transacional nao altera companies nem protege por timestamp de cadastro.
  perform pg_advisory_xact_lock(hashtextextended(c::text||':caixa-prospectivo',0));
  select * into recibo from public.caixa_operacoes where company_id=c and id=p_operacao;
  if found then
    if recibo.pedido is distinct from p_pedido then raise exception 'Operacao ja usada com dados diferentes'; end if;
    return recibo.resultado;
  end if;
  acao:=p_pedido->>'action';
  if acao='abertura' then
    if exists(select 1 from public.caixa_contas where company_id=c) then raise exception 'Abertura ja declarada e imutavel'; end if;
    if coalesce(p_pedido->>'corte_local','') !~ '^\d{4}-\d{2}-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]$'
       or jsonb_typeof(p_pedido->'contas') is distinct from 'array' then raise exception 'Abertura invalida'; end if;
    if jsonb_array_length(p_pedido->'contas')<>2 then raise exception 'Informe banco e dinheiro na mesma abertura'; end if;
    fuso:=p_pedido->>'fuso';
    if not exists(select 1 from pg_timezone_names where name=fuso) then raise exception 'Fuso invalido'; end if;
    local_corte:=(p_pedido->>'corte_local')::timestamp;
    corte:=local_corte at time zone fuso;
    if corte>now() then raise exception 'Marco de abertura nao pode estar no futuro'; end if;
    for item in select value from jsonb_array_elements(p_pedido->'contas') loop
      if coalesce(item->>'codigo','') not in ('banco','dinheiro') or coalesce(item->>'saldo_centavos','') !~ '^\d+$' then
        raise exception 'Conta ou saldo inicial invalido';
      end if;
      valor:=(item->>'saldo_centavos')::bigint; nome:=trim(item->>'nome');
      insert into public.caixa_contas(company_id,codigo,nome,abertura_centavos,corte_em,fuso,usuario_id)
        values(c,item->>'codigo',nome,valor,corte,fuso,ator);
    end loop;
    resultado:=jsonb_build_object('company_id',c,'operacao_id',p_operacao,'acao',acao);
  elsif acao in ('movimento','cancelar') then
    if (select count(*) from public.caixa_contas where company_id=c)<>2 then raise exception 'Declare a abertura antes de movimentar'; end if;
    if acao='movimento' then
      tipo:=p_pedido->>'tipo';
      if tipo is null or tipo not in ('entrada','saida','transferencia','pagamento') then raise exception 'Tipo de movimento invalido'; end if;
      conta:=(p_pedido->>'conta_id')::uuid; destino:=nullif(p_pedido->>'destino_id','')::uuid;
      cp_id:=nullif(p_pedido->>'conta_pagar_id','')::uuid;
      select * into ct from public.caixa_contas where company_id=c and id=conta;
      if not found then raise exception 'Conta indisponivel nesta empresa'; end if;
      if (tipo='transferencia' and (destino is null or destino=conta or not exists(select 1 from public.caixa_contas where company_id=c and id=destino)))
         or (tipo<>'transferencia' and destino is not null) then raise exception 'Destino de transferencia invalido'; end if;
      if (tipo='pagamento') is distinct from (cp_id is not null) then raise exception 'Vinculo de pagamento invalido'; end if;
      if coalesce(p_pedido->>'valor_centavos','') !~ '^\d+$' then raise exception 'Valor deve ser inteiro em centavos'; end if;
      valor:=(p_pedido->>'valor_centavos')::bigint;
      if valor<=0 or valor>9007199254740991 then raise exception 'Valor invalido'; end if;
      if coalesce(p_pedido->>'data_efetiva','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data efetiva invalida'; end if;
      dt:=(p_pedido->>'data_efetiva')::date;
      if nullif(p_pedido->>'hora_efetiva','') is not null then
        if p_pedido->>'hora_efetiva' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Hora efetiva invalida'; end if;
        hr:=(p_pedido->>'hora_efetiva')::time;
      end if;
      if dt>(now() at time zone ct.fuso)::date or (hr is not null and (dt+hr) at time zone ct.fuso>now()) then
        raise exception 'Movimento efetivo nao pode estar no futuro';
      end if;
      decisao:=nullif(p_pedido->>'decisao_corte',''); local_corte:=ct.corte_em at time zone ct.fuso;
      if dt=local_corte::date and hr is null then
        if decisao is null or decisao not in ('incluido_abertura','apos_corte') then
          raise exception 'Dia do marco sem horario exige decisao explicita do corte';
        end if;
        afeta:=decisao='apos_corte';
      else
        efetivo:=case when hr is not null then (dt+hr) at time zone ct.fuso else dt::timestamp at time zone ct.fuso end;
        afeta:=efetivo>ct.corte_em;
        if decisao is not null and decisao is distinct from (case when afeta then 'apos_corte' else 'incluido_abertura' end) then
          raise exception 'Decisao do corte contradiz a data/hora efetiva';
        end if;
        decisao:=case when afeta then 'apos_corte' else 'incluido_abertura' end;
      end if;
      descr:=trim(p_pedido->>'descricao');
      if coalesce(length(descr),0) not between 1 and 500 then raise exception 'Descricao obrigatoria (ate 500 caracteres)'; end if;
    else
      select * into m from public.caixa_movimentos where company_id=c and id=(p_pedido->>'movimento_id')::uuid for update;
      if not found then raise exception 'Movimento indisponivel nesta empresa'; end if;
      if m.cancelado_em is not null then raise exception 'Movimento ja cancelado'; end if;
      motivo:=trim(p_pedido->>'motivo');
      if coalesce(length(motivo),0) not between 1 and 500 then raise exception 'Motivo de cancelamento obrigatorio'; end if;
      tipo:=m.tipo; cp_id:=m.conta_pagar_id;
    end if;
    if tipo='pagamento' then
      select * into cp from public.contas_pagar where company_id=c and id=cp_id for update;
      if not found then raise exception 'Obrigacao removida ou indisponivel nesta empresa'; end if;
      if coalesce(cp.tipo,'') like 'reembolso%' then raise exception 'Reembolso e entrada, nao pagamento'; end if;
      -- Conta avulsa vinculada a obra nao comprova custo. O admin declara que o
      -- custo foi tratado separadamente; a declaracao fica no recibo auditado.
      -- Nenhum lancamento/DRE e criado por esta RPC de caixa.
      if acao='movimento' and cp.obra_id is not null and cp.nota_id is null
         and nullif(trim(cp.nota_ref),'') is null
         and (p_pedido->'custo_confirmado') is distinct from 'true'::jsonb then
        raise exception 'Confirme o custo da conta avulsa na obra antes de pagar';
      end if;
      if lower(coalesce(cp.status,'')) in ('cancelado','reembolsado') then raise exception 'Obrigacao cancelada ou encerrada'; end if;
      if cp.valor is null or cp.valor<=0 or cp.valor::text in ('NaN','Infinity','-Infinity') or round(cp.valor*100)>9007199254740991 then raise exception 'Valor da obrigacao invalido'; end if;
      total_cp:=round(cp.valor*100)::bigint;
      select * into snap from public.caixa_obrigacoes where company_id=c and conta_pagar_id=cp_id;
      if not found then
        if acao='cancelar' then raise exception 'Snapshot da obrigacao ausente'; end if;
        if lower(coalesce(cp.status,''))='pago' then raise exception 'Obrigacao ja paga no legado; nao repetir pagamento'; end if;
        insert into public.caixa_obrigacoes(company_id,conta_pagar_id,valor_centavos,status_original,data_pagamento_original,usuario_id)
          values(c,cp_id,total_cp,cp.status,cp.data_pagamento,ator) returning * into snap;
      end if;
      select coalesce(sum(valor_centavos),0),max(data_efetiva) into soma,ultima from public.caixa_movimentos
        where company_id=c and conta_pagar_id=cp_id and cancelado_em is null;
      status_esperado:=case when soma>=snap.valor_centavos then 'pago' else snap.status_original end;
      data_esperada:=case when soma>=snap.valor_centavos then ultima else snap.data_pagamento_original end;
      if total_cp<>snap.valor_centavos or cp.status is distinct from status_esperado or cp.data_pagamento is distinct from data_esperada then
        raise exception 'Obrigacao alterada fora do caixa; revisar antes de continuar';
      end if;
      if acao='movimento' and valor>total_cp-soma then raise exception 'Pagamento excede o restante da obrigacao'; end if;
    end if;
    if acao='movimento' then
      insert into public.caixa_movimentos(company_id,operacao_id,tipo,conta_id,destino_id,valor_centavos,
        data_efetiva,hora_efetiva,decisao_corte,afeta_saldo,descricao,conta_pagar_id,usuario_id)
      values(c,p_operacao,tipo,conta,destino,valor,dt,hr,decisao,afeta,descr,cp_id,ator) returning * into m;
    else
      update public.caixa_movimentos set cancelado_em=clock_timestamp(),cancelado_por=ator,motivo_cancelamento=motivo
        where company_id=c and id=m.id returning * into m;
    end if;
    if tipo='pagamento' then
      select coalesce(sum(valor_centavos),0),max(data_efetiva) into soma,ultima from public.caixa_movimentos
        where company_id=c and conta_pagar_id=cp_id and cancelado_em is null;
      update public.contas_pagar set status=case when soma>=snap.valor_centavos then 'pago' else snap.status_original end,
        data_pagamento=case when soma>=snap.valor_centavos then ultima else snap.data_pagamento_original end
        where company_id=c and id=cp_id;
    end if;
    resultado:=jsonb_build_object('company_id',c,'operacao_id',p_operacao,'acao',acao,'movimento_id',m.id);
  else
    raise exception 'Acao invalida';
  end if;
  -- O contrato JSON usa centavos inteiros em JavaScript. Rejeitar a transacao
  -- inteira se a soma por conta ou o total sair da faixa exata de Number.
  select max(abs(a.saldo)),sum(a.saldo) into saldo_maior,total_saldo from (
    select cc_limite.abertura_centavos+coalesce((select sum(case
      when mv.destino_id=cc_limite.id then mv.valor_centavos
      when mv.tipo='entrada' then mv.valor_centavos else -mv.valor_centavos end)
      from public.caixa_movimentos mv where mv.company_id=c and mv.cancelado_em is null and mv.afeta_saldo
        and (mv.conta_id=cc_limite.id or mv.destino_id=cc_limite.id)
        and (mv.data_efetiva < (now() at time zone cc_limite.fuso)::date or
          (mv.data_efetiva=(now() at time zone cc_limite.fuso)::date and (mv.hora_efetiva is null or
            (mv.data_efetiva+mv.hora_efetiva) at time zone cc_limite.fuso<=now())))),0) saldo
    from public.caixa_contas cc_limite where cc_limite.company_id=c
  ) a;
  if saldo_maior>9007199254740991 or abs(total_saldo)>9007199254740991 then
    raise exception 'Saldo ou total fora da faixa segura em centavos';
  end if;
  insert into public.caixa_operacoes(company_id,id,usuario_id,pedido,resultado) values(c,p_operacao,ator,p_pedido,resultado);
  return resultado;
end $$;
revoke all on function public.caixa_estado() from public,anon,authenticated;
revoke all on function public.caixa_registrar(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.caixa_estado(),public.caixa_registrar(uuid,jsonb) to authenticated;
commit;
