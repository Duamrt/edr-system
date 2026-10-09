-- Plano de entrada v6. Migração sem seed, sem usuários/data de exemplo e sem automação.
-- Pré-requisitos: schema legado obras/repasses, helpers Auth e Caixa prospectivo.
-- Identidades são configuradas separadamente por owner após conferir Auth UID.
-- Cada recebimento é um repasse imutável + evento do plano + movimento Caixa.
-- Vínculo legado não cria movimento. Estorno preserva originais e cria inversos.
-- delivery é previsão financeira exclusiva do plano; obras.data_entrega é real para o Termo e não é alterada/protegida aqui.
begin;
do $$
begin
  if to_regprocedure('public.caixa_registrar(uuid,jsonb)') is null
     or to_regprocedure('public.caixa_estado()') is null
     or to_regprocedure('public.auth_company_id()') is null
     or to_regprocedure('auth.uid()') is null then raise exception 'Pre-requisito: Auth e Caixa prospectivo'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='obras'
      and column_name in ('id','company_id','contrato_entrada','data_entrega'))<>4 then
    raise exception 'Pre-requisito: conferir obras contrato_entrada e data_entrega'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='repasses_cef'
      and column_name in ('id','company_id','obra_id','tipo','valor','data_credito','criado_por','medicao_numero','observacao'))<>9 then
    raise exception 'Pre-requisito: conferir repasses_cef'; end if;
