-- Correcao aditiva apos entrada-plano-DRAFT.sql (SHA256 3751522F2989884E579591F8E52A424E6E7E364E0E5C3A4C92B750E140B2DF80).
-- Revalida autorizacao atual antes do replay. Nao altera recibos, snapshots, saldos,
-- repasses, caixa ou o contrato; nenhuma operacao financeira e executada por este patch.
-- Snapshot duravel pode conter Caixa: somente o proprio autor ainda admin ativo o le.
-- Responsavel trocado ainda admin pode ler historico proprio, mas nao repetir acao
-- para a qual a configuracao atual ja nao o autoriza. Mantem ordem de locks/UUID/payload.
begin;
alter policy entrada_plano_empresa on public.entrada_plano_operacoes
  using(company_id=public.auth_company_id() and usuario_id=auth.uid()
    and exists(select 1 from public.company_users cu where cu.user_id=auth.uid()
      and cu.company_id=entrada_plano_operacoes.company_id and cu.active is true and cu.role='admin'));

create or replace function public.entrada_plano_estado(p_obra_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
#variable_conflict use_variable
declare c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); role text:=public.auth_user_role();
  cp public.entrada_planos%rowtype; cfg public.entrada_plano_responsaveis%rowtype; o public.obras%rowtype;
  rows jsonb; receipts jsonb; requests jsonb; hist jsonb; available jsonb; contas jsonb:='[]';
  total bigint; original bigint; recebido bigint; cancelled bigint; nao_vinculado bigint; pode_receber boolean:=false;
