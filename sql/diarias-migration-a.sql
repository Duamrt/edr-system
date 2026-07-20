-- ============================================================================
-- MIGRATION A (ADITIVA) — Apontamento de diarias: colunas, indice, RPCs de leitura+escrita.
-- SEGURA de aplicar ANTES do front novo: nao altera policies nem grants da tabela bruta.
-- Aplicar via apply_migration (uma migration atomica). NAO contem o lockdown (ver migration B).
-- Gerado a partir de diarias-apontamento-rpc.sql.draft (revisao). NADA aplicado.
-- ============================================================================

-- ============================================================================
-- PROPOSTA (RASCUNHO — NÃO APLICAR) — Apontamento de diárias server-side
-- Arquivo: sql/diarias-apontamento-rpc.sql.draft   |   Estado: DRAFT (nada aplicado)
--
-- Regra do repo (sql/_LEIA-ANTES-DE-EXECUTAR.md): DDL de segurança/RLS é aplicada
-- via `apply_migration` do Supabase (painel → Migrations), NUNCA colando no SQL
-- Editor. Este .draft existe só para revisão por diff. Ao aprovar, cada FASE abaixo
-- vira UMA migration ATÔMICA (não aplicar comando a comando). Rodar get_advisors +
-- conferir pg_policies antes e depois.
--
-- PROBLEMAS QUE RESOLVE
--   1) Vazamento: policy df_select hoje é USING (company_id = auth_company_id()) SEM
--      filtro de role → o mestre lê `diarias_funcionarios` inteiro (coluna `diaria`)
--      via REST. RLS filtra LINHA, não COLUNA. Logo: nem policy sozinha, nem função
--      sozinha resolvem — precisa TROCAR a policy p/ admin-only E dar ao mestre só a
--      função segura. (front: js/edr-v2-diarias.js:83)
--   2) Forja: hoje cliente (mestre e admin) calcula valor e faz POST direto em `diarias`.
--   3) Auditoria: falta e "não escalado" não geram registro → some o rastro.
--   4) Corrida entre abas: `diarias` não tem unicidade → saves paralelos duplicam.
--   5) Substituir-o-dia apagando omitidos apagaria gente de outro mestre (sem vínculo
--      mestre↔equipe no banco). Solução: UPSERT só dos recebidos, nunca DELETE de omitidos.
--
-- ⚠️ JANELA DE TRANSIÇÃO — A CONFIDENCIALIDADE SÓ FECHA NA MIGRATION B:
--   Enquanto `df_select` estiver aberto (antes da B), o gate por perfil no JavaScript é
--   APENAS ocultação de UI. Um mestre ainda consegue chamar /rest/v1/diarias_funcionarios
--   ?select=* e ver `diaria` pela API. NÃO afirmar "mestre não vaza" nesse período.
--   Além disso: NÃO deployar o front novo antes da Migration A — sem as RPCs, o mestre
--   fica com lista vazia (o front não rebaixa para a tabela bruta no perfil mestre).
--   Ordem inviolável: A (aditiva) → front → teste → B (fecha o vazamento de vez).
--
-- DECISÕES DE PRODUTO (confirmadas pelo Duam)
--   - "não escalado": status='nao_escalado', valor=0. Não é falta, não paga, não abona.
--   - v1: mestre aponta QUALQUER obra ativa da própria company. Vínculo mestre↔obra
--     é card separado (não existe no banco: company_users não liga usuário a obra).
--
-- CONTRATO DE LOTE DIÁRIO (confirmado pelo Duam — a RPC é desenhada em cima disto)
--   Fluxo do mestre (2 passos, SEM salvamento incremental):
--     1) preenche TODA a equipe do dia   2) "Conferir apontamento"
--     3) vê resumo SEM R$                 4) "Enviar apontamento do dia"
--     correção posterior: "Editar apontamento do dia" → altera → reenvia o LOTE.
--   Regras que a RPC deve garantir:
--     a) Recebe UM lote diário com TODOS os funcionários resolvidos (apontado/falta/nao_escalado).
--     b) VALIDA todos antes de gravar qualquer um (tudo-ou-nada: se um falha, nada grava).
--     c) UPSERT transacional por funcionário (ON CONFLICT DO UPDATE); nunca DELETE de omitidos.
--     d) Para MESTRE: não recebe, não calcula, não retorna valor. Valor é server-side (admin vê).
--     e) Corrida entre abas: só a unicidade (índice parcial) + transação garante. NÃO prometer
--        "sem duplicar" fora disso. Hoje, PRÉ-RPC, só o reenvio sequencial da mesma sessão é seguro.
--   RISCO DE SOBRESCRITA (confirmado no código — front, não banco):
--     Hoje `_diarListaInit` faz `_diarLista.apont = {}` (js/edr-v2-diarias.js:2431) e o onchange
--     da data só re-renderiza — NÃO recarrega o que já foi salvo. Logo, reabrir uma data já
--     enviada traz a lista VAZIA; corrigir 1 pessoa e reenviar o lote apagaria os demais
--     (motor recaptura o dia). CORREÇÃO OBRIGATÓRIA no front, junto da RPC: ao abrir/trocar
--     para uma data, PRÉ-PREENCHER a lista com os apontamentos já salvos (sem R$ para mestre),
--     via leitura segura por perfil. Sem isso, "Editar" vira "apagar sem querer".
--
-- HELPERS QUE JÁ EXISTEM (SECURITY DEFINER, server-side — a RPC NÃO recebe isto do cliente):
--   auth_company_id() -> uuid    (company do usuário logado)
--   auth_user_role()  -> text    (perfil; valores observados: 'admin','mestre')
--
-- CONCILIAÇÃO DE LEGADO (pré-auditoria 2026-07-18, 645 linhas, 1 company):
--   0 dup (quinzena,data,func) · 0 quinzena nula · 11 funcionários e 7 obras SEM match
--   exato · 0 ambíguos. Regra: EXATO-OU-NULO, sem fuzzy. Nenhum dos 18 é normalizado
--   automaticamente — viram relatório para auditoria manual.
-- ============================================================================


