-- CORRECAO LOCAL PROPOSTA. Nao aplicada ao Supabase.
-- Aplicar antes de estoque-saida-atomica-DRAFT.sql e do frontend correspondente.
-- Nao corrige lancamentos historicos. Homologacao/autorizacao antes de publicar.
begin;
-- BEGIN NOTAS CUSTO BODY
create or replace function public.ratear_centavos_nota(p_total numeric,p_pesos numeric[])
returns numeric[] language sql immutable set search_path=pg_catalog,public as $$
  with pesos as (select v,i,sum(v) over() soma,count(*) over() n from unnest(p_pesos) with ordinality t(v,i)),
  acumulados as (select i,round(p_total*sum(case when soma=0 then 1 else v end) over(order by i)/case when soma=0 then n else soma end) parcela from pesos)
  select coalesce(array_agg(parcela-coalesce(anterior,0) order by i),'{}'::numeric[])
  from (select *,lag(parcela) over(order by i) anterior from acumulados) a;
$$;
create or replace function public.custos_itens_nota(p_nota jsonb)
returns jsonb language plpgsql immutable set search_path=pg_catalog,public as $$
declare itens jsonb; it jsonb; bases numeric[]:='{}'; descontos numeric[]:='{}'; liquidos numeric[]:='{}'; pesos numeric[]:='{}'; extra numeric[];
  soma numeric:=0; desconto numeric; informado numeric:=0; frete numeric; outras numeric; cte numeric; valor numeric; q numeric; p numeric; d numeric; i int; r jsonb:='[]';
begin
  itens:=case when jsonb_typeof(p_nota->'itens')='array' then p_nota->'itens' else coalesce(nullif(p_nota->>'itens',''),'[]')::jsonb end;
  if jsonb_typeof(itens)<>'array' then raise exception 'itens invalidos'; end if;
  frete:=round(greatest(0,coalesce((p_nota->>'frete')::numeric,0))*100);
  outras:=round(greatest(0,coalesce((p_nota->>'outras_despesas')::numeric,0))*100);
  cte:=round(greatest(0,coalesce((p_nota->>'frete_rateado')::numeric,0))*100);
  for it in select value from jsonb_array_elements(itens) loop
    q:=coalesce(nullif(it->>'qtd_estoque','')::numeric,nullif(it->>'quantidade','')::numeric,nullif(it->>'qtd','')::numeric,0);
    p:=coalesce(nullif(it->>'preco_estoque','')::numeric,nullif(it->>'preco_unitario','')::numeric,nullif(it->>'preco','')::numeric,0);
    valor:=round(greatest(0,coalesce(nullif(it->>'total','')::numeric,q*p-coalesce((it->>'desconto')::numeric,0)))*100);
    d:=least(valor,round(greatest(0,coalesce((it->>'desconto_fiscal')::numeric,0))*100));
    bases:=array_append(bases,valor);descontos:=array_append(descontos,d);soma:=soma+valor;informado:=informado+d;
  end loop;
  if cardinality(bases)=0 then return '[]'; end if;
  desconto:=least(soma,round(greatest(0,coalesce((p_nota->>'desconto_total')::numeric,0))*100));
  if desconto>0 and p_nota->>'valor_bruto' is not null and soma+frete+outras=round((p_nota->>'valor_bruto')::numeric*100) then desconto:=0; end if;
  if desconto=0 then descontos:=array_fill(0::numeric,array[cardinality(bases)]);
  elsif informado>desconto then descontos:=public.ratear_centavos_nota(desconto,descontos);
  else
    for i in 1..cardinality(bases) loop pesos:=array_append(pesos,bases[i]-descontos[i]); end loop;
    extra:=public.ratear_centavos_nota(desconto-informado,pesos);
    for i in 1..cardinality(bases) loop descontos[i]:=descontos[i]+extra[i]; end loop;
  end if;
  for i in 1..cardinality(bases) loop liquidos:=array_append(liquidos,bases[i]-descontos[i]); end loop;
  extra:=public.ratear_centavos_nota(frete+outras+cte,liquidos);
  for i in 1..cardinality(bases) loop
    it:=itens->(i-1);
    q:=coalesce(nullif(it->>'qtd_estoque','')::numeric,nullif(it->>'quantidade','')::numeric,nullif(it->>'qtd','')::numeric,0);
    r:=r||jsonb_build_array(jsonb_build_object('fiscal',bases[i]/100,'desconto',descontos[i]/100,'liquido',liquidos[i]/100,
      'acessorios',extra[i]/100,'total',(liquidos[i]+extra[i])/100,'qtd',q));
  end loop;
  return r;
end $$;

-- Recibo duravel: repetir apos perda de resposta nao repete NF, custos ou despesas.
create table public.notas_operacoes(
  id uuid primary key,company_id uuid not null references public.companies(id),usuario_id uuid not null,
  pedido jsonb not null,resultado jsonb not null,criado_em timestamptz not null default now()
);
alter table public.notas_operacoes enable row level security;
create policy notas_operacoes_empresa on public.notas_operacoes for select to authenticated
  using(company_id=public.auth_company_id() and usuario_id=auth.uid());