begin
  if c is null or ator is null then raise exception 'Sessao sem empresa' using errcode='28000'; end if;
  if role is null or role not in ('admin','operacional') or not exists(select 1 from public.company_users
    where user_id=ator and company_id=c and active is true and company_users.role=role) then raise exception 'Perfil ativo sem permissao' using errcode='42501'; end if;
  -- AccessShare inicial uniforme com a ordem do rollback, inclusive em leitura STABLE.
  perform 1 from public.entrada_plano_operacoes limit 1;
  select * into o from public.obras where id=p_obra_id and company_id=c;
  if not found then raise exception 'Obra indisponivel nesta empresa' using errcode='42501'; end if;
  select * into cfg from public.entrada_plano_responsaveis where company_id=c;
  pode_receber:=coalesce(role='admin' and ator in (cfg.solicitante_id,cfg.aprovador_id),false);
  if pode_receber then select public.caixa_estado()->'contas' into contas; end if;
  select * into cp from public.entrada_planos where obra_id=p_obra_id and company_id=c;
  select coalesce(jsonb_agg(public.entrada_plano_linha(p.id) order by p.due nulls last,p.label,p.id),'[]') into rows
    from public.entrada_plano_parcelas p where obra_id=p_obra_id and company_id=c and ativa;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'rowId',r.row_id,'amount',r.amount,'principal',r.principal,
    'additionPaid',r.addition_paid,'cancelled',r.cancelled,'date',r.data_efetiva,'method',r.method,'actor',r.usuario_id,
    'repasse_id',r.repasse_id,'movimento_id',r.movimento_id,'reverses',r.reverses,'linked',r.vinculo_legado,
    'deliveryAtPayment',r.delivery_at_payment,'rule',r.regra,'at',r.criado_em,
    'available',case when r.amount>0 then r.amount+coalesce((select sum(inv.amount) from public.entrada_plano_recebimentos inv where inv.reverses=r.id),0) else 0 end)
      order by r.criado_em,r.id),'[]') into receipts from public.entrada_plano_recebimentos r where obra_id=p_obra_id and company_id=c;
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'kind',q.kind,'status',q.status,'version',q.revisao,'before',q.antes,
    'after',q.depois,'actor',q.solicitante_id,'actorName',coalesce((select nullif(trim(cu.nome),'') from public.company_users cu where cu.user_id=q.solicitante_id and cu.company_id=c limit 1),'Usuário identificado'),'why',q.motivo,'proposed',q.pedido,'at',q.criado_em,
    'approver',q.aprovador_id,'approverName',case when q.aprovador_id is not null then coalesce((select nullif(trim(cu.nome),'') from public.company_users cu where cu.user_id=q.aprovador_id and cu.company_id=c limit 1),'Usuário identificado') end,'decisionReason',q.motivo_decisao,'decidedAt',q.decidido_em) order by q.criado_em,q.id),'[]')
    into requests from public.entrada_plano_propostas q where obra_id=p_obra_id and company_id=c;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'type',h.tipo,'actor',h.ator_id,'actorName',coalesce((select nullif(trim(cu.nome),'') from public.company_users cu where cu.user_id=h.ator_id and cu.company_id=c limit 1),'Usuário identificado'),'why',h.motivo,
    'requestId',h.proposta_id,'before',h.antes,'after',h.depois,'at',h.criado_em) order by h.criado_em,h.id),'[]')
    into hist from public.entrada_plano_historico h where obra_id=p_obra_id and company_id=c;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'amount',round(r.valor*100)::bigint,'date',r.data_credito,'tipo',r.tipo) order by r.criado_em,r.id),'[]'),
    coalesce(sum(round(r.valor*100)),0)::bigint into available,nao_vinculado from public.repasses_cef r
    where r.company_id=c and r.obra_id=p_obra_id and r.tipo='entrada'
      and not exists(select 1 from public.entrada_plano_recebimentos rec where rec.repasse_id=r.id);
  select coalesce(sum((value->>'total')::bigint),0),coalesce(sum((value->>'base')::bigint),0),
    coalesce(sum((value->>'received')::bigint),0),coalesce(sum((value->>'cancelled')::bigint),0)
    into total,original,recebido,cancelled from jsonb_array_elements(rows);
  return jsonb_build_object('company_id',c,'obra_id',p_obra_id,
    'plano',jsonb_build_object('revisao',coalesce(cp.revisao,0),'delivery',cp.delivery,
      'stage',coalesce(cp.stage,'none'),'original',cp.original_centavos,'contrato_entrada',round(coalesce(o.contrato_entrada,0)*100)::bigint),
    'rows',rows,'receipts',receipts,'requests',requests,'history',hist,'contas',contas,'repasses_disponiveis',available,
    'permissions',jsonb_build_object('solicitar',coalesce(ator=cfg.solicitante_id and role='admin',false),
      'aprovar',coalesce(ator=cfg.aprovador_id and role='admin',false),'receber',pode_receber),
    'totals',jsonb_build_object('original',original,'agreed',total,'received',recebido+nao_vinculado,
      'receivedLinked',recebido,'unlinked',nao_vinculado,'remaining',greatest(0,total-recebido-nao_vinculado),
      'remainingRows',total-recebido,'delta',total-original,'cancelled',cancelled),
    'reminders',jsonb_build_object('configured',false,'lead_days',3));
end $$;

create or replace function public.entrada_plano_operar(p_operacao uuid,p_obra_id uuid,p_pedido jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
#variable_conflict use_variable
declare c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); role text:=public.auth_user_role();
  cfg public.entrada_plano_responsaveis%rowtype; cp public.entrada_planos%rowtype; o public.obras%rowtype;
  previous public.entrada_plano_operacoes%rowtype; proposal public.entrada_plano_propostas%rowtype;
  p public.entrada_plano_parcelas%rowtype; r public.entrada_plano_recebimentos%rowtype; rep public.repasses_cef%rowtype;
  typ text; why text; decision text; amount bigint; dt date; row_uuid uuid; rec_uuid uuid; rep_uuid uuid; mov_uuid uuid;
  before_state jsonb; after_state jsonb; quote jsonb; x jsonb; linha jsonb; caisse jsonb; ids uuid[]:='{}';
  base_sum bigint; delivery date; changed boolean; proposal_uuid uuid; perm_receber boolean;