end $$;
create table public.entrada_plano_responsaveis(
  company_id uuid primary key references public.companies(id),
  solicitante_id uuid not null, aprovador_id uuid not null,
  check(solicitante_id<>aprovador_id),
  configurado_em timestamptz not null default clock_timestamp()
);
create table public.entrada_planos(
  obra_id uuid primary key references public.obras(id), company_id uuid not null references public.companies(id),
  revisao integer not null default 0 check(revisao>=0), stage text not null default 'draft' check(stage in ('draft','confirmed')),
  original_centavos bigint not null check(original_centavos between 0 and 9007199254740991),
  contrato_anterior numeric, delivery date,
  criado_em timestamptz not null default clock_timestamp(), unique(company_id,obra_id)
);
create table public.entrada_plano_parcelas(
  id uuid primary key, company_id uuid not null, obra_id uuid not null,
  label text not null check(length(trim(label)) between 1 and 100),
  base bigint not null check(base between 1 and 100000000),
  mode text not null check(mode in ('waived','percent','final')),
  rate integer not null check(rate between 0 and 10000),
  final bigint not null check(final between 0 and 100000000),
  due date, method text not null check(method in ('A combinar','Pix','Dinheiro','Transferência','Boleto')),
  version integer not null default 0, ativa boolean not null default true,
  allocation_principal bigint not null default 0, allocation_addition bigint not null default 0,
  principal_start bigint not null default 0, relieved_start bigint not null default 0,
  foreign key(company_id,obra_id) references public.entrada_planos(company_id,obra_id),
  unique(company_id,obra_id,id),
  check((mode='percent') or rate=0)
);
create table public.entrada_plano_propostas(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, obra_id uuid not null,
  kind text not null check(kind in ('terms','reversal')), status text not null default 'pending' check(status in ('pending','approved','rejected')),
  revisao integer not null, pedido jsonb not null, antes jsonb not null, depois jsonb not null,
  solicitante_id uuid not null, motivo text not null check(length(trim(motivo)) between 4 and 240),
  criado_em timestamptz not null default clock_timestamp(), decidido_em timestamptz, aprovador_id uuid, motivo_decisao text,
  foreign key(company_id,obra_id) references public.entrada_planos(company_id,obra_id),
  check((status='pending' and decidido_em is null and aprovador_id is null)
    or (status<>'pending' and decidido_em is not null and aprovador_id is not null and aprovador_id<>solicitante_id))
);
create unique index entrada_plano_uma_proposta on public.entrada_plano_propostas(company_id,obra_id) where status='pending';
create table public.entrada_plano_recebimentos(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, obra_id uuid not null, row_id uuid not null,
  operacao_id uuid not null, amount bigint not null check(amount<>0 and abs(amount)<=100000000),
  principal bigint not null, addition_paid bigint not null, cancelled bigint not null,
  data_efetiva date not null, method text not null, usuario_id uuid not null, repasse_id uuid not null unique,
  movimento_id uuid unique, reverses uuid references public.entrada_plano_recebimentos(id),
  vinculo_legado boolean not null default false, delivery_at_payment date, regra text,
  criado_em timestamptz not null default clock_timestamp(),
  foreign key(company_id,obra_id,row_id) references public.entrada_plano_parcelas(company_id,obra_id,id),
  foreign key(repasse_id) references public.repasses_cef(id) deferrable initially deferred,
  foreign key(movimento_id) references public.caixa_movimentos(id),
  check(amount=principal+addition_paid),
  check((amount>0 and reverses is null and principal>=0 and addition_paid>=0 and cancelled>=0)
     or (amount<0 and reverses is not null and principal<=0 and addition_paid<=0 and cancelled<=0)),
  check(vinculo_legado or movimento_id is not null)
);
create index entrada_plano_recebimentos_parcela on public.entrada_plano_recebimentos(company_id,obra_id,row_id);
create table public.entrada_plano_historico(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, obra_id uuid not null,
  operacao_id uuid not null, tipo text not null, ator_id uuid not null, motivo text not null,
  proposta_id uuid, antes jsonb not null, depois jsonb not null,
  criado_em timestamptz not null default clock_timestamp(),
  foreign key(company_id,obra_id) references public.entrada_planos(company_id,obra_id)
);
create table public.entrada_plano_operacoes(
  company_id uuid not null, id uuid not null, obra_id uuid not null, usuario_id uuid not null,
  pedido jsonb not null, resultado jsonb not null, criado_em timestamptz not null default clock_timestamp(),
  primary key(company_id,id), foreign key(company_id,obra_id) references public.entrada_planos(company_id,obra_id)
);
-- Nenhuma tabela é escrita pelo navegador. Configuração de identidades não tem leitura pública.
do $$
declare t text;
begin
  foreach t in array array['entrada_plano_responsaveis','entrada_planos','entrada_plano_parcelas','entrada_plano_propostas',
    'entrada_plano_recebimentos','entrada_plano_historico','entrada_plano_operacoes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    if t<>'entrada_plano_responsaveis' then
      execute format('create policy entrada_plano_empresa on public.%I for select to authenticated using(company_id=public.auth_company_id() and auth.uid() is not null and exists(select 1 from public.company_users cu where cu.user_id=auth.uid() and cu.company_id=%I.company_id and cu.active is true and cu.role in (''admin'',''operacional'')))',t,t);
      if t='entrada_plano_operacoes' then
        execute format('drop policy entrada_plano_empresa on public.%I',t);
        execute format('create policy entrada_plano_empresa on public.%I for select to authenticated using(company_id=public.auth_company_id() and usuario_id=auth.uid() and exists(select 1 from public.company_users cu where cu.user_id=auth.uid() and cu.company_id=%I.company_id and cu.active is true and cu.role in (''admin'',''operacional'')))',t,t);
      end if;
      execute format('grant select on public.%I to authenticated',t);
    end if;
  end loop;
end $$;
create function public.entrada_plano_imutavel() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Historico financeiro imutavel; use evento inverso aprovado' using errcode='42501'; end $$;
create trigger entrada_plano_recebimentos_imutaveis before update or delete on public.entrada_plano_recebimentos
  for each row execute function public.entrada_plano_imutavel();
create trigger entrada_plano_historico_imutavel before update or delete on public.entrada_plano_historico
  for each row execute function public.entrada_plano_imutavel();
create trigger entrada_plano_operacoes_imutaveis before update or delete on public.entrada_plano_operacoes
  for each row execute function public.entrada_plano_imutavel();

-- Auxiliares privadas: contas em centavos e arredondamento NUMERIC, sem float.
create function public.entrada_plano_linha(p_row uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.entrada_plano_parcelas%rowtype; n bigint; pr bigint; ad bigint; pago bigint; pp bigint; ap bigint; ca bigint;
begin
  select * into p from public.entrada_plano_parcelas where id=p_row;
  if not found then raise exception 'Parcela indisponivel'; end if;
  n:=case p.mode when 'percent' then p.base+round(p.base::numeric*p.rate/10000)::bigint when 'final' then p.final else p.base end;
  pr:=least(p.base,n); ad:=greatest(0,n-p.base);
  select coalesce(sum(amount),0),coalesce(sum(principal),0),coalesce(sum(addition_paid),0),coalesce(sum(cancelled),0)
    into pago,pp,ap,ca from public.entrada_plano_recebimentos where row_id=p.id;
  return jsonb_build_object('id',p.id,'label',p.label,'base',p.base,'mode',p.mode,'rate',p.rate,'final',p.final,
    'due',p.due,'method',p.method,'version',p.version,'total',n-ca,'negotiated',n,'delta',n-ca-p.base,
    'recebido',pago,'received',pago,'principalDue',pr,'additionDue',ad,'principalPaid',pp,'additionPaid',ap,
    'cancelled',ca,'principalRemaining',pr-pp,'additionRemaining',ad-ap-ca,'remaining',n-ca-pago,
    'aviso_em',case when p.due is not null and n-ca-pago>0 then p.due-3 end,
    'allocation',jsonb_build_object('principal',p.allocation_principal,'addition',p.allocation_addition,
      'principalPaidStart',p.principal_start,'feeRelievedStart',p.relieved_start));
end $$;
create function public.entrada_plano_cotar(p_row uuid,p_amount bigint,p_date date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.entrada_plano_parcelas%rowtype; s jsonb; delivery date; pr bigint; ad bigint; ca bigint:=0;
  rp bigint; ra bigint; pago bigint; al bigint; target bigint; early boolean;
begin
  if p_amount is null or p_amount<1 or p_amount>100000000 or p_date is null then raise exception 'Valor/data de recebimento invalido'; end if;
  select * into p from public.entrada_plano_parcelas where id=p_row and ativa;
  if not found then raise exception 'Parcela indisponivel'; end if;
  select x.delivery into delivery from public.entrada_planos x where obra_id=p.obra_id;
  s:=public.entrada_plano_linha(p.id); rp:=(s->>'principalRemaining')::bigint; ra:=(s->>'additionRemaining')::bigint;
  early:=delivery is not null and p_date<delivery and rp>0 and ra>0;
  if early then
    if p_amount>rp then raise exception 'Antes da entrega receba somente o principal antecipado'; end if;
    pr:=p_amount;
    if p.allocation_principal<=0 then raise exception 'Alocacao de antecipacao inconsistente'; end if;
    target:=round(p.allocation_addition::numeric*((s->>'principalPaid')::bigint-p.principal_start+pr)/p.allocation_principal)::bigint;
    ca:=least(ra,greatest(0,target-((s->>'additionPaid')::bigint+(s->>'cancelled')::bigint-p.relieved_start)));
    if pr=rp then ca:=ra; end if; ad:=0;
  else
    if p_amount>(s->>'remaining')::bigint then raise exception 'Recebimento excede saldo da parcela'; end if;
    pr:=case when p_amount=(s->>'remaining')::bigint then rp
      else least(rp,round(p_amount::numeric*rp/(s->>'remaining')::bigint)::bigint) end;
    ad:=p_amount-pr;
    if ad>ra then ad:=ra;pr:=p_amount-ad;end if;
  end if;
  return jsonb_build_object('amount',p_amount,'principal',pr,'additionPaid',ad,'cancelled',ca,
    'eligible',early,'delivery',delivery,'remaining',(s->>'remaining')::bigint-p_amount-ca);
end $$;
create function public.entrada_plano_cotar_estorno(p_receipt uuid,p_amount bigint) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare r public.entrada_plano_recebimentos%rowtype; reverted bigint; pr_before bigint; ca_before bigint; pr bigint; ca bigint;
begin
  select * into r from public.entrada_plano_recebimentos where id=p_receipt and amount>0;
  if not found then raise exception 'Recebimento indisponivel'; end if;
  select -coalesce(sum(amount),0),-coalesce(sum(principal),0),-coalesce(sum(cancelled),0)
    into reverted,pr_before,ca_before from public.entrada_plano_recebimentos where reverses=r.id;
  if p_amount is null or p_amount<1 or p_amount>r.amount-reverted then raise exception 'Estorno excede valor ainda recebido'; end if;
  pr:=round(r.principal::numeric*(reverted+p_amount)/r.amount)::bigint-pr_before;
  ca:=round(r.cancelled::numeric*(reverted+p_amount)/r.amount)::bigint-ca_before;
  return jsonb_build_object('amount',p_amount,'principal',pr,'additionPaid',p_amount-pr,'cancelled',ca,
    'available',r.amount-reverted);
end $$;
create function public.entrada_plano_validar(p_obra uuid,p_rows jsonb,p_delivery date) returns bigint
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare x jsonb; p public.entrada_plano_parcelas%rowtype; existing jsonb; n bigint; base_sum numeric:=0;
  base bigint; final bigint; rate integer; row_uuid uuid; mode text; identifiers uuid[]:='{}'; cp public.entrada_planos%rowtype;
begin
  select * into cp from public.entrada_planos where obra_id=p_obra;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 120 then raise exception 'Informe de 1 a 120 parcelas'; end if;
  for x in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(x) is distinct from 'object' or x ?| array['company_id','obra_id','received','recebido','principalPaid','cancelled'] then raise exception 'Parcela contem campos reservados'; end if;
    row_uuid:=(x->>'id')::uuid;
    if row_uuid is null or row_uuid=any(identifiers) then raise exception 'ID de parcela ausente ou repetido'; end if;
    identifiers:=array_append(identifiers,row_uuid);
    if coalesce(x->>'base','') !~ '^\d+$' or coalesce(x->>'rate','') !~ '^\d+$' or coalesce(x->>'final','') !~ '^\d+$' then raise exception 'Valores/taxa devem ser centavos inteiros'; end if;
    base:=(x->>'base')::bigint;rate:=(x->>'rate')::integer;final:=(x->>'final')::bigint;mode:=x->>'mode';
    if base not between 1 and 100000000 or final not between 0 and 100000000 or rate not between 0 and 10000
      or coalesce(mode,'') not in ('waived','percent','final') or (mode<>'percent' and rate<>0) then raise exception 'Base/final/taxa/modo invalido'; end if;
    if coalesce(length(trim(x->>'label')),0) not between 1 and 100
       or coalesce(x->>'method','') not in ('A combinar','Pix','Dinheiro','Transferência','Boleto') then raise exception 'Descricao/forma da parcela invalida'; end if;
    if nullif(x->>'due','') is not null then
      if x->>'due' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Vencimento invalido'; end if;
      perform (x->>'due')::date;
    end if;
    n:=case mode when 'percent' then base+round(base::numeric*rate/10000)::bigint when 'final' then final else base end;
    if n>100000000 then raise exception 'Total da parcela excede limite R$ 1.000.000'; end if;
    select * into p from public.entrada_plano_parcelas where id=row_uuid;
    if found then
      if p.obra_id<>p_obra then raise exception 'ID de parcela indisponivel nesta obra'; end if;
      existing:=public.entrada_plano_linha(row_uuid);
      if exists(select 1 from public.entrada_plano_recebimentos where row_id=row_uuid) and p.base<>base then raise exception 'Base com recebimentos historicos e imutavel'; end if;
      if least(base,n)<(existing->>'principalPaid')::bigint
        or greatest(0,n-base)<(existing->>'additionPaid')::bigint+(existing->>'cancelled')::bigint then
        raise exception 'Mudanca conflita com principal/acrescimo recebido ou cancelado'; end if;
    end if;
    base_sum:=base_sum+base;
  end loop;
  if exists(select 1 from public.entrada_plano_parcelas parc where parc.obra_id=p_obra and parc.ativa and not(parc.id=any(identifiers))
      and exists(select 1 from public.entrada_plano_recebimentos r where r.row_id=parc.id)) then raise exception 'Nao remover parcela com historico de recebimentos'; end if;
  if base_sum>9007199254740991 then raise exception 'Total fora da faixa segura'; end if;
  if cp.original_centavos<=0 then raise exception 'Defina o contrato original de entrada antes de propor parcelas'; end if;
  if base_sum<>cp.original_centavos then raise exception 'Soma original deve preservar contrato de entrada'; end if;
  return base_sum::bigint;
end $$;
create function public.entrada_plano_estado(p_obra_id uuid) returns jsonb
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
    'permissions',jsonb_build_object('solicitar',coalesce(ator=cfg.solicitante_id,false),
      'aprovar',coalesce(ator=cfg.aprovador_id and role='admin',false),'receber',pode_receber),
    'totals',jsonb_build_object('original',original,'agreed',total,'received',recebido+nao_vinculado,
      'receivedLinked',recebido,'unlinked',nao_vinculado,'remaining',greatest(0,total-recebido-nao_vinculado),
      'remainingRows',total-recebido,'delta',total-original,'cancelled',cancelled),
    'reminders',jsonb_build_object('configured',false,'lead_days',3));
end $$;
-- Guardas restritas à entrada/plano: PLS/terreno, estoque/custos permanecem no fluxo existente.
create function public.entrada_plano_guard_repasse() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare obra uuid; r public.entrada_plano_recebimentos%rowtype;
begin
  if tg_op<>'INSERT' and exists(select 1 from public.entrada_plano_recebimentos where repasse_id=old.id) then
    raise exception 'Repasse vinculado e imutavel; solicite estorno auditado' using errcode='42501'; end if;
  obra:=case when tg_op='DELETE' then old.obra_id else new.obra_id end;
  if (case when tg_op='DELETE' then old.tipo else new.tipo end)='entrada'
     and exists(select 1 from public.entrada_planos where obra_id=obra and stage='confirmed') then
    if tg_op<>'INSERT' then raise exception 'Entrada com plano confirmado exige operacao auditada' using errcode='42501'; end if;
    select * into r from public.entrada_plano_recebimentos where repasse_id=new.id;
    if not found or r.obra_id<>new.obra_id or r.company_id<>new.company_id
       or r.amount::numeric/100 is distinct from new.valor or r.data_efetiva is distinct from new.data_credito then
      raise exception 'Entrada deve nascer do recebimento atomico no plano' using errcode='42501'; end if;
  end if;
  -- Impede descaracterizar/mover uma entrada existente da obra protegida.
  if tg_op='UPDATE' and old.tipo='entrada' and exists(select 1 from public.entrada_planos where obra_id=old.obra_id and stage='confirmed') then
    raise exception 'Entrada de obra com plano confirmado e protegida' using errcode='42501'; end if;
  if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger entrada_plano_guard_repasse before insert or update or delete on public.repasses_cef
  for each row execute function public.entrada_plano_guard_repasse();
create function public.entrada_plano_guard_caixa() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.entrada_plano_recebimentos where movimento_id=old.id) then
    raise exception 'Caixa vinculado ao plano exige estorno aprovado; preserve movimento original' using errcode='42501'; end if;
  if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger entrada_plano_guard_caixa before update or delete on public.caixa_movimentos
  for each row execute function public.entrada_plano_guard_caixa();
create function public.entrada_plano_guard_obra() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.entrada_planos where obra_id=old.id and stage='confirmed') then
    if new.id is distinct from old.id or new.company_id is distinct from old.company_id then raise exception 'Obra com plano e protegida'; end if;

    if new.contrato_entrada is distinct from old.contrato_entrada
      and new.contrato_entrada is distinct from (select contrato_anterior from public.entrada_planos where obra_id=old.id) then
      raise exception 'Contrato original com plano confirmado e imutavel' using errcode='42501'; end if;
  end if;return new;