-- ============================================================================
-- FASE 0 — PRÉ-AUDITORIA (SOMENTE LEITURA). Rode e confira que os números batem
-- com o registrado acima ANTES de aplicar a Fase 1. Se divergir, PARAR.
-- ============================================================================

-- 0.1 duplicatas pela chave de unicidade proposta (esperado: 0)
select quinzena_id, data, funcionario, count(*)
from diarias group by quinzena_id, data, funcionario having count(*) > 1;

-- 0.2 funcionários históricos SEM match exato (relatório p/ auditoria manual)
select distinct d.company_id, d.funcionario
from diarias d
left join diarias_funcionarios df on df.company_id=d.company_id and df.nome=d.funcionario
where df.id is null
order by d.funcionario;

-- 0.3 obras em periodos[].obra SEM match exato (inclui "Mirele" etc.)
select distinct src.company_id, src.obra_txt
from (
  select d.company_id, p->>'obra' as obra_txt
  from diarias d, lateral jsonb_array_elements(coalesce(d.periodos,'[]'::jsonb)) p
  where nullif(p->>'obra','') is not null
) src
left join obras o on o.company_id=src.company_id and o.nome=src.obra_txt
where o.id is null
order by src.obra_txt;


-- ============================================================================
-- FASE 1 (migration ATÔMICA) — CONTRATO DE DADOS + CONCILIAÇÃO + UNICIDADE
-- Um único bloco transacional. Colunas, backfill exato-ou-nulo e índice parcial
-- entram juntos ou não entram. (apply_migration roda cada migration em transação.)
-- ============================================================================
begin;

-- 1.1 status auditável
alter table diarias add column if not exists status text not null default 'apontado';
alter table diarias drop constraint if exists diarias_status_chk;
alter table diarias add constraint diarias_status_chk
  check (status in ('apontado','falta','nao_escalado'));

-- 1.2 id estável de funcionário (nullable: legado sem match fica NULL, sem inventar vínculo)
alter table diarias add column if not exists funcionario_id uuid references diarias_funcionarios(id);

-- 1.2b meio-turnos de FALTA em coluna PRÓPRIA (não dentro de periodos).
--      periodos continua EXCLUSIVAMENTE com períodos de obra {turno,obra_id,obra,fracao};
--      faltas_turno guarda a decisão explícita de falta de meio-turno (ex: {'tarde'}).
--      Separar evita que consumidores legados que iteram periodos.map(p=>p.obra) quebrem.
alter table diarias add column if not exists faltas_turno text[] not null default '{}';

