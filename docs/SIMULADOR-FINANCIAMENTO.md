# Amortização de Contrato — V1 (documentação local)

> **CORREÇÃO DE DIREÇÃO — 2026-07-30.** Este módulo **não é** um simulador de novo
> financiamento. Ele calcula o impacto de uma amortização extraordinária sobre um contrato
> **que já está em andamento**. O nome anterior ("Simulador de Financiamento") e o fluxo de
> "criar cenário a partir do contrato" foram descartados.
>
> Estado: **desenvolvimento local, não integrado ao banco, não publicado.**
> Proibido nesta janela: SQL, Supabase remoto, RLS, commit, push, deploy.
> Nada aqui declara o módulo pronto, integrado, seguro ou publicável.
> Tudo marcado como testado é **reportado pelo Claude** e pende de auditoria independente do Codex.
> Evidências: `docs/SIMULADOR-VALIDACAO-LOCAL.md`.

> **AUDITORIA DE REGRAS TEMPORAIS — 2026-08-03.** Os achados abaixo foram **confirmados
> localmente pelo Codex** e corrigidos nesta janela, no branch `backup/wip-pre-sync-20260802`:
>
> | # | Achado | Onde |
> |---|---|---|
> | 1 | `data_referencia_saldo` validada só por regex — `2026-02-31` passava | `edr-v2-simulador.js:73` |
> | 2 | `data_referencia_saldo` era campo decorativo: não entrava em nenhum cálculo | `edr-v2-simulador.js:112` |
> | 3 | Data de amortização livre, sem pró-rata para sustentá-la | UI + motor |
> | 4 | Evento anterior à primeira parcela aplicado em silêncio | `_ordenarEventos` |
> | 5 | Sequência negativa e sequência duplicada aceitas na mesma data | `_ordenarEventos` |
> | 6 | `contrato_taxa = "7,95%"` renderizava `7,95%% a.a.` | `edr-v2-simulador.js:297,298,320` |
> | 7 | Comentário do núcleo proibia `Number()` de forma imprecisa | `edr-v2-simulador-calc.js` |
>
> **2ª rodada da auditoria — achados 8 e 9, encontrados DEPOIS da 1ª correção:**
>
> | # | Achado | Onde |
> |---|---|---|
> | 8 | Evento da data de corte aplicado **depois** da 1ª parcela: `parcelaReferencia = 1` e saldo antes já reduzido para R$ 379.086,54 | `_ordenarEventos`/laço de `simular` |
> | 9 | Autocomplete resolvia obra pelo nome: duas obras homônimas selecionavam a primeira | `_simTrocarObra` |
>
> O achado 8 invalidava a regra central recém-documentada: os 204 testes da 1ª rodada
> passavam sem cobri-la. Correção e evidência em §ORDEM DE APLICAÇÃO, abaixo.
>
> **Não testados nesta janela:** banco, RLS, `auth_company_id()`, login real, isolamento entre
> tenants, integração com `dev`. Continuam bloqueados por falta de banco e de autorização.

---

## 1. Objetivo e limites da V1

**Objetivo.** Responder a uma pergunta operacional: *"tenho R$ X este mês; se eu amortizar,
quantas parcelas caem — ou quanto cai a prestação?"*, sobre um financiamento já contratado.

**Não é** simulador oficial da Caixa. **Não é** simulador de contratação nova. **Não é**
controle de contrato vivo (não acompanha pagamento mês a mês).

### REGRA CENTRAL — inegociável

`obras.contrato_valor` é o **valor ORIGINAL financiado**. **Nunca** é saldo devedor atual.
Nenhum resultado (economia, novo prazo, nova prestação) pode partir dele. O saldo devedor
atual vem do **extrato da instituição financeira**, digitado pelo usuário.

Os campos `contrato_*` servem **somente como sugestão visual de dados de origem**:
- nunca são regravados;
- nunca substituem dado do extrato;
- nunca preenchem campo de cálculo.

### REGRA TEMPORAL — data de corte (auditoria 2026-08-03)

A V1 **não suporta pró-rata** e **não suporta amortização em data diferente da posição do
extrato**. Calcular juros por dias corridos entre a data do extrato e uma data de amortização
arbitrária exigiria convenção de contagem, indexador e critério de aniversário do contrato —
nada disso está no escopo da V1.