end $$;
create trigger entrada_plano_guard_obra before update on public.obras for each row execute function public.entrada_plano_guard_obra();

create function public.entrada_plano_operar(p_operacao uuid,p_obra_id uuid,p_pedido jsonb) returns jsonb
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

  select * into previous from public.entrada_plano_operacoes where company_id=c and id=p_operacao;
  if found then
    if previous.pedido is distinct from p_pedido or previous.obra_id<>p_obra_id or previous.usuario_id<>ator then raise exception 'Operacao ja usada com dados/ator diferentes'; end if;
    return previous.resultado;
  end if;
  select * into o from public.obras where id=p_obra_id and company_id=c for update;
  if not found then raise exception 'Obra indisponivel nesta empresa' using errcode='42501'; end if;
  typ:=p_pedido->>'tipo';why:=trim(p_pedido->>'motivo');
  if coalesce(length(why),0) not between 4 and 240 then raise exception 'Motivo obrigatorio de 4 a 240 caracteres';end if;
  perm_receber:=coalesce(role='admin' and ator in (cfg.solicitante_id,cfg.aprovador_id),false);
  if (typ in ('solicitar','solicitar_estorno') and ator<>cfg.solicitante_id)
     or (typ='decidir' and (ator<>cfg.aprovador_id or role<>'admin'))
     or (typ in ('receber','vincular') and not perm_receber) then raise exception 'Identidade sem permissao para esta operacao' using errcode='42501'; end if;
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
revoke all on function public.entrada_plano_imutavel(),public.entrada_plano_linha(uuid),
  public.entrada_plano_cotar(uuid,bigint,date),public.entrada_plano_cotar_estorno(uuid,bigint),
  public.entrada_plano_validar(uuid,jsonb,date),public.entrada_plano_guard_repasse(),public.entrada_plano_guard_caixa(),
  public.entrada_plano_guard_obra(),public.entrada_plano_estado(uuid),public.entrada_plano_operar(uuid,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.entrada_plano_estado(uuid),public.entrada_plano_operar(uuid,uuid,jsonb) to authenticated;
create function public.entrada_plano_resumo() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); planos jsonb;
begin
  if c is null or ator is null then raise exception 'Sessao sem empresa' using errcode='28000';end if;
  if not exists(select 1 from public.company_users where user_id=ator and company_id=c and active is true and role in ('admin','operacional')) then
    raise exception 'Perfil ativo sem permissao' using errcode='42501';end if;
  perform 1 from public.entrada_plano_operacoes limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('obra_id',cp.obra_id,'plano_id',cp.obra_id,'revisao',cp.revisao,
    'original_centavos',cp.original_centavos,'total_centavos',cp.total,
    'cancelado_centavos',cp.cancelled,'unlinked_centavos',cp.unlinked,'saldo_centavos',greatest(0,cp.total-cp.received),
    'pendencia_conciliacao',cp.unlinked_count>0,'stage',cp.stage,'parcelas',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'label',p.label,'due',p.due,'method',p.method,'pendencia_conciliacao',cp.unlinked_count>0,
      'remaining',(public.entrada_plano_linha(p.id)->>'remaining')::bigint) order by p.due nulls last,p.id),'[]')
      from public.entrada_plano_parcelas p where p.obra_id=cp.obra_id and p.ativa)) order by cp.obra_id),'[]')
  into planos from (
    select ep.*,(select coalesce(sum((public.entrada_plano_linha(p.id)->>'total')::bigint),0)
      from public.entrada_plano_parcelas p where p.obra_id=ep.obra_id and p.ativa) total,
      (select coalesce(sum(cancelled),0) from public.entrada_plano_recebimentos r where r.obra_id=ep.obra_id) cancelled,
      (select coalesce(sum(round(rc.valor*100)),0) from public.repasses_cef rc
        where rc.obra_id=ep.obra_id and rc.company_id=c and rc.tipo='entrada') received,
      (select greatest(0,coalesce(sum(round(rc.valor*100)),0)) from public.repasses_cef rc
        where rc.obra_id=ep.obra_id and rc.company_id=c and rc.tipo='entrada'
          and not exists(select 1 from public.entrada_plano_recebimentos r where r.repasse_id=rc.id)) unlinked,
      (select count(*) from public.repasses_cef rc where rc.obra_id=ep.obra_id and rc.company_id=c and rc.tipo='entrada'
        and not exists(select 1 from public.entrada_plano_recebimentos r where r.repasse_id=rc.id)) unlinked_count
    from public.entrada_planos ep where ep.company_id=c and ep.stage='confirmed'
  ) cp;
  return jsonb_build_object('company_id',c,'planos',planos);
