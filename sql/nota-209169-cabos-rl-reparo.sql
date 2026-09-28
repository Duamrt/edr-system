-- EXECUTADO EM PRODUCAO EM 2026-09-28 APOS ENSAIO COM ROLLBACK.
-- NF-e 209169/1: XML = 2/3/2/2 RL; registro atual = 2/3/2/2 M.
-- Preserva a NF, o total de R$ 1.451,91 e a conta a pagar vinculada.
-- Cria quatro materiais em RL, pois os codigos atuais em M ja possuem historico.
-- Atualiza o de-para do fornecedor e remove apenas as quatro regras 1:1 desta NF.
-- Todas as precondicoes sao verificadas novamente na transacao; divergencia aborta.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.materiais in share row exclusive mode;

do $reparo$
declare
  v_nota public.notas_fiscais%rowtype;
  v_item jsonb;
  v_itens_novos jsonb := '[]'::jsonb;
  v_mapa jsonb := '{}'::jsonb;
  v_novo jsonb;
  v_spec record;
  v_material public.materiais%rowtype;
  v_codigo text;
  v_id uuid;
  v_regras uuid[] := array[]::uuid[];
  v_proximo_codigo integer;
  v_qtd numeric;
  v_total numeric;
  v_linhas integer;
begin
  select * into strict v_nota
  from public.notas_fiscais
  where chave_acesso = '26260935428312000266550010002091691551561763'
    and numero_nf = '209169/1'
    and regexp_replace(cnpj, '[^0-9]', '', 'g') = '35428312000266'
  for update;

  if v_nota.obra is distinct from 'EDR' or v_nota.valor_bruto is distinct from 1451.91
     or v_nota.data_efetiva_estoque is distinct from date '2026-09-28'
     or jsonb_array_length(v_nota.itens::jsonb) <> 4 then
    raise exception 'NF mudou desde a revisao; reparo cancelado';
  end if;
  if (select count(*) from public.contas_pagar
      where company_id = v_nota.company_id and nota_id = v_nota.id and valor = 1451.91) <> 1
     or exists (select 1 from public.distribuicoes where company_id = v_nota.company_id and nota_id = v_nota.id)
     or exists (select 1 from public.lancamentos where company_id = v_nota.company_id and nota_id = v_nota.id)
     or exists (select 1 from public.estoque_saida_origens where company_id = v_nota.company_id and nota_id = v_nota.id)
     or exists (select 1 from public.notas_fiscais where company_id = v_nota.company_id and nota_origem_id = v_nota.id) then
    raise exception 'NF possui vinculos diferentes dos revisados; reparo cancelado';
  end if;

  select coalesce(max(codigo::integer), 0) into v_proximo_codigo
  from public.materiais
  where company_id = v_nota.company_id and codigo ~ '^[0-9]+$';

  for v_spec in
    select * from (values
      ('11728', '000117', 'CABO FLEXIVEL 1,5MM PRETO - ROLO 100M', 2::numeric, 311.12::numeric),
      ('7561',  '000118', 'CABO FLEXIVEL 1,5MM VERDE - ROLO 100M', 3::numeric, 488.91::numeric),
      ('8547',  '000115', 'CABO FLEXIVEL 1,5MM AMAR - ROLO 100M', 2::numeric, 325.94::numeric),
      ('7556',  '000728', 'CABO FLEXIVEL 1,5MM BRANCO - ROLO 100M', 2::numeric, 325.94::numeric)
    ) as s(cprod, codigo_antigo, nome_novo, qtd, total)
  loop
    select x.value into strict v_item
    from jsonb_array_elements(v_nota.itens::jsonb) x(value)
    where x.value ->> 'codigo_produto_fiscal' = v_spec.cprod;
    select * into strict v_material
    from public.materiais
    where company_id = v_nota.company_id and codigo = v_spec.codigo_antigo
    for update;
    if v_material.unidade is distinct from 'M' or v_material.categoria is distinct from '09_elet'
       or (v_item ->> 'material_id') is distinct from v_material.id::text
       or (v_item ->> 'codigo') is distinct from v_spec.codigo_antigo
       or (v_item ->> 'unidade_fiscal') is distinct from 'RL'
       or (v_item ->> 'unidade_estoque') is distinct from 'M'
       or (v_item ->> 'qtd_fiscal')::numeric is distinct from v_spec.qtd
       or (v_item ->> 'qtd_estoque')::numeric is distinct from v_spec.qtd
       or (v_item ->> 'total_fiscal')::numeric is distinct from v_spec.total
       or v_item ->> 'regra_conversao_id' is null
       or exists (select 1 from public.materiais
                  where company_id = v_nota.company_id and nome = v_spec.nome_novo) then
      raise exception 'Item % ou catalogo mudou; reparo cancelado', v_spec.cprod;
    end if;
    v_regras := array_append(v_regras, (v_item ->> 'regra_conversao_id')::uuid);
    if not exists (select 1 from public.material_conversao r
      where r.id = v_regras[array_length(v_regras, 1)]
        and r.company_id = v_nota.company_id and r.material_id = v_material.id
        and r.unidade_origem = 'RL' and r.unidade_destino = 'M'
        and r.fator = 1 and r.vigente_de = date '2026-09-28' and r.vigente_ate is null) then
      raise exception 'Regra % mudou; reparo cancelado', v_spec.cprod;
    end if;
    v_proximo_codigo := v_proximo_codigo + 1;
    v_codigo := lpad(v_proximo_codigo::text, 6, '0');
    insert into public.materiais
      (company_id, codigo, nome, unidade, categoria, tipo_item, movimenta_estoque, auto)
    values
      (v_nota.company_id, v_codigo, v_spec.nome_novo, 'RL', v_material.categoria, 'material', true, false)
    returning id into v_id;
    v_mapa := v_mapa || jsonb_build_object(v_spec.cprod,
      jsonb_build_object('id', v_id::text, 'codigo', v_codigo, 'nome', v_spec.nome_novo));
  end loop;

  for v_item in select value from jsonb_array_elements(v_nota.itens::jsonb)
  loop
    v_novo := v_mapa -> (v_item ->> 'codigo_produto_fiscal');
    if v_novo is null then raise exception 'Item fiscal inesperado; reparo cancelado'; end if;
    v_qtd := (v_item ->> 'qtd_fiscal')::numeric;
    v_total := (v_item ->> 'total_fiscal')::numeric;
    v_itens_novos := v_itens_novos || jsonb_build_array(v_item || jsonb_build_object(
      'desc', v_novo ->> 'nome', 'codigo', v_novo ->> 'codigo',
      'material_id', v_novo ->> 'id',
      'qtd', v_qtd, 'unidade', 'RL', 'preco', v_total / v_qtd,
      'qtd_estoque', v_qtd, 'unidade_estoque', 'RL', 'preco_estoque', v_total / v_qtd,
      'regra_conversao_id', null, 'status_conversao', 'igual'
    ));
  end loop;
  update public.notas_fiscais set itens = v_itens_novos::text
  where id = v_nota.id and company_id = v_nota.company_id;
  if not found then raise exception 'NF nao atualizada'; end if;

  for v_spec in
    select * from (values
      ('11728', '000117'), ('7561', '000118'),
      ('8547', '000115'), ('7556', '000728')
    ) as s(cprod, codigo_antigo)
  loop
    update public.material_depara
    set codigo_catalogo = (v_mapa -> v_spec.cprod) ->> 'codigo'
    where company_id = v_nota.company_id and cnpj = '35428312000266'
      and cprod = v_spec.cprod and codigo_catalogo = v_spec.codigo_antigo;
    get diagnostics v_linhas = row_count;
    if v_linhas <> 1 then raise exception 'De-para % mudou; reparo cancelado', v_spec.cprod; end if;
  end loop;

  if exists (select 1 from public.notas_fiscais n
    cross join lateral jsonb_array_elements(n.itens::jsonb) x(value)
    where n.company_id = v_nota.company_id
      and exists (select 1 from unnest(v_regras) r(id)
                  where (x.value ->> 'regra_conversao_id') = r.id::text)) then
    raise exception 'Regra 1:1 ainda usada por outra NF; reparo cancelado';
  end if;
  delete from public.material_conversao
  where company_id = v_nota.company_id and id = any(v_regras)
    and unidade_origem = 'RL' and unidade_destino = 'M' and fator = 1;
  get diagnostics v_linhas = row_count;
  if v_linhas <> 4 then raise exception 'Quantidade de regras divergente; reparo cancelado'; end if;

  select * into v_nota from public.notas_fiscais where id = v_nota.id;
  if v_nota.valor_bruto is distinct from 1451.91
     or (select sum((x.value ->> 'qtd_estoque')::numeric)
         from jsonb_array_elements(v_nota.itens::jsonb) x(value)) is distinct from 9
     or (select sum((x.value ->> 'total_fiscal')::numeric)
         from jsonb_array_elements(v_nota.itens::jsonb) x(value)) is distinct from 1451.91
     or exists (select 1 from jsonb_array_elements(v_nota.itens::jsonb) x(value)
        where (x.value ->> 'unidade_estoque') is distinct from 'RL'
           or (x.value ->> 'unidade') is distinct from 'RL'
           or x.value ->> 'regra_conversao_id' is not null) then
    raise exception 'Conferencia final da NF falhou; reparo cancelado';
  end if;
end $reparo$;

commit;