Consequências, todas obrigatórias:

1. **`data_referencia_saldo` é a DATA DE CORTE.** É a âncora temporal de todo o cálculo,
   não um campo informativo. Alterá-la altera a competência do resultado.
2. **A amortização da V1 ocorre obrigatoriamente na mesma data de corte.** Não há evento
   em data intermediária.
3. **A primeira parcela projetada ocorre um mês depois da data de corte.** O saldo do extrato
   é a posição naquele dia; a próxima prestação vence no mês seguinte.
4. **Data de amortização diferente da data de corte é bloqueada**, com a mensagem de que a V1
   não calcula pró-rata nem indexadores.
5. **Evento anterior à data-base é rejeitado** — nunca aplicado em silêncio depois da primeira
   parcela.
6. `contrato_valor` **continua proibido** como saldo atual, sem exceção temporal.
7. O resultado é **projeção gerencial**; não equivale a extrato nem a proposta oficial.

**Mensagem de bloqueio de data:**

> A amortização desta projeção é aplicada na mesma data do saldo informado no extrato.
> A V1 não calcula pró-rata nem indexadores.

### ORDEM DE APLICAÇÃO — duas fases (correção de 2026-08-03, 2ª rodada)

Documentar a data de corte não bastava: o motor aplicava **todo** evento depois de gerar a
parcela do mês. O evento da data de corte incidia, então, sobre um saldo já reduzido pela
prestação seguinte — o oposto do que a regra central determina.

`simular()` passou a ter duas fases explícitas:

| Fase | Quando | `fase` | `parcelaReferencia` |
|---|---|---|---|
| **1 — data-base** | eventos com `dataAplicacao === dataBase`, **antes** do laço de parcelas | `'data_base'` | `0` |
| **2 — parcela** | eventos posteriores, após a parcela do respectivo mês | `'parcela'` | número da parcela |

Consequências obrigatórias:

1. O evento da data de corte incide sobre o **saldo do extrato intocado**.
2. **Os juros da 1ª parcela são calculados sobre o saldo já amortizado.**
3. A 1ª parcela continua vencendo **um mês após** a data de corte.
4. A linha da 1ª parcela **não** carrega o evento da data-base — ele é anterior a ela.

A lógica de aplicar um evento foi extraída para `_aplicarEvento()`, usada pelas duas fases.
Antes vivia apenas dentro do laço; duplicá-la permitiria corrigir só uma das cópias.

**Evidência da diferença** (saldo R$ 380.000,00 · corte 2026-07-30 · amortização R$ 4.000,00 ·
SAC · 416 meses · 0,832834% a.m.):

| | Antes da correção | Depois |
|---|---|---|
| `saldoAntesCent` do evento | R$ 379.086,54 | **R$ 380.000,00** |
| `parcelaReferencia` | 1 | **0** |
| juros da 1ª parcela | R$ 3.164,77 | **R$ 3.131,46** |

### AUTOCOMPLETE DE OBRA — rótulo é identificador

`<datalist>` devolve texto, não id. Resolver a obra pelo nome escolheria a **primeira
encontrada**, e duas obras homônimas levariam o cálculo à obra errada em silêncio.

- `_simRotuloObra()` acrescenta `(#id)` ao rótulo quando há homônimas; nome único fica intacto.
- `_simResolverObra()` só devolve id em **correspondência única**. Texto ambíguo e texto
  inexistente têm o mesmo tratamento: nenhuma obra selecionada.

**Por que o campo era decorativo antes:** `_simCalcularImpacto()` passava
`dataPrimeiraParcela: amortizacao.dataAmortizacao`, de modo que `dataReferencia` não entrava
em nenhuma conta — qualquer data de extrato produzia o mesmo resultado.

| Dentro da V1 | Fora da V1 |
|---|---|
| Impacto de amortização sobre saldo do extrato | Dedução de saldo por "parcelas pagas" |
| SAC e Price | Dedução de saldo por "data da 1ª parcela" |
| `reduzir_prazo` e `reduzir_prestacao` | TR, poupança, qualquer indexador |
| Comparação dos dois efeitos antes de decidir | MIP, DFI, taxa administrativa, CET |
| Registro do que foi decidido (memória da sessão) | Persistência em banco |
| Amortização na data de corte do extrato | **Pró-rata / amortização em data intermediária** |
| | Equivalência com proposta/extrato oficial |