-- CHECK defende contra INSERT direto (não confia só na RPC enquanto a Migration B não fecha
-- os caminhos legados). Garante DUAS invariantes no nível do banco, SÓ com funções de array
-- (Postgres PROÍBE subquery em CHECK — nada de SELECT aqui):
--   (a) vocabulário: só 'manha'/'tarde' são válidos;  NULL vira '{}' pelo default.
--   (b) sem duplicata: cada valor no máximo 1x — coalesce(array_length(array_positions(...),1),0) <= 1.
alter table diarias drop constraint if exists diarias_faltas_turno_chk;
alter table diarias add constraint diarias_faltas_turno_chk
  check (
    faltas_turno <@ array['manha','tarde']::text[]
    and coalesce(array_length(array_positions(faltas_turno, 'manha'), 1), 0) <= 1
    and coalesce(array_length(array_positions(faltas_turno, 'tarde'), 1), 0) <= 1
  );

-- Obra NÃO vira coluna em `diarias`: um dia pode ter 2 obras, então vive em periodos[].
-- A RPC grava, por período, obra_id validado + nome oficial (snapshot do servidor):
--   periodos: [{ turno, obra_id, obra, fracao }]. Normalizar em tabela filha = fase futura.

-- 1.3 BACKFILL EXATO-OU-NULO (sem fuzzy) — só onde há match exato único.
--     11 func + 7 obras não casam → permanecem NULL de propósito (ver 0.2/0.3).
update diarias d
set funcionario_id = df.id
from diarias_funcionarios df
where df.company_id = d.company_id and df.nome = d.funcionario and d.funcionario_id is null;

update diarias d
set periodos = (
  select coalesce(jsonb_agg(
    case when o.id is not null
      then (item - 'obra') || jsonb_build_object('obra_id', o.id, 'obra', o.nome)
      else item end
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(d.periodos,'[]'::jsonb)) as item
  left join obras o on o.company_id = d.company_id and o.nome = item->>'obra'
)
where jsonb_typeof(d.periodos) = 'array' and jsonb_array_length(d.periodos) > 0;

-- 1.4 UNICIDADE PARCIAL (contra corrida). UNIQUE aceita múltiplos NULL, então o
--     legado não conciliado (funcionario_id NULL) fica de fora — aceitável porque a
--     RPC NOVA sempre grava com funcionario_id. Só é seguro pois 0.1 deu 0 duplicatas.
create unique index if not exists diarias_uniq_dia_func
  on diarias (company_id, quinzena_id, data, funcionario_id)
  where funcionario_id is not null;

commit;


-- ============================================================================
-- FASE 2 (migration ATÔMICA) — LEITURA SEGURA (ADITIVA, não fecha nada ainda)
-- Cria as funções de leitura que o front novo vai usar. NÃO altera policies nem
-- grants da tabela bruta — logo, NÃO quebra o front atual. O fechamento do acesso
-- bruto (DROP df_select) foi MOVIDO para a MIGRATION B, no fim do arquivo, aplicada
-- só DEPOIS do front novo em produção. (Correção: lockdown não é aditivo.)
-- ============================================================================
begin;

-- 2.1 leitura segura: devolve só colunas não-sensíveis (SEM `diaria`)
create or replace function diarias_funcionarios_publico()
returns table (id uuid, nome text, cargo text, apelidos text[], ativo boolean)
language sql
security definer
set search_path = public
stable
as $$
  select f.id, f.nome, f.cargo, f.apelidos, f.ativo
  from diarias_funcionarios f
  where f.company_id = auth_company_id()   -- server-side, não vem do cliente
    and f.ativo = true
  order by f.nome asc;
$$;

revoke all on function diarias_funcionarios_publico() from public;
revoke all on function diarias_funcionarios_publico() from anon;
grant execute on function diarias_funcionarios_publico() to authenticated;

-- (o DROP df_select + policy admin-only FICAM na MIGRATION B — ver fim do arquivo)

-- 2.3 LEITURA DO DIA para PRÉ-PREENCHER a lista ao reabrir/trocar de data.
--     Sem isto, reabrir uma data salva traz lista vazia e o reenvio do lote apaga
--     as decisões anteriores (risco de sobrescrita). Devolve o que já foi gravado.
--     Para MESTRE: NÃO devolve valor nem diaria_base. Admin recebe valor.
--     RLS de `diarias` já filtra por company; aqui filtramos a coluna por perfil (RLS não filtra coluna).
create or replace function diarias_do_dia(p_quinzena_id uuid, p_data date)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_company   uuid := public.auth_company_id();
  v_is_mestre boolean := (public.auth_user_role() = 'mestre');
  v_out       jsonb;
begin
  if v_company is null then
    raise exception 'sem company' using errcode = '28000';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'funcionario_id', d.funcionario_id,
      'funcionario',    d.funcionario,
      'cargo',          d.cargo,
      'status',         d.status,
      'total_fracoes',  d.total_fracoes,
      'periodos',       d.periodos,           -- SÓ obra: obra_id + nome oficial (snapshot)
      'faltas_turno',   to_jsonb(d.faltas_turno)  -- meio-turnos de falta (coluna separada)
    ) || case when v_is_mestre then '{}'::jsonb
              else jsonb_build_object('valor', d.valor, 'diaria_base', d.diaria_base) end
  ), '[]'::jsonb)
  into v_out
  from public.diarias d
  where d.company_id = v_company
    and d.quinzena_id = p_quinzena_id
    and d.data = p_data;
  return jsonb_build_object('data', p_data, 'mostra_valores', (not v_is_mestre), 'linhas', v_out);
