-- EDR System — EST-TX-01 — CANDIDATO LOCAL, NAO APLICADO.
-- Esquema base conferido por leitura em 2026-09-06 (PostgreSQL 17).
-- A RPC fica DESATIVADA por empresa; ativacao/cutover exige revisao e autorizacao.
-- Este roteiro termina em ROLLBACK. Testes extraem somente o corpo entre marcadores.
begin;
-- BEGIN ESTOQUE TX BODY
-- Pre-requisito: notas-custo-atomico-DRAFT.sql (custos_itens_nota).

create table public.estoque_transacao_config (
  company_id uuid primary key references public.companies(id),
  habilitado boolean not null default false
);
create table public.estoque_operacoes (
  company_id uuid not null references public.companies(id),
  operacao_id uuid not null,
  pedido jsonb not null,
  distribuicao_id uuid not null unique,
  lancamento_id uuid not null unique,
  resposta jsonb,
  criado_em timestamptz not null default clock_timestamp(),
  primary key (company_id, operacao_id)
);
alter table public.distribuicoes add column estoque_efetivo_em timestamptz;

-- Chaves compostas impedem referencias cruzadas mesmo em gravacao privilegiada.
create unique index estoque_tx_dist_empresa_id on public.distribuicoes(company_id,id);
create unique index estoque_tx_nf_empresa_id on public.notas_fiscais(company_id,id);
create unique index estoque_tx_ed_empresa_id on public.entradas_diretas(company_id,id);
create unique index estoque_tx_aj_empresa_id on public.ajustes_estoque(company_id,id);
create unique index estoque_tx_mat_empresa_id on public.materiais(company_id,id);
create table public.estoque_saida_origens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  distribuicao_id uuid not null,
  material_id uuid not null,
  tipo text not null check (tipo in ('nf','entrada_direta','ajuste','contagem','sem_origem')),
  nota_id uuid,
  item_idx integer,
  entrada_direta_id uuid,
  ajuste_id uuid,
  qtd numeric not null check (qtd > 0 and qtd::text not in ('NaN','Infinity','-Infinity')),
  preco_origem numeric not null check (preco_origem >= 0 and preco_origem::text not in ('NaN','Infinity','-Infinity')),
  custo numeric not null check (custo >= 0 and custo::text not in ('NaN','Infinity','-Infinity')),
  check (
    (tipo='nf' and nota_id is not null and item_idx is not null and item_idx>=0 and entrada_direta_id is null and ajuste_id is null)
    or (tipo='entrada_direta' and entrada_direta_id is not null and nota_id is null and item_idx is null and ajuste_id is null)
    or (tipo in ('ajuste','contagem') and ajuste_id is not null and nota_id is null and item_idx is null and entrada_direta_id is null)
    or (tipo='sem_origem' and ajuste_id is null and nota_id is null and item_idx is null and entrada_direta_id is null)
  ),
  foreign key (company_id,distribuicao_id) references public.distribuicoes(company_id,id) on delete cascade,
  foreign key (company_id,material_id) references public.materiais(company_id,id) on delete restrict,
  foreign key (company_id,nota_id) references public.notas_fiscais(company_id,id) on delete restrict,
  foreign key (company_id,entrada_direta_id) references public.entradas_diretas(company_id,id) on delete restrict,
  foreign key (company_id,ajuste_id) references public.ajustes_estoque(company_id,id) on delete restrict
);
create index estoque_tx_origem_dist on public.estoque_saida_origens(company_id,distribuicao_id);
create index estoque_tx_origem_nf on public.estoque_saida_origens(company_id,nota_id);
create index estoque_tx_origem_ed on public.estoque_saida_origens(company_id,entrada_direta_id);
create index estoque_tx_origem_aj on public.estoque_saida_origens(company_id,ajuste_id);
create index estoque_tx_origem_material on public.estoque_saida_origens(company_id,material_id);

alter table public.estoque_transacao_config enable row level security;
alter table public.estoque_operacoes enable row level security;
alter table public.estoque_saida_origens enable row level security;
revoke all on public.estoque_transacao_config, public.estoque_operacoes, public.estoque_saida_origens from public,anon,authenticated;
grant select on public.estoque_saida_origens to authenticated;
create policy estoque_origens_leitura on public.estoque_saida_origens for select to authenticated
using (company_id=public.auth_company_id());

create function public._estoque_tx_num(p jsonb, variadic campos text[])
returns numeric language plpgsql immutable set search_path=pg_catalog,public as $$
declare c text; v numeric;
begin
  foreach c in array campos loop
    if nullif(p->>c,'') is not null then
      v := (p->>c)::numeric;
      if v::text in ('NaN','Infinity','-Infinity') then raise exception 'numero nao finito no estoque'; end if;
      return v;
    end if;
  end loop;
  return 0;
end $$;
create function public._estoque_tx_nome(p text)
returns text language sql immutable set search_path=pg_catalog,public as $$
  select lower(regexp_replace(normalize(coalesce(p,''),NFD),U&'[\0300-\036f]','','g'));
$$;
create function public._estoque_tx_confere(p_codigo text,p_nome text,p_material public.materiais)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select case when nullif(p_codigo,'') is not null then p_codigo=p_material.codigo
    else public._estoque_tx_nome(p_nome)=public._estoque_tx_nome(p_material.nome) end;
$$;
create function public._estoque_tx_momento(p_dia date,p_criado timestamptz)
returns timestamptz language sql immutable set search_path=pg_catalog,public as $$
  select case when p_dia is null then p_criado
    when (p_criado at time zone 'America/Sao_Paulo')::date=p_dia then p_criado
    else p_dia::timestamp at time zone 'America/Sao_Paulo' end;
$$;
create function public._estoque_tx_real(p_tipo text,p_motivo text)
returns numeric language plpgsql immutable set search_path=pg_catalog,public as $$
declare v text; n numeric;
begin
  if p_tipo is distinct from 'contagem' then return null; end if;
  v := (regexp_match(coalesce(p_motivo,''),'real\s*:?\s*(?:R\$\s*)?([0-9](?:[0-9.,]*[0-9])?(?:e[+-]?[0-9]+)?)','i'))[1];
  if v is null then return null; end if;
  if position(',' in v)>0 then v:=replace(replace(v,'.',''),',','.'); end if;
  n:=v::numeric;
  if n<0 or n::text in ('NaN','Infinity','-Infinity') then return null; end if;
  return n;