**Por que "parcelas pagas" ficou fora:** deduzir saldo a partir de contagem de parcelas exige
histórico real de pagamento, atrasos, indexadores e condições contratuais que o EDR não possui.
Qualquer dedução automática produziria saldo errado — e, portanto, economia errada.

**Ressalva obrigatória, fixa e não removível, em toda tela de resultado:**

> Projeção gerencial; condições efetivas dependem da análise e proposta da instituição financeira.

**Mensagem de bloqueio, exibida enquanto o extrato não estiver completo:**

> Informe os dados atuais do contrato conforme o extrato. O valor original financiado não
> representa o saldo devedor atual.

Usuário: equipe interna. Permissão: id `simulador` em `_MODULOS_PERMISSAO` (id técnico mantido
para não quebrar `data-view`/`view-simulador`; rótulo visível é **Amortização**).

### Layout (referência aprovada pelo Duam em 2026-07-30)

Painel de origem somente-leitura (contrato assinado) → bloco "Dados atuais do contrato —
conforme extrato" com asterisco vermelho nos obrigatórios → valor/data da amortização →
**dois cards lado a lado com escolha por radio**: "Reduzir prazo" (novo prazo em destaque,
parcela mantida, parcelas eliminadas) e "Reduzir prestação" (nova parcela em destaque,
redução mensal, prazo mantido), cada um com o selo de economia de juros. Paleta e classes
do EDR, sem cores novas.

**O campo de saldo nasce vazio**, com a nota "Conforme extrato. Este campo **não** é preenchido
pelo cadastro da obra." A taxa do cadastro aparece como conversão informativa
("10,47% a.a. equivale a 0,833234% a.m. — confira no extrato"), **sem** preencher o campo.

---

## 2. Fluxo do usuário

1. Menu → Financeiro → Simulador (rótulo da tela: **Amortização de Contrato**).
2. Seleciona a obra. O painel de origem mostra, **apenas como referência**, o valor original
   financiado, a taxa e o prazo registrados no cadastro, com aviso explícito de que o valor
   original **não é** o saldo atual.
3. Preenche **DADOS ATUAIS DO CONTRATO — CONFORME EXTRATO** (todos obrigatórios):
   - saldo devedor atual;
   - data de referência desse saldo (data do extrato);
   - taxa mensal efetiva do contrato;
   - prazo remanescente em meses;
   - sistema (SAC ou Price).
4. Enquanto qualquer um faltar ou for inválido, a prévia fica **bloqueada** com a mensagem
   acima e a lista do que falta. Não há cálculo parcial, não há estimativa, não há fallback.
5. Com o extrato válido, informa **valor da amortização** e **data da amortização**.
6. A prévia mostra os **dois efeitos lado a lado**, sobre o saldo do extrato:
   - reduzir prazo: prazo antes → depois, parcelas reduzidas, parcela mantida, juros economizados;
   - reduzir prestação: parcela antes → depois, prazo mantido, juros economizados.
7. Escolhe o efeito e registra. O registro guarda saldo base, data de referência, taxa, prazo,
   sistema, valor, modalidade e o resultado — em memória da sessão (sem banco).

---

## 3. Campos obrigatórios antes de qualquer cálculo

Validados por `_simValidarExtrato()`, função única e testável sem DOM:

| Campo | Regra |
|---|---|
| saldo devedor atual | moeda BR → BigInt centavos; deve ser > 0 |
| data de referência do saldo | `YYYY-MM-DD` estrito |
| taxa mensal efetiva | 0 ≤ x ≤ 100; quantizada para ppb inteiro |
| prazo remanescente | inteiro 1..480 |
| sistema | exatamente `SAC` ou `PRICE` |
| valor da amortização | moeda BR → BigInt centavos; > 0 (exigido só para a prévia) |
| data da amortização | **igual à data de corte** — na V1 não há outra opção (ver REGRA TEMPORAL) |
| efeito | `reduzir_prazo` ou `reduzir_prestacao` |

`_simCalcularImpacto()` chama a validação e **lança `EXTRATO_INCOMPLETO`** se falhar — não
existe caminho de código que calcule sem extrato válido.