create policy notas_operacoes_criar on public.notas_operacoes for insert to authenticated
  with check(company_id=public.auth_company_id() and usuario_id=auth.uid() and public.auth_user_role() in ('admin','operacional'));
grant select,insert on public.notas_operacoes to authenticated;

-- INVOKER: as policies existentes de NF, custos, distribuicoes e contas continuam
-- sendo aplicadas. Nao recebe company_id nem valor de custo calculado pelo cliente.
create or replace function public.registrar_nota_fiscal_atomica(p_operacao_id uuid,p_nota jsonb,p_classificacoes jsonb,p_custo jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c uuid:=public.auth_company_id(); ator uuid:=auth.uid(); pedido jsonb; recibo public.notas_operacoes%rowtype;
  nf public.notas_fiscais%rowtype; obra public.obras%rowtype; mat public.materiais%rowtype;
  it jsonb; meta jsonb; custos jsonb; custo jsonb; lc public.lancamentos%rowtype; dist public.distribuicoes%rowtype;
  i int; q numeric; v numeric; etapa_item text; codigo text; descricao_item text; move boolean;
  custos_salvos jsonb:='[]'; dist_salvas jsonb:='[]'; despesas numeric:=0; resultado jsonb; total_itens numeric;
  etapas_despesa text[]:=array['03_alimentacao','07_combustivel','14_expediente','25_limpeza','34_tecnologia'];
begin
  if c is null or ator is null then raise exception 'sessao sem empresa' using errcode='28000'; end if;
  if public.auth_user_role() is null or public.auth_user_role() not in ('admin','operacional') then raise exception 'perfil sem permissao para notas' using errcode='42501'; end if;
  if p_operacao_id is null or p_nota is null or jsonb_typeof(p_classificacoes)<>'array' then raise exception 'pedido invalido'; end if;
  pedido:=jsonb_build_object('nota',p_nota,'classificacoes',p_classificacoes,'custo',p_custo);
  perform pg_advisory_xact_lock(hashtextextended(c::text||':nota:'||coalesce(p_nota->>'chave_acesso',p_operacao_id::text),0));
  select * into recibo from public.notas_operacoes where id=p_operacao_id and company_id=c and usuario_id=ator;
  if found then
    if recibo.pedido<>pedido then raise exception 'pedido ja usado com dados diferentes'; end if;
    if not exists(select 1 from public.notas_fiscais where id=p_operacao_id and company_id=c) then return jsonb_build_object('status','excluida'); end if;
    return recibo.resultado||jsonb_build_object('repetida',true);
  end if;
  if coalesce(p_nota->>'chave_acesso','') !~ '^[0-9]{44}$' or substring(p_nota->>'chave_acesso',21,2)<>'55' then raise exception 'chave de NF invalida'; end if;
  if exists(select 1 from public.notas_fiscais where company_id=c and chave_acesso=p_nota->>'chave_acesso') then raise exception 'esta NF ja foi registrada; confira a nota existente'; end if;
  if nullif(p_nota->>'obra','') is null then raise exception 'destino obrigatorio'; end if;
  if p_nota->>'obra'<>'EDR' then
    select * into obra from public.obras where company_id=c and nome=p_nota->>'obra' and arquivada is not true;
    if not found then raise exception 'obra indisponivel nesta empresa'; end if;
  end if;
  if coalesce((p_nota->>'frete')::numeric,0)<0 or coalesce((p_nota->>'outras_despesas')::numeric,0)<0 or coalesce((p_nota->>'desconto_total')::numeric,0)<0 then raise exception 'valores negativos na NF'; end if;
  insert into public.notas_fiscais(id,company_id,data,data_recebimento,data_efetiva_estoque,natureza,numero_nf,fornecedor,cnpj,obra,valor_bruto,frete,outras_despesas,imposto,desconto_total,chave_acesso,gera_credito,credito_status,itens,obs,nota_origem_id,motivo_devolucao)
  values(p_operacao_id,c,(p_nota->>'data')::date,(p_nota->>'data_recebimento')::date,(p_nota->>'data_efetiva_estoque')::date,p_nota->>'natureza',p_nota->>'numero_nf',p_nota->>'fornecedor',p_nota->>'cnpj',p_nota->>'obra',
    (p_nota->>'valor_bruto')::numeric,coalesce((p_nota->>'frete')::numeric,0),coalesce((p_nota->>'outras_despesas')::numeric,0),coalesce((p_nota->>'imposto')::numeric,0),coalesce((p_nota->>'desconto_total')::numeric,0),p_nota->>'chave_acesso',
    coalesce((p_nota->>'gera_credito')::boolean,false),p_nota->>'credito_status',p_nota->>'itens',coalesce(p_nota->>'obs',''),(p_nota->>'nota_origem_id')::uuid,p_nota->>'motivo_devolucao') returning * into nf;
  custos:=public.custos_itens_nota(to_jsonb(nf));
  if jsonb_array_length(custos)=0 or jsonb_array_length(custos)<>jsonb_array_length(p_classificacoes) then raise exception 'classificacao incompleta'; end if;
  select sum((value->>'total')::numeric) into total_itens from jsonb_array_elements(custos);
  if nf.valor_bruto::text in ('NaN','Infinity','-Infinity') or abs(total_itens-nf.valor_bruto)>0.05 then raise exception 'total da NF diverge dos itens'; end if;
  if nf.natureza is distinct from 'DEVOLUCAO' then
    for i in 0..jsonb_array_length(custos)-1 loop
      it:=nf.itens::jsonb->i;meta:=p_classificacoes->i;custo:=custos->i;q:=(custo->>'qtd')::numeric;v:=(custo->>'liquido')::numeric;
      if q<=0 or q::text in ('NaN','Infinity','-Infinity') then raise exception 'quantidade invalida'; end if;
      codigo:=coalesce(nullif(it->>'codigo_catalogo',''),nullif(it->>'codigo',''));
      descricao_item:=coalesce(it->>'desc',it->>'descricao');
      select m.* into mat from public.materiais m where m.company_id=c and m.codigo=coalesce(nullif(it->>'codigo_catalogo',''),nullif(it->>'codigo',''));
      etapa_item:=nullif(meta->>'etapa','');
      if etapa_item is null then raise exception 'centro de custo obrigatorio'; end if;
      move:=coalesce(mat.movimenta_estoque,(meta->>'movimenta_estoque')::boolean,false);
      if etapa_item=any(etapas_despesa) then
        insert into public.contas_pagar(company_id,fornecedor,descricao,valor,data_vencimento,status,data_pagamento,tipo,nota_id,nota_ref)
        values(c,nf.fornecedor,descricao_item,v,current_date,'pago',current_date,'despesa_operacional_nf',nf.id,nf.numero_nf);
        despesas:=despesas+v;
      elsif obra.id is not null then
        insert into public.lancamentos(company_id,obra_id,descricao,qtd,preco,total,data,obs,nota_id,etapa,destino_custo,adicional_id)
        values(c,obra.id,case when codigo is null then descricao_item else codigo||' · '||descricao_item end,q,v/q,v,coalesce(nf.data_recebimento,nf.data),
          'NF '||nf.numero_nf||' · '||nf.fornecedor,nf.id,etapa_item,coalesce(p_custo->>'destino_custo','nao_classificado'),(p_custo->>'adicional_id')::uuid) returning * into lc;
        custos_salvos:=custos_salvos||jsonb_build_array(to_jsonb(lc));
        if move and upper(obra.nome) not like '%ESCRIT%' then
          insert into public.distribuicoes(company_id,nota_id,item_desc,item_idx,codigo_catalogo,obra_id,obra_nome,qtd,valor,etapa,data,lancamento_id)
          values(c,nf.id,descricao_item,i,codigo,obra.id,obra.nome,q,v,etapa_item,coalesce(nf.data_recebimento,nf.data),lc.id) returning * into dist;
          dist_salvas:=dist_salvas||jsonb_build_array(to_jsonb(dist));
        end if;
      end if;
    end loop;
    if obra.id is not null then
      for i in 1..2 loop
        v:=case when i=1 then nf.frete else nf.outras_despesas end;
        if v>0 then
          insert into public.lancamentos(company_id,obra_id,descricao,qtd,preco,total,data,obs,nota_id,etapa,destino_custo,adicional_id)
          values(c,obra.id,case when i=1 then 'Frete NF ' else 'Outras despesas NF ' end||nf.numero_nf||' · '||nf.fornecedor,1,v,v,coalesce(nf.data_recebimento,nf.data),
            'NF '||nf.numero_nf||' · '||nf.fornecedor,nf.id,case when i=1 then '38_frete' else '36_outros' end,coalesce(p_custo->>'destino_custo','nao_classificado'),(p_custo->>'adicional_id')::uuid) returning * into lc;
          custos_salvos:=custos_salvos||jsonb_build_array(to_jsonb(lc));
        end if;
      end loop;
    end if;
  end if;
  resultado:=jsonb_build_object('status','registrada','nota',to_jsonb(nf),'lancamentos',custos_salvos,'distribuicoes',dist_salvas,'despesas',despesas,'repetida',false);
  insert into public.notas_operacoes(id,company_id,usuario_id,pedido,resultado) values(p_operacao_id,c,ator,pedido,resultado);
  return resultado;
end $$;
revoke all on function public.registrar_nota_fiscal_atomica(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.registrar_nota_fiscal_atomica(uuid,jsonb,jsonb,jsonb) to authenticated;
-- END NOTAS CUSTO BODY
commit;