end;
$$;

revoke all on function diarias_do_dia(uuid, date) from public;
revoke all on function diarias_do_dia(uuid, date) from anon;
grant execute on function diarias_do_dia(uuid, date) to authenticated;

commit;


-- ============================================================================
-- FASE 3 (migration ATÔMICA) — RPC ÚNICA DE ESCRITA (UPSERT, sem apagar omitidos)
--
-- Cliente envia apontamentos SEM valor:
--   p_data date, p_quinzena_id uuid, p_apontamentos jsonb =
--   [{ "funcionario_id": uuid,
--      "status": "apontado" | "falta" | "nao_escalado",
--      "periodos":     [ { "turno":"manha"|"tarde", "obra_id":uuid, "fracao":0.5 } ],  -- turnos COM obra
--      "faltas_turno": [ "manha" | "tarde" ]   -- meio-turnos de FALTA explicita (auditavel, sem inferencia)
--   }]
--   Regras: dia inteiro = os 2 turnos na mesma obra (0.5+0.5). Nunca turno "dia".
--           'apontado' com so manha = periodos:[manha] + faltas_turno:["tarde"].
--           'falta'/'nao_escalado' => periodos:[] e faltas_turno:[].
--           funcionario_id nao pode repetir no lote. manha/tarde nao podem aparecer 2x.
--   -> valor/diaria_base/cargo/nome-de-obra: NUNCA vêm daqui; calculados/lidos no servidor.
--   Persistencia: periodos grava SÓ obra {turno,obra_id,obra,fracao}; faltas_turno em COLUNA
--                 separada text[] (nao mistura ausencia com obra). total_fracoes = so obra.
--
-- NÃO apaga o dia. Faz UPSERT só dos funcionario_id recebidos (ON CONFLICT DO UPDATE).
-- Advisory lock por (company,data) serializa abas; a UNICIDADE é a garantia real.
-- Retorno filtrado por perfil: mestre nunca recebe valor/diaria_base — nem em erro.
-- ============================================================================
begin;

