-- PROPOSTA LOCAL: não aplicada ao Supabase.
-- Requer revisão e aprovação antes da migration e do frontend correspondente.
-- Não altera contas históricas, permissões, policies, credenciais ou saldos.
-- SECURITY INVOKER conserva os privilégios e RLS existentes.
begin;

alter table public.contas_pagar
  add column if not exists parcelamento jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.contas_pagar'::regclass
      and conname='contas_pagar_parcelamento_array') then
    alter table public.contas_pagar add constraint contas_pagar_parcelamento_array
      check (jsonb_typeof(parcelamento)='array') not valid;
  end if;
end;
$$;

create index if not exists contas_pagar_parcelamento_recibos
  on public.contas_pagar using gin (parcelamento jsonb_path_ops);

create or replace function public.registrar_parcelas_conta(p_operacao_id uuid, p_pedido jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
<<parcelar>>
declare
  empresa uuid := public.auth_company_id();
  ator uuid := auth.uid();
  modo text;
  nf public.notas_fiscais%rowtype;
  origem public.contas_pagar%rowtype;
  conta public.contas_pagar%rowtype;
  recibo jsonb;
  anterior jsonb := null;
  esperado jsonb;
  historico jsonb := '[]'::jsonb;
  parcelas jsonb;
  parcela jsonb;
  ids uuid[] := '{}';
  resultado jsonb := '[]'::jsonb;
  qtd integer;
  i integer := 0;
  total numeric := 0;
  total_anterior numeric := null;
  centavos numeric;
  vencimento date;
  pagamento date;
  fornecedor text;
  descricao text;
  referencia text;
  situacao text;
  tipo_conta text;
  obra uuid;
  nota uuid;
  motivo text;
  numero text;
  possui_vinculo boolean;
begin
  if empresa is null or ator is null then
    raise exception 'Sessão sem empresa' using errcode = '28000';
  end if;
  -- O Financeiro e a leitura do Caixa são administrativos no contrato vigente.
  -- Não elevar privilégios para contornar uma policy que impeça a conferência.
  if public.auth_user_role() is distinct from 'admin' or not exists (
      select 1 from public.company_users cu where cu.user_id=ator
        and cu.company_id=empresa and cu.role='admin' and cu.active is true) then
    raise exception 'Apenas administrador pode registrar parcelamento' using errcode = '42501';
  end if;
  if p_operacao_id is null or p_pedido is null or jsonb_typeof(p_pedido) <> 'object'
      or p_pedido ?| array['company_id','usuario_id','parcelamento'] then
    raise exception 'Pedido de parcelamento inválido';
  end if;
  modo := p_pedido->>'modo';
  if modo is null or modo not in ('nota','desdobrar') then
    raise exception 'Modo de parcelamento inválido';
  end if;

  -- Mesmo lock utilizado pelo Caixa: uma baixa concorrente não pode escapar
  -- da conferência do desdobramento. Nenhuma linha do Caixa é escrita aqui.
  perform pg_advisory_xact_lock(hashtextextended(empresa::text || ':caixa-prospectivo', 0));

  select h.value into recibo
  from public.contas_pagar c
  cross join lateral jsonb_array_elements(c.parcelamento) h(value)
  where c.company_id = empresa
    and c.parcelamento @> jsonb_build_array(jsonb_build_object('operacao_id', p_operacao_id))
    and h.value->>'operacao_id' = p_operacao_id::text
  limit 1;
  if found then
    if recibo->'pedido' is distinct from p_pedido then
      raise exception 'Operação já usada com dados diferentes';
    end if;
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(recibo->'conta_ids');
    select coalesce(jsonb_agg(to_jsonb(c) order by array_position(ids,c.id)), '[]'::jsonb)
      into resultado from public.contas_pagar c where c.company_id=empresa and c.id=any(ids);
    if jsonb_array_length(resultado) <> cardinality(ids) then
      raise exception 'Parcelas do recibo indisponíveis; confira o histórico, sem recriar';
    end if;
    return jsonb_build_object('contas', resultado, 'repetida', true);
  end if;

  parcelas := p_pedido->'parcelas';
  if parcelas is null or jsonb_typeof(parcelas) <> 'array' then
    raise exception 'Informe as parcelas';
  end if;
  qtd := jsonb_array_length(parcelas);
  if qtd not between 1 and 120 then raise exception 'Informe de 1 a 120 parcelas'; end if;
  motivo := btrim(coalesce(p_pedido->>'motivo',''));
  if length(motivo)>1000 then raise exception 'Motivo muito longo'; end if;
  for parcela in select value from jsonb_array_elements(parcelas) loop
    if jsonb_typeof(parcela)<>'object'
        or jsonb_typeof(parcela->'valor_centavos') is distinct from 'number'
        or coalesce(parcela->>'valor_centavos','') !~ '^[0-9]+$' then
      raise exception 'Valor de cada parcela deve ser inteiro em centavos';
    end if;
    centavos := (parcela->>'valor_centavos')::numeric;
    if centavos not between 1 and 9007199254740991 then
      raise exception 'Valor de parcela inválido';
    end if;
    if coalesce(parcela->>'vencimento','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Informe o vencimento de cada parcela';
    end if;
    vencimento := (parcela->>'vencimento')::date;
    if to_char(vencimento,'YYYY-MM-DD') <> parcela->>'vencimento' then
      raise exception 'Vencimento inválido';
    end if;
    numero := btrim(coalesce(parcela->>'numero',''));
    if length(numero)>80 then raise exception 'Número de duplicata muito longo'; end if;
    total := total + centavos;
  end loop;
  if total>9007199254740991 then raise exception 'Soma das parcelas fora do limite'; end if;
  if exists (
    select 1 from jsonb_array_elements(parcelas) p
    where nullif(btrim(p->>'numero'),'') is not null
    group by upper(btrim(p->>'numero')) having count(*)>1
  ) then raise exception 'Número de duplicata repetido; revise as parcelas'; end if;

  if modo='nota' then
    nota := nullif(p_pedido->>'nota_id','')::uuid;
    if nota is null then raise exception 'Nota fiscal não informada'; end if;
    select * into nf from public.notas_fiscais
      where id=nota and company_id=empresa for update;
    if not found then raise exception 'Nota fiscal removida ou indisponível nesta empresa'; end if;
    if upper(coalesce(nf.natureza,''))='DEVOLUCAO' then
      raise exception 'Devolução fiscal usa o fluxo de reembolso';
    end if;
    -- O bloqueio da NF coincide com excluir_nota_fiscal, inclusive entre abas.
    -- Considerar também legado ainda sem UUID, sem capturar outro fornecedor.
    if exists (
      select 1 from public.contas_pagar c
      where c.company_id=empresa
        and coalesce(c.tipo,'') <> 'despesa_operacional_nf'
        and (c.nota_id=nota or (c.nota_id is null
          and upper(btrim(coalesce(c.nota_ref,'')))=upper(btrim(nf.numero_nf))
          and upper(btrim(coalesce(c.fornecedor,'')))=upper(btrim(nf.fornecedor))))
    ) then raise exception 'Esta NF já possui conta financeira; revise a conta existente'; end if;
    if exists (select 1 from public.contas_pagar c where c.company_id=empresa
        and c.nota_id=nota and c.tipo='despesa_operacional_nf')
        and ((p_pedido->'aceitar_divergencia') is distinct from 'true'::jsonb or length(motivo)=0) then
      raise exception 'Despesas desta NF já estão no Financeiro: confirme a conferência e informe o motivo';
    end if;
    fornecedor := nf.fornecedor;
    referencia := nf.numero_nf;
    descricao := btrim(coalesce(nullif(p_pedido->>'descricao',''), 'NF '||nf.numero_nf||' - '||nf.fornecedor));
    obra := nullif(p_pedido->>'obra_id','')::uuid;
    situacao := p_pedido->>'status';
    if situacao is null or situacao not in ('pendente','pago') then
      raise exception 'Status financeiro inválido';
    end if;
    if situacao='pago' then
      if qtd<>1 then raise exception 'Pagamento à vista requer uma única parcela'; end if;
      if coalesce(p_pedido->>'data_pagamento','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Informe a data do pagamento';
      end if;
      pagamento := (p_pedido->>'data_pagamento')::date;
    end if;
  else
    select * into origem from public.contas_pagar
      where id=nullif(p_pedido->>'conta_id','')::uuid and company_id=empresa for update;
    if not found then raise exception 'Conta removida ou indisponível nesta empresa'; end if;
    if origem.status is distinct from 'pendente' or origem.data_pagamento is not null
        or nullif(to_jsonb(origem)->>'data_recebimento','') is not null
        or coalesce(origem.tipo,'') like 'reembolso%'
        or origem.tipo='despesa_operacional_nf' then
      raise exception 'Somente conta pendente sem pagamento pode ser desdobrada';
    end if;
    if origem.valor is null or origem.valor<=0 or origem.valor::text in ('NaN','Infinity','-Infinity')
        or round(origem.valor*100)>9007199254740991 then
      raise exception 'Valor original inválido; revise a conta antes de desdobrar';
    end if;
    -- Qualquer histórico no Caixa impede substituir a obrigação, mesmo quando
    -- o movimento foi cancelado. A reconciliação permanece explícita no Caixa.
    if to_regclass('public.caixa_obrigacoes') is not null then
      execute 'select exists(select 1 from public.caixa_obrigacoes where company_id=$1 and conta_pagar_id=$2)'
        into possui_vinculo using empresa,origem.id;
      if possui_vinculo then raise exception 'Conta vinculada ao Caixa; preserve a obrigação e os movimentos'; end if;
    end if;
    if to_regclass('public.caixa_movimentos') is not null then
      execute 'select exists(select 1 from public.caixa_movimentos where company_id=$1 and conta_pagar_id=$2)'
        into possui_vinculo using empresa,origem.id;
      if possui_vinculo then raise exception 'Conta possui histórico de baixa no Caixa'; end if;
    end if;
    -- Custo legado criado por baixa anterior também não pode ser reescrito.
    if exists (select 1 from public.lancamentos l where l.company_id=empresa
        and l.obs='contas_pagar:'||origem.id::text) then
      raise exception 'Conta possui lançamento de baixa; revise o histórico';
    end if;
    if jsonb_typeof(origem.parcelamento)<>'array' then raise exception 'Histórico de parcelamento inválido'; end if;
    total_anterior := round(origem.valor*100);
    esperado := jsonb_build_object('valor_centavos',total_anterior,'status',origem.status,
      'data_vencimento',origem.data_vencimento,'fornecedor',origem.fornecedor,'descricao',origem.descricao,
      'obra_id',origem.obra_id,'nota_id',origem.nota_id,'nota_ref',origem.nota_ref);
    if p_pedido->'original' is distinct from esperado then
      raise exception 'Conta alterada após a abertura; recarregue antes de desdobrar';
    end if;
    if total<>total_anterior and
        ((p_pedido->'aceitar_divergencia') is distinct from 'true'::jsonb or length(motivo)=0) then
      raise exception 'Soma diferente da conta original: confirme a divergência e informe o motivo';
    end if;
    anterior := to_jsonb(origem)-'parcelamento';
    historico := origem.parcelamento;
    fornecedor := origem.fornecedor;
    descricao := origem.descricao;
    referencia := origem.nota_ref;
    obra := origem.obra_id;
    nota := origem.nota_id;
    tipo_conta := origem.tipo;
    situacao := 'pendente';
  end if;
  if obra is not null and not exists(select 1 from public.obras where id=obra and company_id=empresa) then
    raise exception 'Obra indisponível nesta empresa';
  end if;
  if length(coalesce(descricao,''))>2000 then raise exception 'Descrição muito longa'; end if;

  for i in 1..qtd loop
    ids := array_append(ids, case when modo='desdobrar' and i=1 then origem.id else gen_random_uuid() end);
  end loop;
  recibo := jsonb_build_object('operacao_id',p_operacao_id,'pedido',p_pedido,'usuario_id',ator,
    'criado_em',clock_timestamp(),'conta_origem_id',origem.id,'anterior',anterior,
    'total_anterior_centavos',total_anterior,'total_novo_centavos',total,'conta_ids',to_jsonb(ids));
  historico := historico || jsonb_build_array(recibo);
  i := 0;
  for parcela in select value from jsonb_array_elements(parcelas) loop
    i := i+1;
    numero := btrim(coalesce(parcela->>'numero',''));
    if modo='desdobrar' and i=1 then
      update public.contas_pagar c set
        valor=(parcela->>'valor_centavos')::numeric/100,
        data_vencimento=(parcela->>'vencimento')::date,
        descricao=coalesce(parcelar.descricao,'') || case when qtd>1 then ' - Parcela '||i||'/'||qtd else '' end
          || case when numero<>'' then ' (duplicata '||numero||')' else '' end,
        parcelamento=historico
      where c.id=origem.id and c.company_id=empresa returning * into conta;
      if not found then raise exception 'Conta não atualizada; nenhuma parcela foi salva'; end if;
    else
      insert into public.contas_pagar(id,company_id,fornecedor,descricao,valor,data_vencimento,
        obra_id,nota_id,nota_ref,status,data_pagamento,tipo,parcelamento)
      values(ids[i],empresa,fornecedor,coalesce(descricao,'')
        || case when qtd>1 then ' - Parcela '||i||'/'||qtd else '' end
        || case when numero<>'' then ' (duplicata '||numero||')' else '' end,
        (parcela->>'valor_centavos')::numeric/100,(parcela->>'vencimento')::date,
        obra,nota,referencia,situacao,pagamento,tipo_conta,historico)
      returning * into conta;
    end if;
    resultado := resultado || jsonb_build_array(to_jsonb(conta));
  end loop;
  return jsonb_build_object('contas',resultado,'repetida',false);
end;
$$;

-- Uma exclusão apagaria o recibo que impede repetir pagamentos após perda de
-- resposta. Somente contas produzidas por este fluxo ganham esta proteção.
-- Não muda policies ou privilégios. Cancelamento/reconciliação exige fluxo próprio.
create or replace function public.preservar_historico_parcelamento_conta()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i integer;
begin
  if tg_op='DELETE' then
    if jsonb_array_length(old.parcelamento)>0 then
      raise exception 'Conta com histórico de parcelamento: preserve o registro para conciliação';
    end if;
    return old;
  end if;
  if jsonb_typeof(new.parcelamento) is distinct from 'array'
      or jsonb_array_length(new.parcelamento)<jsonb_array_length(old.parcelamento) then
    raise exception 'Histórico de parcelamento deve ser preservado';
  end if;
  for i in 0..jsonb_array_length(old.parcelamento)-1 loop
    if new.parcelamento->i is distinct from old.parcelamento->i then
      raise exception 'Histórico de parcelamento não pode ser reescrito';
    end if;
  end loop;
  if jsonb_array_length(old.parcelamento)>0
      and jsonb_array_length(new.parcelamento)=jsonb_array_length(old.parcelamento)
      and row(new.valor,new.data_vencimento,new.nota_id,new.nota_ref,new.obra_id,new.fornecedor,new.descricao,new.tipo)
        is distinct from row(old.valor,old.data_vencimento,old.nota_id,old.nota_ref,old.obra_id,old.fornecedor,old.descricao,old.tipo) then
    raise exception 'Revise esta conta pelo parcelamento para preservar o histórico';
  end if;
  return new;
end;
$$;
drop trigger if exists preservar_historico_parcelamento_conta on public.contas_pagar;
create trigger preservar_historico_parcelamento_conta before delete or update on public.contas_pagar
for each row execute function public.preservar_historico_parcelamento_conta();

commit;