end $$;
create function public._estoque_tx_liquido(p jsonb)
returns numeric language sql immutable set search_path=pg_catalog,public as $$
  select case when nullif(p->>'total','') is not null then public._estoque_tx_num(p,'total')
    else greatest(0, public._estoque_tx_num(p,'qtd_estoque','quantidade','qtd') *
      public._estoque_tx_num(p,'preco_estoque','preco_unitario','preco') - public._estoque_tx_num(p,'desconto')) end;
$$;

-- Bloqueio comum por EMPRESA nesta primeira versao; deliberadamente mais amplo
-- que material para abranger NFs multi-item e evitar ordem divergente de chaves.
create function public._estoque_tx_lock(p_company uuid)
returns void language sql volatile set search_path=pg_catalog,public as $$
  select pg_advisory_xact_lock(hashtextextended('edr:estoque:'||p_company::text,0));
$$;
create function public._estoque_tx_serializar()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid; antigo uuid;
begin
  c:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  if tg_op='UPDATE' then
    antigo:=old.company_id;
    if antigo is distinct from c then raise exception 'nao transferir historico de estoque entre empresas'; end if;
  end if;
  perform public._estoque_tx_lock(c);
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger a00_estoque_tx_lock before insert or update or delete on public.notas_fiscais for each row execute function public._estoque_tx_serializar();
create trigger a00_estoque_tx_lock before insert or update or delete on public.entradas_diretas for each row execute function public._estoque_tx_serializar();
create trigger a00_estoque_tx_lock before insert or update or delete on public.ajustes_estoque for each row execute function public._estoque_tx_serializar();
create trigger a00_estoque_tx_lock before insert or update or delete on public.distribuicoes for each row execute function public._estoque_tx_serializar();
create trigger a00_estoque_tx_lock before insert or update or delete on public.lancamentos for each row execute function public._estoque_tx_serializar();
create trigger a00_estoque_tx_lock before insert or update or delete on public.materiais for each row execute function public._estoque_tx_serializar();

create function public._estoque_tx_consumir(p_lotes jsonb,p_qtd numeric,p_chave text default null)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare l jsonb; usados numeric; restante numeric:=p_qtd; lotes jsonb:='[]';
begin
  for l in select value from jsonb_array_elements(p_lotes) loop
    if restante>0 and (p_chave is null or l->>'chave'=p_chave) then
      usados:=least((l->>'saldo')::numeric,restante);
      l:=jsonb_set(l,'{saldo}',to_jsonb((l->>'saldo')::numeric-usados));
      restante:=restante-usados;
    end if;
    lotes:=lotes||jsonb_build_array(l);
  end loop;
  return jsonb_build_object('lotes',lotes,'restante',restante);
end $$;

create function public._estoque_tx_recompor(p_material public.materiais,p_efetivo timestamptz,p_pendencia uuid default null,p_substitutas jsonb default null)
returns jsonb language plpgsql volatile set search_path=pg_catalog,public as $$
declare
  eventos jsonb; e jsonb; l jsonb; al jsonb; r jsonb; lotes jsonb:='[]';
  divida numeric:=0; total numeric; q numeric; valor_total numeric; entradas numeric;
  media numeric:=0; chave text; momento timestamptz; n numeric;