---

## 4. Contrato do motor de cálculo (`js/edr-v2-simulador-calc.js`)

Núcleo determinístico, inalterado pela correção de direção. Regras invioláveis:

1. Moeda: `BigInt` em **centavos**. Taxa: `BigInt` em **partes por bilhão** (1% a.m. = `10_000_000n`).
2. Proibido no núcleo: `Math.round`, `Math.pow`, `toFixed`, `parseFloat`, `new Date(iso)`.
   Tipo errado lança `TIPO_INVALIDO` — não converte em silêncio.
   **`Number()` só é admitido para contador de meses com limite explícito** (índice de parcela,
   aritmética de calendário, ambos limitados a 480). **Jamais** para moeda, taxa ou saldo —
   nesses três, o tipo é `BigInt` e qualquer conversão é defeito.
3. O núcleo só aceita `taxaMensalPpb`. Não conhece taxa anual.
4. Juros do mês: `half-up( saldo × taxa_ppb / 1e9 )`, divisão inteira.
5. **Price por busca binária**: menor pagamento inteiro em centavos que quita em ≤ n parcelas,
   simulando com a MESMA rotina de juros. A fórmula fechada não é usada.
6. SAC: amortização constante `saldo/n`; parcela = amortização + juros.
7. **Última parcela absorve o resíduo.** Saldo final = 0 sempre.
8. Totais são somatórios das linhas, nunca fórmula.
9. Erros tipados: `SALDO_INVALIDO`, `PRAZO_INVALIDO`, `TAXA_INVALIDA`, `SISTEMA_INVALIDO`,
   `TIPO_INVALIDO`, `PARCELA_NAO_COBRE_JUROS`, `AMORTIZACAO_INVALIDA`, `AMORTIZACAO_EXCEDE_SALDO`,
   `AMORTIZACAO_FORA_DO_PRAZO`, `MODALIDADE_INVALIDA`, `DATA_INVALIDA`, `NAO_CONVERGIU`,
   `SEQUENCIA_INVALIDA`, `SEQUENCIA_DUPLICADA`, `EVENTO_ANTES_DA_BASE` (os três últimos
   acrescentados pela auditoria de 2026-08-03).
   A camada de UI acrescenta `EXTRATO_INCOMPLETO` e `DATA_AMORT_FORA_DO_CORTE`.

### Amortização

- Evento: `{ id, dataAplicacao, sequencia, valorCent, modalidade }`.
- Ordenação: `data ASC, sequencia ASC`. Ordem do array de entrada é irrelevante.
- **Sequência**: inteiro `>= 0`. Negativa é rejeitada (`SEQUENCIA_INVALIDA`).
- **Par (data, sequencia) é único.** Duplicata é rejeitada (`SEQUENCIA_DUPLICADA`) — sem isso,
  inverter dois eventos de mesma data e mesma sequência produziria dois resultados válidos
  diferentes, e o motor deixaria de ser determinístico.
- **Data-base** (`dataBase`, opcional): evento anterior a ela é rejeitado
  (`EVENTO_ANTES_DA_BASE`). Impede que um lançamento retroativo seja aplicado em silêncio
  depois da primeira parcela. Quando ausente, o motor não impõe piso — a V1 sempre a informa.
- `reduzir_prestacao`: prazo preservado; Price → nova busca binária; SAC → nova amortização constante.
- `reduzir_prazo`: pagamento preservado; novo prazo **por simulação**, nunca por logaritmo.
  Ramificações na ordem: saldo=0 → quitado · taxa=0 → divisão inteira · pagamento ≤ juros → erro.
- Quitação integral encerra (prazoDepois=0, parcelaDepois=0).

### Política de arredondamento

- Half-up em toda divisão monetária. Decisão do EDR — não atribuída a norma externa nem a
  "comportamento dos bancos".
- Valor exibido é fronteira de saída; **nunca** retorna como entrada de cálculo.
  Erro documentado e testado: requantizar `0,639519%` exibido dá `6_395_190` ppb; o correto,
  a partir da precisão plena, é `6_395_193` ppb.

### Datas