end $$;
create function public.entrada_plano_avisos(p_referencia date) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); avisos jsonb;
begin
  if c is null or ator is null then raise exception 'Sessao sem empresa' using errcode='28000';end if;
  if p_referencia is null then raise exception 'Informe data de referencia real';end if;
  if not exists(select 1 from public.company_users where user_id=ator and company_id=c and active is true and role in ('admin','operacional')) then
    raise exception 'Perfil ativo sem permissao' using errcode='42501';end if;
  perform 1 from public.entrada_plano_operacoes limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id','entrada:'||p.obra_id::text||':'||p.id::text||':'||p.due::text,
    'company_id',c,'obra_id',p.obra_id,'row_id',p.id,'revisao',cp.revisao,'due',p.due,'aviso_em',p.due-3,
    'amount',(public.entrada_plano_linha(p.id)->>'remaining')::bigint,'method',p.method,'label',p.label) order by p.obra_id,p.id),'[]')
    into avisos from public.entrada_plano_parcelas p join public.entrada_planos cp on cp.obra_id=p.obra_id and cp.company_id=c
    where p.company_id=c and p.ativa and cp.stage='confirmed' and p.due=p_referencia+3
      and (public.entrada_plano_linha(p.id)->>'remaining')::bigint>0
      and not exists(select 1 from public.repasses_cef rc where rc.company_id=c and rc.obra_id=p.obra_id and rc.tipo='entrada'
        and not exists(select 1 from public.entrada_plano_recebimentos r where r.repasse_id=rc.id));
  return jsonb_build_object('company_id',c,'referencia',p_referencia,'lead_days',3,'automation_active',false,'avisos',avisos);
end $$;
revoke all on function public.entrada_plano_resumo(),public.entrada_plano_avisos(date) from public,anon,authenticated;
grant execute on function public.entrada_plano_resumo(),public.entrada_plano_avisos(date) to authenticated;
commit;