begin
  -- Identificacao por codigo ou nome exato normalizado. Nunca fuzzy.
  with nf as (
    select nota_entrada.*,j.value as item,(j.ordinality-1)::integer as idx,
      public.custos_itens_nota(to_jsonb(nota_entrada)) as custos
    from public.notas_fiscais nota_entrada
    cross join lateral jsonb_array_elements(coalesce(nota_entrada.itens,'[]')::jsonb) with ordinality j
    where nota_entrada.company_id=p_material.company_id and nota_entrada.obra='EDR'
  ), eventos as (
    select jsonb_build_object(
      'tipo',case when natureza='DEVOLUCAO' then 'devolucao' else 'nf' end,
      'id',id,'idx',idx,'chave','nf:'||id||':'||idx,
      'origem','nf:'||nota_origem_id||':'||(item->>'item_idx_origem'),
      'momento',public._estoque_tx_momento(coalesce(data_efetiva_estoque,data_recebimento,data),criado_em),
      'qtd',public._estoque_tx_num(item,'qtd_estoque','quantidade','qtd'),
      'total',case when natureza='DEVOLUCAO' then coalesce((
        select ((public.custos_itens_nota(to_jsonb(origem))->((item->>'item_idx_origem')::integer)->>'total')::numeric /
          nullif(public._estoque_tx_num(origem.itens::jsonb->((item->>'item_idx_origem')::integer),'qtd_estoque','quantidade','qtd'),0)) * public._estoque_tx_num(item,'qtd_estoque','quantidade','qtd')
        from public.notas_fiscais origem where origem.id=nf.nota_origem_id and origem.company_id=p_material.company_id
      ),(custos->idx->>'total')::numeric) else (custos->idx->>'total')::numeric end,
      'ord',case when natureza='DEVOLUCAO' then 4 else 0 end
    ) as e from nf where public._estoque_tx_confere(
      coalesce(nullif(item->>'codigo_catalogo',''),nullif(item->>'codigo',''),nullif(item->>'cod','')),
      coalesce(item->>'descricao',item->>'desc'),p_material)
    union all
    select jsonb_build_object('tipo','entrada_direta','id',id,'chave','entrada_direta:'||id,
      'momento',public._estoque_tx_momento(data,criado_em),'qtd',qtd,'total',qtd*coalesce(preco,0),
      'vinculada',nf_vinculada,'ord',0)
    from public.entradas_diretas
    where company_id=p_material.company_id and public._estoque_tx_confere(codigo_catalogo,item_desc,p_material)
    union all
    select jsonb_build_object('tipo',case when public._estoque_tx_real(tipo,motivo) is not null then 'contagem' else 'ajuste' end,
      'id',id,'chave',case when public._estoque_tx_real(tipo,motivo) is not null then 'contagem:' else 'ajuste:' end||id,
      'momento',criado_em,'qtd',qtd,'real',public._estoque_tx_real(tipo,motivo),
      'ord',case when public._estoque_tx_real(tipo,motivo) is not null then 2 else 1 end)
    from public.ajustes_estoque
    where company_id=p_material.company_id and public._estoque_tx_confere(codigo_catalogo,item_desc,p_material)
    union all
    select jsonb_build_object('tipo','saida','id',d.id,'chave','saida:'||d.id,
      'momento',coalesce(d.estoque_efetivo_em,public._estoque_tx_momento(d.data,d.criado_em)),
      'qtd',d.qtd,'ord',3,'alocacoes',(select jsonb_agg(a.al order by a.ord) from (
        select o.id::text as ord,jsonb_build_object('chave',
        case when o.tipo='nf' then 'nf:'||o.nota_id||':'||o.item_idx
          when o.tipo='entrada_direta' then 'entrada_direta:'||o.entrada_direta_id
          when o.tipo='sem_origem' then 'sem_origem'
          else o.tipo||':'||o.ajuste_id end,'qtd',o.qtd) as al
        from public.estoque_saida_origens o where o.company_id=d.company_id and o.distribuicao_id=d.id
          and o.id is distinct from p_pendencia
        union all select 'virtual:'||j.ordinality,j.value from jsonb_array_elements(p_substitutas) with ordinality j
        where exists(select 1 from public.estoque_saida_origens x where x.company_id=d.company_id and x.distribuicao_id=d.id and x.id=p_pendencia)
        ) a))
    from public.distribuicoes d
    left join public.notas_fiscais n on n.id=d.nota_id and n.company_id=d.company_id
    left join public.lancamentos lc on lc.id=d.lancamento_id and lc.company_id=d.company_id
    where d.company_id=p_material.company_id and public._estoque_tx_confere(d.codigo_catalogo,d.item_desc,p_material)
      and (n.id is null or coalesce(n.obra,'EDR')='EDR')
      and coalesce(lc.origem,'')<>'compra_direta'
  )
  select coalesce(jsonb_agg(ev.e order by (ev.e->>'momento')::timestamptz,(ev.e->>'ord')::integer,ev.e->>'chave'),'[]'),
    coalesce(sum(case when ev.e->>'tipo' in ('nf','entrada_direta') then (ev.e->>'total')::numeric
      when ev.e->>'tipo'='devolucao' then -(ev.e->>'total')::numeric else 0 end),0),
    coalesce(sum(case when ev.e->>'tipo' in ('nf','entrada_direta') then (ev.e->>'qtd')::numeric
      when ev.e->>'tipo'='devolucao' then -(ev.e->>'qtd')::numeric else 0 end),0)
  into eventos,valor_total,entradas from eventos ev;
  if entradas>0 then media:=valor_total/entradas; end if;
  if media<0 or media::text in ('NaN','Infinity','-Infinity') then raise exception 'custo historico invalido'; end if;
  for e in select value from jsonb_array_elements(eventos) loop
    momento:=(e->>'momento')::timestamptz;
    q:=(e->>'qtd')::numeric; chave:=e->>'chave';
    if momento is null then raise exception 'historico sem data: conferir antes de usar a operacao atomica'; end if;
    if momento>p_efetivo then raise exception 'saida anterior ao ultimo movimento: conferir historico'; end if;
    if q is null or q::text in ('NaN','Infinity','-Infinity') then raise exception 'quantidade historica invalida'; end if;
    if e->>'tipo' in ('nf','entrada_direta') then
      if e->>'vinculada' is not null then raise exception 'entrada vinculada a NF exige reconciliacao'; end if;
      if q<=0 or (e->>'total')::numeric<0 then raise exception 'entrada historica invalida'; end if;
      n:=least(q,divida); divida:=divida-n;
      lotes:=lotes||jsonb_build_array(jsonb_build_object('chave',chave,'tipo',e->>'tipo',
        'id',e->>'id','idx',e->'idx','saldo',q-n,'preco',(e->>'total')::numeric/q));
    elsif e->>'tipo'='contagem' then
      select coalesce(sum((value->>'saldo')::numeric),0) into total from jsonb_array_elements(lotes);
      divida:=0; q:=(e->>'real')::numeric-total;
      if q<0 then
        r:=public._estoque_tx_consumir(lotes,-q); lotes:=r->'lotes';
      elsif q>0 then
        lotes:=lotes||jsonb_build_array(jsonb_build_object('chave',chave,'tipo','contagem','id',e->>'id','saldo',q,'preco',media));
      end if;
    elsif e->>'tipo'='ajuste' and q>0 then
      n:=least(q,divida); divida:=divida-n;
      lotes:=lotes||jsonb_build_array(jsonb_build_object('chave',chave,'tipo','ajuste','id',e->>'id','saldo',q-n,'preco',media));
    elsif e->>'tipo'='saida' and e->'alocacoes'<>'null'::jsonb then
      select sum((value->>'qtd')::numeric) into total from jsonb_array_elements(e->'alocacoes');
      if total is distinct from q then raise exception 'origens nao correspondem a saida'; end if;
      for al in select value from jsonb_array_elements(e->'alocacoes') loop
        if al->>'chave'='sem_origem' then
          divida:=divida+(al->>'qtd')::numeric;
          continue;
        end if;
        r:=public._estoque_tx_consumir(lotes,(al->>'qtd')::numeric,al->>'chave');
        if (r->>'restante')::numeric>0 then raise exception 'historico alterado invalidou uma origem registrada'; end if;
        lotes:=r->'lotes';
      end loop;
    else
      if e->>'tipo'='ajuste' then q:=-q; end if;
      if q<0 then raise exception 'saida/devolucao historica invalida'; end if;
      if e->>'tipo'='devolucao' and e->>'origem' is null then raise exception 'devolucao sem origem'; end if;
      r:=public._estoque_tx_consumir(lotes,q,case when e->>'tipo'='devolucao' then e->>'origem' else null end);
      lotes:=r->'lotes'; divida:=divida+(r->>'restante')::numeric;
    end if;
  end loop;
  select coalesce(sum((value->>'saldo')::numeric),0) into total from jsonb_array_elements(lotes);
  return jsonb_build_object('lotes',lotes,'saldo',total-divida,'media',media,
    'revisao_historico',md5(eventos::text||to_jsonb(p_material)::text));
end $$;

create function public._estoque_tx_lotes(p_material public.materiais,p_efetivo timestamptz)
returns jsonb language sql volatile set search_path=pg_catalog,public as $$
  select public._estoque_tx_recompor(p_material,p_efetivo);
$$;