- `YYYY-MM-DD`, parse por `split('-')`. `new Date(iso)` proibido no motor.
- Soma de meses com clamp ao último dia válido: 31/01+1m → 28/02 (29/02 em bissexto).
- Bissexto com regra completa (÷4, exceto ÷100, incluindo ÷400).

---

## 5. Adaptador de taxa (`js/edr-v2-simulador-taxa.js`) — FORA do núcleo

Única fronteira float, explícita e isolada. Converte e **quantiza** para ppb inteiro (half-up);
depois disso o inteiro é a fonte de verdade. Também contém os parsers de texto livre de
`contrato_taxa`/`contrato_prazo`, que retornam `null` quando não entendem — usados **apenas**
para exibição de origem, nunca para preencher campo de cálculo.

---

## 6. Modelo lógico das tabelas (SQL **NÃO** executado)

Nenhum DDL foi executado em ambiente algum. O modelo abaixo precisa ser **revisto** à luz da
correção de direção — em particular, o cenário deixa de ser "simulação de financiamento" e passa
a ser "posição de contrato informada pelo extrato + lançamentos de amortização".

Campos que a persistência precisará guardar por lançamento, no mínimo:
`company_id`, `obra_id`, `saldo_atual_cent`, `data_referencia_saldo`, `taxa_mensal_ppb`,
`prazo_remanescente`, `sistema`, `data_amortizacao`, `sequencia`, `valor_cent`, `modalidade`,
**`fase`**, **`parcela_referencia`**, e o snapshot do resultado (prazo antes/depois,
parcela antes/depois, juros economizados), com `motor_versao` e hash das premissas.

### `fase` e `parcela_referencia` — obrigatórios (risco apontado pelo Codex, 2026-08-03)

A correção de 2026-08-03 criou duas fases de aplicação, e **só esses dois campos distinguem
um evento na data de corte de uma amortização após parcela**. Sem eles, um lançamento
persistido é ambíguo: o mesmo `data_amortizacao` pode representar as duas situações, com
saldos-base diferentes, e o recálculo a partir do banco não reproduz o resultado gravado.

| Campo | Tipo | Domínio | Significado |
|---|---|---|---|
| `fase` | text | `'data_base'` \| `'parcela'` | em que fase o evento foi aplicado |
| `parcela_referencia` | integer | `>= 0` | `0` na data-base; número da parcela na fase parcela |

Invariantes a garantir no DDL (trigger ou validação de aplicação — CHECK com subquery é
rejeitado pelo Postgres):

- `fase = 'data_base'` ⇒ `parcela_referencia = 0` **e** `data_amortizacao = data_referencia_saldo`
- `fase = 'parcela'`  ⇒ `parcela_referencia >= 1`
- na V1, **todo** lançamento nasce com `fase = 'data_base'`, porque a UI só permite amortizar
  na data de corte. `'parcela'` existe no domínio para o motor e para versões futuras com
  pró-rata — não é alcançável pela interface atual.

Sem `fase` gravada, a leitura teria de inferi-la comparando datas, e a inferência erraria
justamente no caso que a auditoria pegou.

Regras transversais já acordadas e mantidas:
- Toda tabela filha vincula `company_id` + pai por **FK composta**.
- Evento imutável, cancelamento lógico; snapshot de recálculo versionado por revisão.
- Validação `saldo_depois = saldo_antes − valor` não pode ser CHECK com subquery (Postgres
  rejeita) — decidir entre trigger e validação de aplicação quando o DDL for projetado.
- As tabelas precisam entrar em `_TABELAS_TENANT` (`infra.js:27`) junto com o DDL: leitura
  filtra por inclusão, escrita por exclusão — tabela nova esquecida vaza no SELECT.

---

## 7. Integração com o EDR (registro do módulo)

Verificado em `backup/wip-pre-sync-20260802` (`d83778d` + alterações locais), worktree
`edr-amort-wt`. A auditoria original de 2026-07-30 rodou em `dev` sobre `ee5ac50`, antes de
`dev` ser realinhado com `origin/dev`.

> **"Aplicado" abaixo significa aplicado NO BRANCH DE BACKUP, não em `dev`.**
> Conferido em 2026-08-03: `index.html` e `js/edr-v2-auth.js` de `dev` têm **zero** ocorrência
> de `view-simulador`, `simulador-calc` ou `id: 'simulador'`. Levar o módulo a `dev` exigirá
> refazer estes 8 pontos lá.