create or replace function diarias_apontar(
  p_data date,
  p_quinzena_id uuid,
  p_apontamentos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public   -- pg_catalog primeiro; nomes de tabela sempre qualificados abaixo
as $$
declare
  v_company   uuid := public.auth_company_id();
  v_role      text := public.auth_user_role();
  v_is_mestre boolean := (v_role = 'mestre');
  v_linhas    jsonb;     -- linhas validadas (em memória, SEM tabela temporária)
  v_erro      text;
  v_result    jsonb;
begin
  -- --- autorização (server-side; cliente não informa company nem perfil) ---
  if v_company is null then
    raise exception 'sem company' using errcode = '28000';
  end if;
  if v_role not in ('mestre','admin') then
    raise exception 'perfil sem permissao para apontar' using errcode = '42501';
  end if;

  -- --- quinzena tem que existir, ser da company, estar ABERTA e cobrir a data ---
  if not exists (
    select 1 from public.diarias_quinzenas q
    where q.id = p_quinzena_id
      and q.company_id = v_company
      and coalesce(q.fechada, false) = false
      and coalesce(q.excluida, false) = false
      and p_data between q.data_inicio and q.data_fim
  ) then
    raise exception 'quinzena invalida, fechada, excluida ou data fora do intervalo'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_apontamentos) is distinct from 'array'
     or jsonb_array_length(p_apontamentos) = 0 then
    raise exception 'lote diario vazio ou invalido' using errcode = '22023';
  end if;

  -- serializa saves concorrentes do MESMO dia/company (reduz conflito; unicidade garante)
  perform pg_advisory_xact_lock(
    hashtextextended(v_company::text || ':' || p_data::text, 0)
  );

  -- ========================================================================
  -- PASSO 1 — VALIDAR e MONTAR todas as linhas em MEMÓRIA (sem tabela temporária).
  -- CTEs: expande o JSON, junta com funcionarios/obras (server-side) e detecta
  -- QUALQUER inconsistência. Se achar erro, RAISE antes de gravar (tudo-ou-nada).
  -- ========================================================================
  -- CONTRATO DE ENTRADA (por funcionário):
  --   funcionario_id uuid, status ('apontado'|'falta'|'nao_escalado'),
  --   periodos:[{turno:'manha'|'tarde'|'dia', obra_id, fracao}],  -- turnos COM obra
  --   faltas_turno:['manha'|'tarde']                              -- meio-turno de falta EXPLICITO
  -- periodos guarda SÓ obra; faltas_turno vive à parte (nao mistura ausencia com obra).
  -- 'apontado' parcial (só 1 turno com obra) EXIGE o outro turno em faltas_turno.
  with entrada as (
    select
      (a->>'funcionario_id')::uuid                    as func_id,
      coalesce(a->>'status','apontado')               as status,
      coalesce(a->'periodos','[]'::jsonb)             as periodos,
      coalesce(a->'faltas_turno','[]'::jsonb)         as faltas_turno,
      row_number() over (partition by (a->>'funcionario_id')) as rn   -- p/ detectar duplicata
    from jsonb_array_elements(p_apontamentos) a
  ),
  per as (            -- turnos COM obra (turno pode ser 'manha','tarde' ou 'dia')
    select e.func_id, (p->>'turno') as turno,
      (p->>'obra_id')::uuid as obra_id, (p->>'fracao')::numeric as fracao
    from entrada e
    cross join lateral jsonb_array_elements(e.periodos) p
    where e.status = 'apontado'
  ),
  ft as (             -- turnos de FALTA explicita (meio-turno)
    select e.func_id, (t->>0) as turno
    from entrada e cross join lateral jsonb_array_elements(e.faltas_turno) t
    where e.status = 'apontado'
  ),
  -- ocupacao por turno-BASE: 'dia' ocupa manha E tarde; 'manha'/'tarde' ocupam o proprio.
  ocup as (
    select func_id, 'manha'::text as turno from per where turno in ('manha','dia')
    union all
    select func_id, 'tarde'::text as turno from per where turno in ('tarde','dia')
    union all
    select func_id, turno from ft
  ),
  v as (
    select
      count(*) filter (where f.id is null)                                        as func_invalido,
      count(*) filter (where e.status not in ('apontado','falta','nao_escalado')) as status_invalido,
      count(*) filter (where e.rn > 1)                                            as func_duplicado,
      -- falta/nao_escalado NAO podem ter periodos nem faltas_turno
      count(*) filter (where e.status in ('falta','nao_escalado')
                         and (jsonb_array_length(e.periodos) > 0
                              or jsonb_array_length(e.faltas_turno) > 0))         as nao_apont_com_periodo,
      -- apontado precisa de ao menos 1 turno COM obra
      count(*) filter (where e.status = 'apontado'
                         and jsonb_array_length(e.periodos) = 0)                  as apont_sem_obra
    from entrada e
    left join public.diarias_funcionarios f
      on f.id = e.func_id and f.company_id = v_company
  ),
  vp as (
    select
      count(*) filter (where p.obra_id is null)                              as obra_nula,
      count(*) filter (where o.id is null)                                   as obra_invalida,
      count(*) filter (where p.turno not in ('manha','tarde','dia'))         as turno_invalido,
      -- fracao coerente com o turno: 'dia' = 1.0; meio-turno = 0.5
      count(*) filter (where (p.turno = 'dia'   and p.fracao is distinct from 1.0)
                          or (p.turno in ('manha','tarde') and p.fracao is distinct from 0.5)) as fracao_invalida
    from per p
    left join public.obras o
      on o.id = p.obra_id and o.company_id = v_company and coalesce(o.arquivada,false)=false
  ),
  vf as (
    select count(*) filter (where turno not in ('manha','tarde')) as falta_turno_invalido from ft
  ),
  -- 'dia' so pode existir SOZINHO (nao com manha/tarde no mesmo funcionario)
  vdia as (
    select count(*) as dia_com_outro from (
      select func_id from per group by func_id
      having count(*) filter (where turno = 'dia') > 0 and count(*) > 1
    ) d
  ),
  -- cardinalidade: manha/tarde no maximo 1x cada (em per OU em ft), e nunca obra+falta no mesmo turno
  vcard as (
    select count(*) as turno_repetido from (
      select func_id, turno from ocup group by func_id, turno having count(*) > 1
    ) d
  ),
  -- faltas_turno sem duplicata interna
  vfd as (
    select count(*) as falta_dup from (
      select func_id, turno from ft group by func_id, turno having count(*) > 1
    ) d
  ),
  totais as (   -- soma de frações por funcionário apontado: obra + falta-meio (0.5) = 1.0
    select e.func_id,
      coalesce((select sum(fracao) from per  where per.func_id = e.func_id),0)
      + coalesce((select count(*)*0.5 from ft where ft.func_id = e.func_id),0) as total
    from entrada e where e.status = 'apontado'
  ),
  vt as (
    select count(*) filter (where total <= 0 or total > 1) as total_invalido from totais
  )
  select
    case
      when (select func_invalido        from v)   > 0 then 'funcionario nao pertence a company'
      when (select func_duplicado       from v)   > 0 then 'funcionario repetido no lote'
      when (select status_invalido      from v)   > 0 then 'status invalido'
      when (select nao_apont_com_periodo from v)  > 0 then 'falta/nao escalado nao podem ter periodos'
      when (select apont_sem_obra       from v)   > 0 then 'apontado exige ao menos um turno com obra'
      when (select obra_nula            from vp)  > 0 then 'apontado exige obra_id em cada periodo'
      when (select obra_invalida        from vp)  > 0 then 'obra invalida, arquivada ou de outra company'
      when (select turno_invalido       from vp)  > 0 then 'turno invalido'
      when (select fracao_invalida      from vp)  > 0 then 'fracao incoerente com o turno (dia=1.0, meio=0.5)'
      when (select falta_turno_invalido from vf)  > 0 then 'turno de falta invalido'
      when (select dia_com_outro        from vdia) > 0 then 'turno dia so pode existir sozinho'
      when (select turno_repetido       from vcard) > 0 then 'turno ocupado 2x (obra+obra, obra+falta ou dia+meio)'
      when (select falta_dup            from vfd)  > 0 then 'falta de turno repetida'
      when (select total_invalido       from vt)   > 0 then 'total de fracoes do dia invalido (0 < t <= 1)'
      else null
    end
  into v_erro;

  if v_erro is not null then
    raise exception '%', v_erro using errcode = '22023';   -- sem ecoar valor
  end if;

  -- monta as linhas finais (valor calculado no servidor; nome oficial de obra por snapshot).
  -- periodos guarda SÓ obra {turno,obra_id,obra,fracao}; faltas_turno vai em coluna separada.
  with entrada as (
    select
      (a->>'funcionario_id')::uuid        as func_id,
      coalesce(a->>'status','apontado')   as status,
      coalesce(a->'periodos','[]'::jsonb) as periodos,
      coalesce(a->'faltas_turno','[]'::jsonb) as faltas_turno
    from jsonb_array_elements(p_apontamentos) a
  ),
  per_snap as (   -- SÓ obra (nome oficial do servidor); soma de fracoes das obras
    select e.func_id,
      jsonb_agg(jsonb_build_object(
        'turno', p->>'turno', 'obra_id', o.id, 'obra', o.nome, 'fracao', (p->>'fracao')::numeric
      ) order by (p->>'turno')) as periodos,
      coalesce(sum((p->>'fracao')::numeric),0) as total_obra
    from entrada e
    cross join lateral jsonb_array_elements(e.periodos) p
    join public.obras o on o.id = (p->>'obra_id')::uuid and o.company_id = v_company
    where e.status = 'apontado'
    group by e.func_id
  ),
  ft_snap as (   -- faltas_turno como text[] (decisao explicita, coluna separada)
    select e.func_id, array_agg(t->>0 order by t->>0) as faltas
    from entrada e cross join lateral jsonb_array_elements(e.faltas_turno) t
    where e.status = 'apontado'
    group by e.func_id
  ),
  montado as (
    select
      f.id as funcionario_id, f.nome as funcionario, f.cargo, f.diaria as diaria_base,
      case when e.status = 'apontado' then coalesce(ps.periodos,'[]'::jsonb) else '[]'::jsonb end as periodos,
      case when e.status = 'apontado' then coalesce(fs.faltas, '{}') else '{}'::text[] end as faltas_turno,
      -- total_fracoes = SÓ fração TRABALHADA em obra (semantica historica: fracao paga).
      -- "dia resolvido" NAO entra aqui — pertence a status + faltas_turno. Meio-turno de
      -- falta NAO soma (senao Folha/PDF mostraria diaria cheia com meio valor).
      case when e.status = 'apontado' then coalesce(ps.total_obra,0) else 0 end as total_fracoes,
      case when e.status = 'apontado'
           then round(f.diaria * coalesce(ps.total_obra,0), 2)   -- falta nao paga; so obra
           else 0 end as valor,
      e.status
    from entrada e
    join public.diarias_funcionarios f on f.id = e.func_id and f.company_id = v_company
    left join per_snap ps on ps.func_id = e.func_id
    left join ft_snap  fs on fs.func_id = e.func_id
  )
  select jsonb_agg(to_jsonb(m.*)) into v_linhas from montado m;

  -- ========================================================================
  -- PASSO 2 — GRAVAR (UPSERT por funcionário). Nunca apaga funcionário omitido.
  -- Lê das linhas já validadas (jsonb em memória), não de tabela temporária.
  -- ========================================================================
  insert into public.diarias
    (company_id, quinzena_id, data, funcionario, funcionario_id, cargo,
     diaria_base, periodos, faltas_turno, total_fracoes, valor, status, criado_por)
  select
    v_company, p_quinzena_id, p_data,
    x.funcionario, x.funcionario_id, x.cargo,
    x.diaria_base, x.periodos, x.faltas_turno, x.total_fracoes, x.valor, x.status, v_role
  from jsonb_to_recordset(v_linhas) as x(
    funcionario_id uuid, funcionario text, cargo text, diaria_base numeric,
    periodos jsonb, faltas_turno text[], total_fracoes numeric, valor numeric, status text
  )
  -- predicado REPETIDO do índice parcial: sem ele o Postgres nao infere o unique index
  on conflict (company_id, quinzena_id, data, funcionario_id) where funcionario_id is not null
  do update set
     funcionario   = excluded.funcionario,
     cargo         = excluded.cargo,
     diaria_base   = excluded.diaria_base,
     periodos      = excluded.periodos,
     faltas_turno  = excluded.faltas_turno,
     total_fracoes = excluded.total_fracoes,
     valor         = excluded.valor,
     status        = excluded.status,
     criado_por    = excluded.criado_por;

  -- retorno filtrado por perfil (mestre NUNCA recebe valor/diaria_base)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'funcionario_id', x.funcionario_id,
      'funcionario',    x.funcionario,
      'status',         x.status,
      'total_fracoes',  x.total_fracoes,
      'periodos',       x.periodos,
      'faltas_turno',   to_jsonb(x.faltas_turno)
    ) || case when v_is_mestre then '{}'::jsonb
              else jsonb_build_object('valor', x.valor, 'diaria_base', x.diaria_base) end
  ), '[]'::jsonb)
  into v_result
  from jsonb_to_recordset(v_linhas) as x(
    funcionario_id uuid, funcionario text, cargo text, diaria_base numeric,
    periodos jsonb, faltas_turno text[], total_fracoes numeric, valor numeric, status text
  );

  return jsonb_build_object(
    'ok', true,
    'data', p_data,
    'perfil', v_role,
    'mostra_valores', (not v_is_mestre),
    'linhas', v_result
  );
end;
$$;

revoke all on function diarias_apontar(date, uuid, jsonb) from public;
revoke all on function diarias_apontar(date, uuid, jsonb) from anon;
grant execute on function diarias_apontar(date, uuid, jsonb) to authenticated;

commit;