create function public.registrar_saida_estoque_atomica(
  p_operacao_id uuid,p_material_id uuid,p_obra_id uuid,p_qtd numeric,p_efetivo_em timestamptz,
  p_etapa text,p_criterio text default 'fifo',p_destino_custo text default 'nao_classificado',
  p_adicional_id uuid default null,p_obs text default '',p_sem_origem_confirmada numeric default 0,
  p_preco_manual numeric default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); pedido jsonb; op public.estoque_operacoes%rowtype;
  material public.materiais%rowtype; obra public.obras%rowtype; estado jsonb; l jsonb;
  alocacoes jsonb:='[]'; usar numeric; restante numeric:=p_qtd; custo numeric:=0; parcela numeric;
  d_id uuid:=gen_random_uuid(); lc_id uuid:=gen_random_uuid(); v_resposta jsonb; o jsonb;
  preco_medio numeric; sem_origem numeric:=0;
begin
  if c is null or ator is null then raise exception 'sessao sem empresa' using errcode='28000'; end if;
  if public.auth_user_role() is null or public.auth_user_role() not in ('admin','operacional') then
    raise exception 'perfil sem permissao para saida de estoque' using errcode='42501';
  end if;
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'operacao de estoque exige read committed';
  end if;
  perform public._estoque_tx_lock(c);
  if not exists(select 1 from public.estoque_transacao_config where company_id=c and habilitado) then
    raise exception 'operacao atomica ainda nao habilitada para esta empresa' using errcode='55000';
  end if;
  if p_operacao_id is null or p_material_id is null or p_obra_id is null or p_efetivo_em is null
    or p_qtd is null or p_qtd<=0 or p_qtd::text in ('NaN','Infinity','-Infinity')
    or nullif(trim(p_etapa),'') is null or p_criterio is null or p_criterio not in ('fifo','medio')
    or p_destino_custo is null or p_destino_custo not in ('padrao','adicional','nao_classificado')
    or (p_destino_custo='adicional') is distinct from (p_adicional_id is not null)
    or p_sem_origem_confirmada is null or p_sem_origem_confirmada<0 or p_sem_origem_confirmada>p_qtd
    or p_sem_origem_confirmada::text in ('NaN','Infinity','-Infinity')
    or (p_preco_manual is not null and (p_preco_manual<=0 or p_preco_manual::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'pedido de saida invalido' using errcode='22023';
  end if;
  pedido:=jsonb_build_object('material_id',p_material_id,'obra_id',p_obra_id,'qtd',p_qtd,
    'efetivo_em',p_efetivo_em,'etapa',p_etapa,'criterio',p_criterio,'destino_custo',p_destino_custo,
    'adicional_id',p_adicional_id,'obs',coalesce(p_obs,''),
    'sem_origem_confirmada',p_sem_origem_confirmada,'preco_manual',p_preco_manual);
  select * into op from public.estoque_operacoes where company_id=c and operacao_id=p_operacao_id;
  if found then
    if op.pedido<>pedido then raise exception 'identificador ja usado para outro pedido' using errcode='23505'; end if;
    if not exists(select 1 from public.distribuicoes where company_id=c and id=op.distribuicao_id) then
      return op.resposta||jsonb_build_object('status','excluida');
    end if;
    return op.resposta||jsonb_build_object('repetida',true);
  end if;
  if p_efetivo_em>clock_timestamp() or (p_efetivo_em at time zone 'America/Sao_Paulo')::date
    <(clock_timestamp() at time zone 'America/Sao_Paulo')::date then
    raise exception 'primeira versao atomica exige horario efetivo de hoje, sem data futura';
  end if;
  select * into material from public.materiais where id=p_material_id and company_id=c for share;
  if not found or material.movimenta_estoque is false then raise exception 'material indisponivel nesta empresa'; end if;
  select * into obra from public.obras where id=p_obra_id and company_id=c for share;
  if not found or obra.arquivada is true then raise exception 'obra indisponivel nesta empresa'; end if;

  estado:=public._estoque_tx_lotes(material,p_efetivo_em);
  preco_medio:=(estado->>'media')::numeric;
  if preco_medio<=0 and p_preco_manual is not null then preco_medio:=p_preco_manual; end if;
  if p_criterio='medio' and preco_medio<=0 then raise exception 'informe o custo unitario para material sem custo historico'; end if;
  if greatest(0,p_qtd-greatest(0,(estado->>'saldo')::numeric))>p_sem_origem_confirmada then
    raise exception 'saldo insuficiente ou alterado; confirme a quantidade sem origem';
  end if;
  for l in select value from jsonb_array_elements(estado->'lotes') loop
    exit when restante=0;
    usar:=least(restante,(l->>'saldo')::numeric);
    if usar<=0 then continue; end if;
    parcela:=usar*case when p_criterio='medio' then preco_medio when (l->>'preco')::numeric=0 and p_preco_manual>0 then p_preco_manual else (l->>'preco')::numeric end;
    alocacoes:=alocacoes||jsonb_build_array(l||jsonb_build_object('qtd',usar,'custo',parcela));
    custo:=custo+parcela; restante:=restante-usar;
  end loop;
  if restante>p_sem_origem_confirmada then raise exception 'origens insuficientes: confirme novamente'; end if;
  if restante>0 then
    if preco_medio<=0 then raise exception 'informe o custo unitario para quantidade sem origem'; end if;
    sem_origem:=restante;
    parcela:=restante*preco_medio;
    alocacoes:=alocacoes||jsonb_build_array(jsonb_build_object('tipo','sem_origem','chave','sem_origem',
      'id',null,'idx',null,'qtd',restante,'preco',preco_medio,'custo',parcela));
    custo:=custo+parcela;
  end if;
  if custo<0 or custo::text in ('NaN','Infinity','-Infinity') then raise exception 'custo invalido'; end if;
  insert into public.estoque_operacoes(company_id,operacao_id,pedido,distribuicao_id,lancamento_id)
    values(c,p_operacao_id,pedido,d_id,lc_id);
  -- nota_id fica nulo em AMBOS os registros: origens filhas sao a autoridade.
  -- Evita que a exclusao legada de uma NF apague silenciosamente uma saida mista.
  insert into public.lancamentos(id,company_id,obra_id,descricao,qtd,preco,total,data,etapa,origem,
    nota_id,destino_custo,adicional_id,obs,criado_por)
  values(lc_id,c,p_obra_id,material.codigo||' · '||material.nome,p_qtd,custo/p_qtd,custo,
    (p_efetivo_em at time zone 'America/Sao_Paulo')::date,p_etapa,
    case when p_criterio='medio' then 'saida_manual' else 'distribuicao_estoque' end,
    null,p_destino_custo,p_adicional_id,coalesce(p_obs,''),ator::text);
  insert into public.distribuicoes(id,company_id,nota_id,item_desc,item_idx,obra_id,obra_nome,qtd,valor,
    data,estoque_efetivo_em,lancamento_id,etapa,criado_por,codigo_catalogo)
  values(d_id,c,null,material.nome,0,p_obra_id,obra.nome,p_qtd,custo,
    (p_efetivo_em at time zone 'America/Sao_Paulo')::date,p_efetivo_em,lc_id,p_etapa,ator::text,material.codigo);
  for o in select value from jsonb_array_elements(alocacoes) loop
    insert into public.estoque_saida_origens(company_id,distribuicao_id,material_id,tipo,nota_id,item_idx,
      entrada_direta_id,ajuste_id,qtd,preco_origem,custo)
    values(c,d_id,p_material_id,o->>'tipo',
      case when o->>'tipo'='nf' then (o->>'id')::uuid end,
      case when o->>'tipo'='nf' then (o->>'idx')::integer end,
      case when o->>'tipo'='entrada_direta' then (o->>'id')::uuid end,
      case when o->>'tipo' in ('ajuste','contagem') then (o->>'id')::uuid end,
      (o->>'qtd')::numeric,(o->>'preco')::numeric,(o->>'custo')::numeric);
  end loop;
  v_resposta:=jsonb_build_object('status','registrada','operacao_id',p_operacao_id,'distribuicao_id',d_id,
    'lancamento_id',lc_id,'qtd',p_qtd,'custo',custo,'sem_origem',sem_origem,'saldo',(estado->>'saldo')::numeric-p_qtd,'origens',alocacoes,'repetida',false);
  update public.estoque_operacoes set resposta=v_resposta
    where company_id=c and operacao_id=p_operacao_id;
  return v_resposta;
end $$;

-- Invariante no fim da transacao: nem custo orfao nem alocacao parcial.
create function public._estoque_tx_invariante()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare op public.estoque_operacoes%rowtype; d public.distribuicoes%rowtype; lc public.lancamentos%rowtype;
  v_id uuid; c uuid; q numeric; custo numeric; qtd_origens bigint;
begin
  if tg_table_name='estoque_saida_origens' then
    v_id:=case when tg_op='DELETE' then old.distribuicao_id else new.distribuicao_id end;
  else v_id:=case when tg_op='DELETE' then old.id else new.id end; end if;
  c:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  select * into op from public.estoque_operacoes where company_id=c and distribuicao_id=v_id;
  if not found then return null; end if;
  select * into d from public.distribuicoes where id=v_id and company_id=c;
  if not found then
    if exists(select 1 from public.lancamentos where id=op.lancamento_id) then raise exception 'exclusao deixou custo orfao'; end if;
    return null;
  end if;
  select * into lc from public.lancamentos where id=op.lancamento_id and company_id=c;
  if not found or d.lancamento_id is distinct from lc.id or lc.total is distinct from d.valor
    or lc.qtd is distinct from d.qtd or lc.obra_id is distinct from d.obra_id then
    raise exception 'custo e saida divergentes';
  end if;
  select sum(o.qtd),sum(o.custo),count(*) into q,custo,qtd_origens from public.estoque_saida_origens o
    where o.company_id=c and o.distribuicao_id=v_id;
  if qtd_origens=0 or q is distinct from d.qtd or custo is distinct from d.valor then
    raise exception 'soma das origens diverge da saida';
  end if;
  return null;
end $$;
create constraint trigger estoque_tx_dist_invariante after insert or update or delete on public.distribuicoes
deferrable initially deferred for each row execute function public._estoque_tx_invariante();
create constraint trigger estoque_tx_origens_invariante after insert or update or delete on public.estoque_saida_origens
deferrable initially deferred for each row execute function public._estoque_tx_invariante();

-- Protege os fatos ja usados: metadados de NF podem mudar, origem/custo nao.
create function public._estoque_tx_proteger()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid; v_id uuid; usado boolean:=false;
begin
  c:=old.company_id; v_id:=old.id;
  if tg_table_name='notas_fiscais' then
    usado:=exists(select 1 from public.estoque_saida_origens where company_id=c and nota_id=v_id);
    if tg_op='UPDATE' and (new.company_id,new.itens,new.obra,new.natureza,new.data_efetiva_estoque,new.data_recebimento,new.data,new.frete_rateado,new.frete,new.outras_despesas,new.desconto_total,new.valor_bruto,new.criado_em)
      is not distinct from (old.company_id,old.itens,old.obra,old.natureza,old.data_efetiva_estoque,old.data_recebimento,old.data,old.frete_rateado,old.frete,old.outras_despesas,old.desconto_total,old.valor_bruto,old.criado_em) then return new; end if;
  elsif tg_table_name='entradas_diretas' then
    usado:=exists(select 1 from public.estoque_saida_origens where company_id=c and entrada_direta_id=v_id);
  elsif tg_table_name='ajustes_estoque' then
    usado:=exists(select 1 from public.estoque_saida_origens where company_id=c and ajuste_id=v_id);
  elsif tg_table_name='materiais' then
    usado:=exists(select 1 from public.estoque_saida_origens where company_id=c and material_id=v_id);
    if tg_op='UPDATE' and (new.company_id,new.codigo,new.nome,new.unidade,new.movimenta_estoque)
      is not distinct from (old.company_id,old.codigo,old.nome,old.unidade,old.movimenta_estoque) then return new; end if;
  elsif tg_table_name='distribuicoes' then
    usado:=exists(select 1 from public.estoque_operacoes where company_id=c and distribuicao_id=v_id);
    if tg_op='DELETE' then
      if usado and public.auth_user_role() is distinct from 'admin' then raise exception 'apenas admin exclui saida atomica' using errcode='42501'; end if;
      return old; -- exclusao conjunta e verificada pelo constraint trigger
    end if;
  elsif tg_table_name='lancamentos' then
    usado:=exists(select 1 from public.estoque_operacoes where company_id=c and lancamento_id=v_id);
    if tg_op='DELETE' then return old; end if; -- FK da distribuicao impede custo orfao
    if (new.company_id,new.qtd,new.preco,new.total,new.obra_id,new.data,new.nota_id,new.origem)
      is not distinct from (old.company_id,old.qtd,old.preco,old.total,old.obra_id,old.data,old.nota_id,old.origem) then return new; end if;
  end if;
  if usado then raise exception 'origem ou movimento usado em saida atomica; estorno controlado necessario'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger z90_estoque_tx_proteger before update or delete on public.notas_fiscais for each row execute function public._estoque_tx_proteger();
create trigger z90_estoque_tx_proteger before update or delete on public.entradas_diretas for each row execute function public._estoque_tx_proteger();
create trigger z90_estoque_tx_proteger before update or delete on public.ajustes_estoque for each row execute function public._estoque_tx_proteger();
create trigger z90_estoque_tx_proteger before update or delete on public.distribuicoes for each row execute function public._estoque_tx_proteger();
create trigger z90_estoque_tx_proteger before update or delete on public.lancamentos for each row execute function public._estoque_tx_proteger();
create trigger z90_estoque_tx_proteger before update or delete on public.materiais for each row execute function public._estoque_tx_proteger();

create function public._estoque_tx_devolucao()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare g record; anterior numeric; original numeric; origem public.notas_fiscais%rowtype;
begin
  if new.natureza is distinct from 'DEVOLUCAO' then return new; end if;
  if exists(select 1 from public.estoque_saida_origens where company_id=new.company_id and nota_id=new.nota_origem_id) then
    raise exception 'compra ja usada em saida atomica; devolucao bloqueada';
  end if;
  select * into origem from public.notas_fiscais where company_id=new.company_id and id=new.nota_origem_id;
  if not found then raise exception 'origem da devolucao inexistente nesta empresa'; end if;
  for g in select (value->>'item_idx_origem')::integer as idx,
    sum(public._estoque_tx_num(value,'qtd_estoque','quantidade','qtd')) as qtd
    from jsonb_array_elements(new.itens::jsonb) group by 1
  loop
    if g.idx is null or g.idx<0 or g.idx>=jsonb_array_length(origem.itens::jsonb) then raise exception 'item de origem invalido'; end if;
    -- Saldo recomposto nao prova de qual NF saiu o material anteriormente.
    if exists(select 1 from public.estoque_saida_origens o join public.materiais m
      on m.company_id=o.company_id and m.id=o.material_id
      where o.company_id=new.company_id and o.tipo='sem_origem'
      and public._estoque_tx_confere(coalesce(nullif(origem.itens::jsonb->g.idx->>'codigo_catalogo',''),
        nullif(origem.itens::jsonb->g.idx->>'codigo',''),nullif(origem.itens::jsonb->g.idx->>'cod','')),
        coalesce(origem.itens::jsonb->g.idx->>'descricao',origem.itens::jsonb->g.idx->>'desc'),m)) then
      raise exception 'material possui saida sem origem; conferir antes de devolver';
    end if;
    original:=public._estoque_tx_num(origem.itens::jsonb->g.idx,'qtd_estoque','quantidade','qtd');
    select coalesce(sum(public._estoque_tx_num(j.value,'qtd_estoque','quantidade','qtd')),0) into anterior
    from public.notas_fiscais n cross join lateral jsonb_array_elements(n.itens::jsonb) j
    where n.company_id=new.company_id and n.natureza='DEVOLUCAO' and n.nota_origem_id=new.nota_origem_id
      and n.id is distinct from new.id and (j.value->>'item_idx_origem')::integer=g.idx;
    if g.qtd<=0 or g.qtd+anterior>original then raise exception 'devolucao agregada excede a compra'; end if;
  end loop;
  return new;
end $$;
create trigger zz_estoque_tx_devolucao before insert or update of natureza,nota_origem_id,itens,company_id
on public.notas_fiscais for each row execute function public._estoque_tx_devolucao();

-- Em empresa ativada, o caminho legado nao pode criar baixas do almoxarifado.
-- NF/compra DIRETA da obra permanece com seu fluxo existente.
create function public._estoque_tx_exigir_rpc()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not exists(select 1 from public.estoque_transacao_config where company_id=new.company_id and habilitado) then return new; end if;
  if exists(select 1 from public.estoque_operacoes where company_id=new.company_id and distribuicao_id=new.id and lancamento_id=new.lancamento_id) then return new; end if;
  if exists(select 1 from public.notas_fiscais n where n.company_id=new.company_id and n.id=new.nota_id and n.obra is not null and n.obra<>'EDR') then return new; end if;
  if exists(select 1 from public.lancamentos l where l.company_id=new.company_id and l.id=new.lancamento_id and l.origem='compra_direta') then return new; end if;
  raise exception 'saida de almoxarifado exige operacao atomica';
end $$;
create trigger a10_estoque_tx_exigir_rpc before insert on public.distribuicoes
for each row execute function public._estoque_tx_exigir_rpc();


-- Toda alteracao de historico usada por esta empresa precisa preservar as
-- alocacoes ja gravadas. Verificacao DIFERIDA permite excluir custo+saida juntos.
create function public._estoque_tx_validar_historico()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid; m public.materiais%rowtype;
begin
  c:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  for m in select mat.* from public.materiais mat where mat.company_id=c and exists (
    select 1 from public.estoque_saida_origens o where o.company_id=c and o.material_id=mat.id
  ) loop
    perform public._estoque_tx_lotes(m,clock_timestamp());
  end loop;
  return null;
end $$;
create constraint trigger estoque_tx_nf_historico after insert or update or delete on public.notas_fiscais deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();
create constraint trigger estoque_tx_ed_historico after insert or update or delete on public.entradas_diretas deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();
create constraint trigger estoque_tx_aj_historico after insert or update or delete on public.ajustes_estoque deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();
create constraint trigger estoque_tx_dist_historico after insert or update or delete on public.distribuicoes deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();
create constraint trigger estoque_tx_lanc_historico after insert or update or delete on public.lancamentos deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();
create constraint trigger estoque_tx_mat_historico after insert or update or delete on public.materiais deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();

-- EST-REG-01: somente vinculo comprovado. O custo contabilizado permanece.
create table public.estoque_regularizacoes (
  company_id uuid not null references public.companies(id),
  operacao_id uuid not null,
  pedido jsonb not null,
  material_id uuid not null,
  distribuicao_id uuid not null,
  origem_anterior jsonb not null,
  origem_nova jsonb not null,
  proposta jsonb not null,
  resposta jsonb not null,
  ator uuid not null,
  criado_em timestamptz not null default clock_timestamp(),
  primary key(company_id,operacao_id),
  foreign key(company_id,material_id) references public.materiais(company_id,id)
);
-- Sem FK para saida/origem: a evidencia sobrevive ao estorno conjunto.
alter table public.estoque_regularizacoes enable row level security;
revoke all on public.estoque_regularizacoes from public,anon,authenticated;
grant select on public.estoque_regularizacoes to authenticated;
create policy estoque_regularizacoes_leitura on public.estoque_regularizacoes for select to authenticated
using(company_id=public.auth_company_id());
create function public._estoque_tx_auditoria_imutavel() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'evidencia de regularizacao e imutavel'; end $$;
create trigger estoque_regularizacoes_imutaveis before update or delete on public.estoque_regularizacoes
for each row execute function public._estoque_tx_auditoria_imutavel();

create function public._estoque_tx_admin_regularizacao() returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=public.auth_company_id();
begin
  if c is null or auth.uid() is null then raise exception 'sessao sem empresa' using errcode='28000'; end if;
  if public.auth_user_role() is distinct from 'admin' then raise exception 'apenas administrador regulariza origens' using errcode='42501'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'regularizacao exige READ COMMITTED'; end if;
  perform public._estoque_tx_lock(c);
  return c;
end $$;

create function public.propor_regularizacao_estoque(p_pendencia_id uuid,p_tipo text,p_origem_id uuid,p_item_idx integer,p_qtd numeric)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  c uuid:=public._estoque_tx_admin_regularizacao(); o public.estoque_saida_origens%rowtype;
  d public.distribuicoes%rowtype; m public.materiais%rowtype; nf public.notas_fiscais%rowtype;
  ed public.entradas_diretas%rowtype; item jsonb; fonte jsonb; antes jsonb; depois jsonb; alocacoes jsonb;
  momento timestamptz; preco numeric; total_itens numeric; q numeric; custo numeric; unidade text; proposta jsonb;
begin
  if p_pendencia_id is null or p_origem_id is null or p_tipo is null or p_tipo not in ('nf','entrada_direta')
    or p_qtd is null or p_qtd<=0 or p_qtd::text in ('NaN','Infinity','-Infinity') then raise exception 'proposta de regularizacao invalida'; end if;
  select * into o from public.estoque_saida_origens where id=p_pendencia_id and company_id=c and tipo='sem_origem';
  if not found or p_qtd>o.qtd then raise exception 'pendencia inexistente ou quantidade alterada'; end if;
  select * into d from public.distribuicoes where company_id=c and id=o.distribuicao_id;
  select * into m from public.materiais where company_id=c and id=o.material_id;
  if m.id is null or d.estoque_efetivo_em is null then raise exception 'historico incompleto para regularizacao'; end if;
  if p_tipo='nf' then
    select * into nf from public.notas_fiscais where company_id=c and id=p_origem_id and obra='EDR' and natureza is distinct from 'DEVOLUCAO';
    if not found or p_item_idx is null or p_item_idx<0 or p_item_idx>=jsonb_array_length(nf.itens::jsonb) then raise exception 'NF/item indisponivel nesta empresa'; end if;
    item:=nf.itens::jsonb->p_item_idx;
    if not public._estoque_tx_confere(coalesce(nullif(item->>'codigo_catalogo',''),nullif(item->>'codigo',''),nullif(item->>'cod','')),
      coalesce(item->>'descricao',item->>'desc'),m) then raise exception 'origem pertence a outro material'; end if;
    unidade:=coalesce(nullif(item->>'unidade_estoque',''),nullif(item->>'unidade',''),nullif(item->>'un',''));
    q:=public._estoque_tx_num(item,'qtd_estoque','quantidade','qtd');
    select sum(public._estoque_tx_liquido(value)) into total_itens from jsonb_array_elements(nf.itens::jsonb);
    preco:=(public.custos_itens_nota(to_jsonb(nf))->p_item_idx->>'total')::numeric/nullif(q,0);
    momento:=public._estoque_tx_momento(coalesce(nf.data_efetiva_estoque,nf.data_recebimento,nf.data),nf.criado_em);
    fonte:=jsonb_build_object('tipo','nf','id',nf.id,'item_idx',p_item_idx,'chave','nf:'||nf.id||':'||p_item_idx,
      'numero',nf.numero_nf,'fornecedor',nf.fornecedor,'documento',to_jsonb(nf));
  else
    if p_item_idx is not null then raise exception 'entrada direta nao aceita indice de NF'; end if;
    select * into ed from public.entradas_diretas where company_id=c and id=p_origem_id and obra='EDR' and nf_vinculada is null;
    if not found then raise exception 'entrada direta indisponivel ou vinculada a NF'; end if;
    if not public._estoque_tx_confere(ed.codigo_catalogo,ed.item_desc,m) then raise exception 'origem pertence a outro material'; end if;
    unidade:=ed.unidade; q:=ed.qtd; preco:=ed.preco;
    momento:=public._estoque_tx_momento(ed.data,ed.criado_em);
    fonte:=jsonb_build_object('tipo','entrada_direta','id',ed.id,'item_idx',null,'chave','entrada_direta:'||ed.id,
      'fornecedor',ed.fornecedor,'documento',to_jsonb(ed));
  end if;
  if nullif(trim(unidade),'') is null or upper(trim(unidade)) is distinct from upper(trim(m.unidade)) then
    raise exception 'unidade da origem ausente ou diferente do catalogo; conferir conversao antes de regularizar'; end if;
  if momento is null or momento>d.estoque_efetivo_em then raise exception 'recebimento posterior a saida nao comprova sua origem'; end if;
  if q is null or q<=0 or q::text in ('NaN','Infinity','-Infinity') or preco is null or preco<0 or preco::text in ('NaN','Infinity','-Infinity') then
    raise exception 'quantidade ou preco da origem invalido'; end if;
  antes:=public._estoque_tx_lotes(m,clock_timestamp());
  alocacoes:=jsonb_build_array(jsonb_build_object('chave',fonte->>'chave','qtd',p_qtd));
  if o.qtd>p_qtd then alocacoes:=alocacoes||jsonb_build_array(jsonb_build_object('chave','sem_origem','qtd',o.qtd-p_qtd)); end if;
  -- Substituicao virtual: valida a disponibilidade na saida E em todos os movimentos posteriores.
  depois:=public._estoque_tx_recompor(m,clock_timestamp(),o.id,alocacoes);
  if (antes->>'saldo')::numeric is distinct from (depois->>'saldo')::numeric then raise exception 'regularizacao alteraria saldo fisico; conferir historico'; end if;
  custo:=case when p_qtd=o.qtd then o.custo else o.custo*p_qtd/o.qtd end;
  proposta:=jsonb_build_object('company_id',c,'pendencia_id',o.id,'distribuicao_id',d.id,'material_id',m.id,
    'material',m.nome,'unidade',m.unidade,'obra',d.obra_nome,'saida_em',d.estoque_efetivo_em,
    'qtd',p_qtd,'pendencia_restante',o.qtd-p_qtd,'origem',fonte-'documento','recebido_em',momento,'preco_origem',preco,
    'custo_mantido',custo,'custo_referencia',p_qtd*preco,'diferenca_referencia',p_qtd*preco-custo,
    'saldo_antes',(antes->>'saldo')::numeric,'saldo_depois',(depois->>'saldo')::numeric,
    'tratamento_custo','manter_custo_registrado');
  return proposta||jsonb_build_object('revisao',md5(proposta::text||antes::text||to_jsonb(o)::text||to_jsonb(d)::text||fonte::text));
end $$;

create function public.regularizar_origem_estoque(p_operacao_id uuid,p_pendencia_id uuid,p_tipo text,p_origem_id uuid,
  p_item_idx integer,p_qtd numeric,p_revisao text,p_evidencia text,p_justificativa text,p_tratamento_custo text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  c uuid:=public._estoque_tx_admin_regularizacao(); pedido jsonb; op public.estoque_regularizacoes%rowtype;
  proposta jsonb; o public.estoque_saida_origens%rowtype; nova public.estoque_saida_origens%rowtype;
  resposta jsonb; v_custo numeric;
begin
  if p_operacao_id is null then raise exception 'identificador da regularizacao obrigatorio'; end if;
  pedido:=jsonb_build_object('pendencia_id',p_pendencia_id,'tipo',p_tipo,'origem_id',p_origem_id,'item_idx',p_item_idx,
    'qtd',p_qtd,'revisao',p_revisao,'evidencia',p_evidencia,'justificativa',p_justificativa,'tratamento_custo',p_tratamento_custo);
  select * into op from public.estoque_regularizacoes where company_id=c and operacao_id=p_operacao_id;
  if found then
    if op.pedido is distinct from pedido then raise exception 'identificador ja usado para outra regularizacao' using errcode='23505'; end if;
    return op.resposta||jsonb_build_object('repetida',true,'saida_excluida',not exists(select 1 from public.distribuicoes where company_id=c and id=op.distribuicao_id));
  end if;
  if not exists(select 1 from public.estoque_transacao_config where company_id=c and habilitado) then raise exception 'regularizacao ainda nao habilitada'; end if;
  if length(trim(coalesce(p_evidencia,''))) not between 10 and 2000 or length(trim(coalesce(p_justificativa,''))) not between 10 and 2000
    or p_tratamento_custo is distinct from 'manter_custo_registrado' then raise exception 'informe comprovante, justificativa e confirme manter o custo registrado'; end if;
  proposta:=public.propor_regularizacao_estoque(p_pendencia_id,p_tipo,p_origem_id,p_item_idx,p_qtd);
  if proposta->>'revisao' is distinct from p_revisao then raise exception 'historico alterado; gere e confira uma nova proposta' using errcode='P0001'; end if;
  select * into o from public.estoque_saida_origens where company_id=c and id=p_pendencia_id for update;
  v_custo:=(proposta->>'custo_mantido')::numeric;
  if p_qtd=o.qtd then delete from public.estoque_saida_origens where company_id=c and id=o.id;
  else update public.estoque_saida_origens set qtd=o.qtd-p_qtd,custo=o.custo-v_custo where company_id=c and id=o.id; end if;
  insert into public.estoque_saida_origens(company_id,distribuicao_id,material_id,tipo,nota_id,item_idx,entrada_direta_id,qtd,preco_origem,custo)
    values(c,o.distribuicao_id,o.material_id,p_tipo,case when p_tipo='nf' then p_origem_id end,
      case when p_tipo='nf' then p_item_idx end,case when p_tipo='entrada_direta' then p_origem_id end,p_qtd,(proposta->>'preco_origem')::numeric,v_custo)
    returning * into nova;
  resposta:=proposta||jsonb_build_object('status','regularizada','operacao_id',p_operacao_id,'origem_id',nova.id,'repetida',false,'saida_excluida',false);
  insert into public.estoque_regularizacoes(company_id,operacao_id,pedido,material_id,distribuicao_id,origem_anterior,origem_nova,proposta,resposta,ator)
    values(c,p_operacao_id,pedido,o.material_id,o.distribuicao_id,to_jsonb(o),to_jsonb(nova),proposta,resposta,auth.uid());
  return resposta;
end $$;
create trigger a00_estoque_tx_lock before insert or update or delete on public.estoque_saida_origens
for each row execute function public._estoque_tx_serializar();
create constraint trigger estoque_tx_origens_historico after insert or update or delete on public.estoque_saida_origens
deferrable initially deferred for each row execute function public._estoque_tx_validar_historico();
revoke all on function public.propor_regularizacao_estoque(uuid,text,uuid,integer,numeric) from public,anon,authenticated;
revoke all on function public.regularizar_origem_estoque(uuid,uuid,text,uuid,integer,numeric,text,text,text,text) from public,anon,authenticated;
grant execute on function public.propor_regularizacao_estoque(uuid,text,uuid,integer,numeric) to authenticated;
grant execute on function public.regularizar_origem_estoque(uuid,uuid,text,uuid,integer,numeric,text,text,text,text) to authenticated;


-- Contrato de leitura para descoberta; ausência da RPC mantém somente o modo legado.
create function public.estoque_operacao_status()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare c uuid:=public.auth_company_id();
begin
  if c is null or auth.uid() is null then raise exception 'sessao sem empresa' using errcode='28000'; end if;
  return jsonb_build_object('contrato',2,'company_id',c,'agora',clock_timestamp(),
    'hoje',(clock_timestamp() at time zone 'America/Sao_Paulo')::date,'regularizacao',1,
    'habilitado',exists(select 1 from public.estoque_transacao_config where company_id=c and habilitado));
end $$;
revoke all on function public.estoque_operacao_status() from public,anon,authenticated;
grant execute on function public.estoque_operacao_status() to authenticated;

-- Nenhum helper interno e uma API; somente a operacao tipada e exposta.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like '\_estoque\_tx\_%' escape '\'
  loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura); end loop;
end $$;
revoke all on function public.registrar_saida_estoque_atomica(uuid,uuid,uuid,numeric,timestamptz,text,text,text,uuid,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.registrar_saida_estoque_atomica(uuid,uuid,uuid,numeric,timestamptz,text,text,text,uuid,text,numeric,numeric) to authenticated;

-- END ESTOQUE TX BODY
-- NAO TROCAR POR COMMIT sem validar integracao, concorrencia real e rollback.
rollback;