begin
  if c is null or ator is null then raise exception 'Sessao sem empresa' using errcode='28000'; end if;
  if role is null or role not in ('admin','operacional') or not exists(select 1 from public.company_users
    where user_id=ator and company_id=c and active is true and company_users.role=role) then raise exception 'Perfil ativo sem permissao' using errcode='42501'; end if;
  if p_operacao is null or p_obra_id is null or jsonb_typeof(p_pedido) is distinct from 'object' or p_pedido ?| array['company_id','usuario_id','aprovador_id'] then raise exception 'Pedido invalido ou campos reservados'; end if;
  -- Acesso a operacoes antes de config/obra: nao retem lock legado enquanto aguarda DDL.
  perform 1 from public.entrada_plano_operacoes limit 1;
  select * into cfg from public.entrada_plano_responsaveis where company_id=c;
  if not found then raise exception 'Responsaveis Auth ainda nao configurados' using errcode='42501'; end if;
  -- Mesma ordem do Caixa: lock empresa primeiro, depois plano/obra; retry serial.
  perform pg_advisory_xact_lock(hashtextextended(c::text||':caixa-prospectivo',0));
  perform pg_advisory_xact_lock(hashtextextended(c::text||':entrada-plano:'||p_obra_id::text,0));

  -- Revalidar APOS eventual espera nos locks e ANTES de ler/devolver o recibo.
  -- Auth atual/config atual prevalecem sobre a autorizacao da primeira chamada.
  role:=public.auth_user_role();
  select * into cfg from public.entrada_plano_responsaveis where company_id=c;
  if not found then raise exception 'Responsaveis Auth ainda nao configurados' using errcode='42501'; end if;
  typ:=p_pedido->>'tipo';
  perm_receber:=coalesce(role='admin' and ator in (cfg.solicitante_id,cfg.aprovador_id),false);
  if role is distinct from 'admin' or not exists(select 1 from public.company_users
      where user_id=ator and company_id=c and active is true and company_users.role='admin')
     or typ is null or typ not in ('solicitar','solicitar_estorno','decidir','receber','vincular')
     or (typ in ('solicitar','solicitar_estorno') and ator<>cfg.solicitante_id)
     or (typ='decidir' and ator<>cfg.aprovador_id)
     or (typ in ('receber','vincular') and not perm_receber) then
    raise exception 'Identidade sem permissao atual para esta operacao' using errcode='42501';
  end if;

  select * into previous from public.entrada_plano_operacoes where company_id=c and id=p_operacao;
  if found then
    if previous.pedido is distinct from p_pedido or previous.obra_id<>p_obra_id or previous.usuario_id<>ator then raise exception 'Operacao ja usada com dados/ator diferentes'; end if;
    return previous.resultado;
  end if;
  select * into o from public.obras where id=p_obra_id and company_id=c for update;
  if not found then raise exception 'Obra indisponivel nesta empresa' using errcode='42501'; end if;
  why:=trim(p_pedido->>'motivo');
  if coalesce(length(why),0) not between 4 and 240 then raise exception 'Motivo obrigatorio de 4 a 240 caracteres';end if;
  select * into cp from public.entrada_planos where company_id=c and obra_id=p_obra_id for update;
  if not found then
    if typ<>'solicitar' then raise exception 'Solicite e aprove o primeiro plano';end if;
    if coalesce(o.contrato_entrada,0)<0 or o.contrato_entrada::text in ('NaN','Infinity','-Infinity') then raise exception 'Contrato legado invalido';end if;
    insert into public.entrada_planos(company_id,obra_id,original_centavos,contrato_anterior)
      values(c,p_obra_id,round(coalesce(o.contrato_entrada,0)*100)::bigint,o.contrato_entrada) returning * into cp;
  end if;
  if coalesce(p_pedido->>'revisao','') !~ '^\d+$' or (p_pedido->>'revisao')::integer<>cp.revisao then raise exception 'Revisao mudou; recarregue antes de continuar' using errcode='40001';end if;
  before_state:=public.entrada_plano_estado(p_obra_id)-'history'-'requests'-'receipts'-'contas';
  if typ='solicitar' then
    -- Antes do primeiro acordo, cadastro pode mudar pelo fluxo legado.
    -- Um pedido pendente permanece auditado: rejeitar antes de atualizar a base.
    if cp.stage='draft' and o.contrato_entrada is distinct from cp.contrato_anterior then
      if exists(select 1 from public.entrada_plano_propostas where obra_id=p_obra_id and status in ('pending','approved'))
        or exists(select 1 from public.entrada_plano_parcelas where obra_id=p_obra_id)
        or exists(select 1 from public.entrada_plano_recebimentos where obra_id=p_obra_id) then
        raise exception 'Rejeite os pedidos pendentes antes de atualizar o contrato original do rascunho';
      end if;
      if o.contrato_entrada is null or o.contrato_entrada<=0 or o.contrato_entrada::text in ('NaN','Infinity','-Infinity') then
        raise exception 'Contrato original atual invalido';
      end if;
      update public.entrada_planos set contrato_anterior=o.contrato_entrada,original_centavos=round(o.contrato_entrada*100)::bigint
        where obra_id=p_obra_id and company_id=c returning * into cp;
    end if;

    if nullif(p_pedido->>'delivery','') is not null then
      if p_pedido->>'delivery' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Entrega invalida';end if;
      delivery:=(p_pedido->>'delivery')::date;
    end if;
    base_sum:=public.entrada_plano_validar(p_obra_id,p_pedido->'rows',delivery);
    if (p_pedido->'rows') is not distinct from (select jsonb_agg(jsonb_build_object('id',id,'label',label,'base',base,
      'mode',mode,'rate',rate,'final',final,'due',due,'method',method) order by id) from public.entrada_plano_parcelas where obra_id=p_obra_id and ativa)
      and delivery is not distinct from cp.delivery then raise exception 'Nenhuma alteracao proposta'; end if;
    insert into public.entrada_plano_propostas(company_id,obra_id,kind,revisao,pedido,antes,depois,solicitante_id,motivo)
      values(c,p_obra_id,'terms',cp.revisao+1,p_pedido,before_state,jsonb_build_object('rows',p_pedido->'rows','delivery',delivery),ator,why)
      returning id into proposal_uuid;
  elsif typ='solicitar_estorno' then
    if cp.stage<>'confirmed' then raise exception 'Plano ainda nao aprovado';end if;
    select * into r from public.entrada_plano_recebimentos receipt where receipt.id=(p_pedido->>'receipt_id')::uuid and receipt.company_id=c and receipt.obra_id=p_obra_id and receipt.amount>0;
    if not found then raise exception 'Recebimento indisponivel nesta obra';end if;
    if coalesce(p_pedido->>'amount','') !~ '^\d+$' then raise exception 'Estorno deve ser inteiro em centavos';end if;
    amount:=(p_pedido->>'amount')::bigint;quote:=public.entrada_plano_cotar_estorno(r.id,amount);
    if coalesce(p_pedido->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data do estorno obrigatoria';end if;
    dt:=(p_pedido->>'date')::date;
    if dt<r.data_efetiva or dt>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data estorno anterior ao recebimento ou futura'; end if;
    if not exists(select 1 from public.caixa_contas where company_id=c and id=(p_pedido->>'conta_id')::uuid) then raise exception 'Conta do estorno indisponivel';end if;
    insert into public.entrada_plano_propostas(company_id,obra_id,kind,revisao,pedido,antes,depois,solicitante_id,motivo)
      values(c,p_obra_id,'reversal',cp.revisao+1,p_pedido,before_state,quote,ator,why) returning id into proposal_uuid;
  elsif typ='decidir' then
    decision:=p_pedido->>'decisao';
    if coalesce(decision,'') not in ('approved','rejected') then raise exception 'Decisao invalida';end if;
    select * into proposal from public.entrada_plano_propostas where id=(p_pedido->>'proposta_id')::uuid and company_id=c and obra_id=p_obra_id for update;
    if not found or proposal.status<>'pending' then raise exception 'Proposta indisponivel ou ja decidida';end if;
    if proposal.solicitante_id=ator then raise exception 'Autoaprovacao proibida';end if;
    proposal_uuid:=proposal.id;
    if decision='approved' then
      if o.contrato_entrada is distinct from cp.contrato_anterior then raise exception 'Contrato original mudou; rejeite a proposta e solicite novamente' using errcode='40001';end if;
      if cp.revisao<>proposal.revisao then raise exception 'Proposta obsoleta; rejeite e solicite novamente' using errcode='40001';end if;
      if proposal.kind='terms' then
        delivery:=nullif(proposal.pedido->>'delivery','')::date;
        base_sum:=public.entrada_plano_validar(p_obra_id,proposal.pedido->'rows',delivery);
        for x in select value from jsonb_array_elements(proposal.pedido->'rows') loop
          row_uuid:=(x->>'id')::uuid;ids:=array_append(ids,row_uuid);
          select * into p from public.entrada_plano_parcelas where id=row_uuid;
          changed:=not found;
          if not changed then
            changed:=p.label is distinct from x->>'label' or p.base<>(x->>'base')::bigint or p.mode is distinct from x->>'mode'
              or p.rate<>(x->>'rate')::integer or p.final<>(x->>'final')::bigint or p.due is distinct from nullif(x->>'due','')::date
              or p.method is distinct from x->>'method' or not p.ativa;
          end if;
          if changed then
            insert into public.entrada_plano_parcelas(id,company_id,obra_id,label,base,mode,rate,final,due,method)
              values(row_uuid,c,p_obra_id,trim(x->>'label'),(x->>'base')::bigint,x->>'mode',(x->>'rate')::integer,
                (x->>'final')::bigint,nullif(x->>'due','')::date,x->>'method')
              on conflict(id) do update set label=excluded.label,base=excluded.base,mode=excluded.mode,rate=excluded.rate,
                final=excluded.final,due=excluded.due,method=excluded.method,ativa=true,version=entrada_plano_parcelas.version+1;
            linha:=public.entrada_plano_linha(row_uuid);
            update public.entrada_plano_parcelas set allocation_principal=(linha->>'principalRemaining')::bigint,
              allocation_addition=(linha->>'additionRemaining')::bigint,principal_start=(linha->>'principalPaid')::bigint,
              relieved_start=(linha->>'additionPaid')::bigint+(linha->>'cancelled')::bigint where id=row_uuid;
          end if;
        end loop;
        update public.entrada_plano_parcelas set ativa=false,version=version+1 where obra_id=p_obra_id and ativa and not(id=any(ids));
        update public.entrada_planos set stage='confirmed',delivery=delivery,original_centavos=base_sum where obra_id=p_obra_id;
      else
        select * into r from public.entrada_plano_recebimentos where id=(proposal.pedido->>'receipt_id')::uuid and company_id=c and obra_id=p_obra_id;
        amount:=(proposal.pedido->>'amount')::bigint;dt:=(proposal.pedido->>'date')::date;
        quote:=public.entrada_plano_cotar_estorno(r.id,amount);
        caisse:=public.caixa_registrar(p_operacao,jsonb_build_object('action','movimento','tipo','saida',
          'conta_id',proposal.pedido->'conta_id','valor_centavos',amount,'data_efetiva',dt,
          'hora_efetiva',proposal.pedido->'hora_efetiva','decisao_corte',proposal.pedido->'decisao_corte',
          'descricao','Estorno aprovado da entrada - '||why));
        mov_uuid:=(caisse->>'movimento_id')::uuid;rec_uuid:=gen_random_uuid();rep_uuid:=gen_random_uuid();
        insert into public.entrada_plano_recebimentos(id,company_id,obra_id,row_id,operacao_id,amount,principal,addition_paid,cancelled,
          data_efetiva,method,usuario_id,repasse_id,movimento_id,reverses,delivery_at_payment,regra)
        values(rec_uuid,c,p_obra_id,r.row_id,p_operacao,-amount,-(quote->>'principal')::bigint,-(quote->>'additionPaid')::bigint,
          -(quote->>'cancelled')::bigint,dt,'Estorno',ator,rep_uuid,mov_uuid,r.id,r.delivery_at_payment,'estorno-inverso-proporcional');
        insert into public.repasses_cef(id,company_id,obra_id,tipo,valor,data_credito,criado_por,medicao_numero,observacao)
          values(rep_uuid,c,p_obra_id,'entrada',-amount::numeric/100,dt,ator::text,0,'Estorno aprovado; recebimento original '||r.id::text);
        linha:=public.entrada_plano_linha(r.row_id);
        update public.entrada_plano_parcelas set version=version+1,allocation_principal=(linha->>'principalRemaining')::bigint,
          allocation_addition=(linha->>'additionRemaining')::bigint,principal_start=(linha->>'principalPaid')::bigint,
          relieved_start=(linha->>'additionPaid')::bigint+(linha->>'cancelled')::bigint where id=r.row_id;
      end if;
    end if;
    update public.entrada_plano_propostas set status=decision,decidido_em=clock_timestamp(),aprovador_id=ator,motivo_decisao=why where id=proposal.id;
  elsif typ in ('receber','vincular') then
    if cp.stage<>'confirmed' then raise exception 'Plano ainda nao aprovado';end if;
    row_uuid:=(p_pedido->>'row_id')::uuid;
    select * into p from public.entrada_plano_parcelas where id=row_uuid and company_id=c and obra_id=p_obra_id and ativa for update;
    if not found then raise exception 'Parcela indisponivel nesta obra';end if;
    rec_uuid:=gen_random_uuid();
    if typ='receber' then
      if exists(select 1 from public.repasses_cef rep_old where rep_old.company_id=c and rep_old.obra_id=p_obra_id and rep_old.tipo='entrada'
         and not exists(select 1 from public.entrada_plano_recebimentos rec where rec.repasse_id=rep_old.id)) then
        raise exception 'Vincule os recebimentos existentes antes de registrar dinheiro novo';end if;
      if coalesce(p_pedido->>'amount','') !~ '^\d+$' then raise exception 'Recebimento deve ser inteiro em centavos';end if;
      amount:=(p_pedido->>'amount')::bigint;
      if coalesce(p_pedido->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Data recebimento obrigatoria';end if;
      dt:=(p_pedido->>'date')::date;
      if coalesce(p_pedido->>'method','') not in ('Pix','Dinheiro','Transferência','Boleto') then raise exception 'Forma do recebimento invalida';end if;
      quote:=public.entrada_plano_cotar(row_uuid,amount,dt);rep_uuid:=gen_random_uuid();
      caisse:=public.caixa_registrar(p_operacao,jsonb_build_object('action','movimento','tipo','entrada',
        'conta_id',p_pedido->'conta_id','valor_centavos',amount,'data_efetiva',dt,
        'hora_efetiva',p_pedido->'hora_efetiva','decisao_corte',p_pedido->'decisao_corte','descricao','Entrada recebida - '||p.label||' - '||why));
      mov_uuid:=(caisse->>'movimento_id')::uuid;
      insert into public.entrada_plano_recebimentos(id,company_id,obra_id,row_id,operacao_id,amount,principal,addition_paid,cancelled,
        data_efetiva,method,usuario_id,repasse_id,movimento_id,delivery_at_payment,regra)
      values(rec_uuid,c,p_obra_id,row_uuid,p_operacao,amount,(quote->>'principal')::bigint,(quote->>'additionPaid')::bigint,
        (quote->>'cancelled')::bigint,dt,p_pedido->>'method',ator,rep_uuid,mov_uuid,nullif(quote->>'delivery','')::date,
        case when (quote->>'eligible')::boolean then 'antecipacao-proporcional-antes-entrega' else 'pagamento-proporcional' end);
      insert into public.repasses_cef(id,company_id,obra_id,tipo,valor,data_credito,criado_por,medicao_numero,observacao)
        values(rep_uuid,c,p_obra_id,'entrada',amount::numeric/100,dt,ator::text,0,'Recebimento parcela '||row_uuid::text||'; '||why);
    else
      select * into rep from public.repasses_cef where id=(p_pedido->>'repasse_id')::uuid and company_id=c and obra_id=p_obra_id for update;
      if not found or rep.tipo<>'entrada' or rep.valor<=0 or rep.valor::text in ('NaN','Infinity','-Infinity') or rep.data_credito is null or rep.data_credito>(now() at time zone 'America/Sao_Paulo')::date
        or rep.valor*100<>round(rep.valor*100) then raise exception 'Repasse de entrada elegivel indisponivel';end if;
      if exists(select 1 from public.entrada_plano_recebimentos where repasse_id=rep.id) then raise exception 'Repasse ja vinculado; nao repetir recebimento';end if;
      amount:=round(rep.valor*100)::bigint;dt:=rep.data_credito;
      linha:=public.entrada_plano_linha(row_uuid);
      if (linha->>'additionDue')::bigint<>0 or amount>(linha->>'principalRemaining')::bigint then
        raise exception 'Vinculo legado exige parcela sem acrescimo e saldo principal suficiente; aprove divisao especifica';end if;
      insert into public.entrada_plano_recebimentos(id,company_id,obra_id,row_id,operacao_id,amount,principal,addition_paid,cancelled,
        data_efetiva,method,usuario_id,repasse_id,vinculo_legado,delivery_at_payment,regra)
      values(rec_uuid,c,p_obra_id,row_uuid,p_operacao,amount,amount,0,0,dt,p.method,ator,rep.id,true,cp.delivery,'vinculo-legado-sem-novo-caixa');
      linha:=public.entrada_plano_linha(row_uuid);
      update public.entrada_plano_parcelas set allocation_principal=(linha->>'principalRemaining')::bigint,
        allocation_addition=(linha->>'additionRemaining')::bigint,principal_start=(linha->>'principalPaid')::bigint,
        relieved_start=(linha->>'additionPaid')::bigint+(linha->>'cancelled')::bigint where id=row_uuid;
    end if;
    update public.entrada_plano_parcelas set version=version+1 where id=row_uuid;
  else raise exception 'Tipo de operacao invalido';end if;
  update public.entrada_planos set revisao=revisao+1 where obra_id=p_obra_id;

  after_state:=public.entrada_plano_estado(p_obra_id)-'history'-'requests'-'receipts'-'contas';
  insert into public.entrada_plano_historico(company_id,obra_id,operacao_id,tipo,ator_id,motivo,proposta_id,antes,depois)
    values(c,p_obra_id,p_operacao,typ,ator,why,proposal_uuid,before_state,after_state);
  after_state:=public.entrada_plano_estado(p_obra_id)||jsonb_build_object('operacao_id',p_operacao);
  insert into public.entrada_plano_operacoes(company_id,id,obra_id,usuario_id,pedido,resultado)
    values(c,p_operacao,p_obra_id,ator,p_pedido,after_state);
  return after_state;
end $$;
commit;