| # | Onde | Estado |
|---|---|---|
| 1 | `index.html` grupo Financeiro (~1764) | aplicado — `data-view="simulador"` |
| 2 | `index.html` menu mobile (~2658) | aplicado |
| 3 | `index.html` (~2618) | aplicado — `<div id="view-simulador">` |
| 4 | `index.html` `VIEW_TITLES` (~2699) | aplicado — `'Amortização de Contrato'` |
| 5 | `index.html` scripts (~3273-3275) | aplicado — calc, taxa, ui |
| 6 | `js/edr-v2-auth.js` (~242) | aplicado — `{ id: 'simulador', label: 'Amortização' }` |
| 7 | `js/edr-v2-infra.js:27` `_TABELAS_TENANT` | **PENDENTE de propósito** — tabelas não existem |
| 8 | `js/edr-v2-simulador.js` última linha | aplicado — `viewRegistry.register` |

A UI **não** chama `sbGet/sbPost/sbPatch/sbDelete`. Lê apenas o array global `obras` para o
seletor e para o painel de origem. **Nunca grava `obras.contrato_*`. Nunca toca `repasses_cef`.**

---

## 8. Matriz de riscos

| Risco | Estado | Mitigação |
|---|---|---|
| Usar valor original como saldo devedor | **mitigado + testado** | validação obrigatória do extrato, bloqueio da prévia, testes de guarda com sabotagem |
| Isolamento entre tenants | **bloqueado por banco/RLS** | RLS obrigatória + teste 2 tenants antes de publicar; `_TABELAS_TENANT` é conveniência, não barreira |
| `auth_company_id()` / perfil admin | **não testado** | auditoria read-only de `pg_policies` em etapa à parte |
| Texto livre de `contrato_*` | mitigado | parsers retornam `null`; só exibição; nunca regravado. Bug conhecido: `obras.js:733` concatena `%`, gerando "7,95%%" |
| Arredondamento acumulado | mitigado + testado | motor integral; soma das linhas == total |
| Uso comercial indevido | mitigado na UI | ressalva fixa + bloqueio + escopo interno |
| Saldo informado errado pelo usuário | **aceito e declarado** | o dado vem do extrato; a tela exige data de referência para tornar a origem rastreável |

## 9. Critérios de teste

**Motor** (`tests/simulador-calc.test.js`): Price canônico, P−1 não quita, SAC, taxa zero,
prazo 1, conversão de taxa, half-up, datas, reduzir_prazo, reduzir_prestacao, duas amortizações
na mesma data, quitação integral, entradas inválidas, varredura de integridade.

**Guardas** (`tests/simulador-guardas.test.js`) — exigidos pela correção de direção:
1. Cálculo bloqueado com extrato vazio e com **cada** campo faltando isoladamente.
2. Cálculo bloqueado para valores inválidos (saldo ≤ 0, data BR, taxa fora de faixa, prazo
   fora de 1..480, sistema desconhecido).
3. **`contrato_valor` não é saldo devedor**: base do cálculo é o saldo do extrato; sem saldo,
   `contrato_valor` não supre a falta; prova de contraste mostrando que usar o valor original
   produziria economia diferente.
4. Impacto correto com extrato completo; reduzir_prazo economiza mais que reduzir_prestacao.
5. Amortização maior que o saldo é rejeitada.
6. Parser de moeda sem float.

**Sabotagem obrigatória:** remover o bloqueio e injetar fallback para `contrato_valor` devem
fazer a suíte de guardas falhar. Ambas verificadas.

## 10. Checklist de auditoria futura (antes de banco/publicação)

1. Auditoria read-only de RLS (`pg_policies`) — autorização específica.
2. Modelo de persistência revisto para a nova direção; DDL em ambiente descartável.
3. Decisão trigger × aplicação para coerência de saldo.
4. Tabelas em `_TABELAS_TENANT` + policies + FKs compostas.
5. Teste 2 tenants (front e fetch manual).
6. Persistência da UI (troca da memória de sessão por `sbGet/sbPost`).
7. Smoke real dos módulos existentes após integração.
8. **Auditoria independente do Codex** de motor, docs, DDL/RLS, UI e isolamento.
