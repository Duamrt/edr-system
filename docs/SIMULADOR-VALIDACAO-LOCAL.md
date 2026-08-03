# Amortização de Contrato — Relatório de validação LOCAL

**Onde o módulo auditado está (atualizado em 2026-08-03):**

| | |
|---|---|
| Árvore de trabalho | `C:\Users\Duam Rodrigues\edr-amort-wt` |
| Branch | `backup/wip-pre-sync-20260802` |
| Commit base | `d83778d` |
| Estado | **seis alterações locais não commitadas**, de propósito |
| `dev` | `22ee2e0`, **limpo — não contém o módulo**; é a árvore de destino futuro, não a auditada |

Janela: desenvolvimento local. **Sem SQL, sem banco, sem RLS, sem commit, sem push, sem deploy.**
Nada aqui declara o módulo pronto, integrado, seguro ou publicável.

> **Origem histórica.** As seções 1 a 7 foram escritas em **2026-07-30**, quando o trabalho
> ainda estava em `dev` sobre `ee5ac50` como arquivos novos não commitados. Depois disso `dev`
> foi realinhado com `origin/dev` no deploy do PIX das diárias, e o trabalho local migrou para
> o branch de backup acima. **Nenhuma linha do módulo chegou a `dev`** — a menção a `ee5ac50`
> serve só para datar aquela rodada.

> **Procedência.** Tudo abaixo é **reportado pelo Claude** a partir de execuções nesta sessão.
> Permanece **pendente de auditoria independente do Codex** quando o limite voltar — motor,
> documentação, DDL/RLS proposto, integração de UI, isolamento entre tenants e smoke real.

> **Correção de direção aplicada em 2026-07-30.** O módulo deixou de ser "Simulador de
> Financiamento" e passou a ser **Amortização de Contrato**. Todos os números publicados antes
> desta correção (obra DUAM e prévia de R$ 4.000 partindo do valor original do contrato) são
> **ilustrativos do motor de cálculo — não são recomendação nem resultado do contrato real**.

---

## 1. Confirmado localmente (comando + resultado)

### 1.1 Suíte do motor — `node tests/simulador-calc.test.js`
**RESULTADO: 108 OK · 0 FALHA.** Grupos: Price canônico (99× R$ 1.586,58, última R$ 1.585,56,
total R$ 158.656,98, saldo 0, soma das linhas == total), P−1 não quita, SAC, taxa zero, prazo 1,
conversão `7,95% a.a. → 6.395.193 ppb` (+ prova dos 3 ppb perdidos ao requantizar valor exibido),
half-up, datas (31/01+1m→28/02, 29/02 bissexto, 2100 não bissexto), reduzir_prazo,
reduzir_prestacao, duas amortizações na mesma data com sequências, quitação integral,
9 rejeições com código de erro, varredura de integridade em 8 combinações.

### 1.2 Suíte de guardas — `node tests/simulador-guardas.test.js`
**RESULTADO: 63 OK · 0 FALHA.** Criada pela correção de direção. Cobre:

| Grupo | Conteúdo |
|---|---|
| 1. Bloqueio sem extrato | extrato vazio aponta os 5 campos; cálculo lança `EXTRATO_INCOMPLETO`; cada campo faltando isoladamente também bloqueia |
| 2. Valores inválidos | saldo 0/negativo/não-numérico, data em formato BR, taxa negativa/>100%, prazo 0/>480/não-numérico, sistema desconhecido — todos bloqueiam |
| 3. `contrato_valor` ≠ saldo | base do cálculo é o saldo do extrato; sem saldo, `contrato_valor` **não** supre a falta; `contrato_valor` só vira texto de exibição |
| 4. Impacto com extrato completo | ambos os efeitos aplicáveis; prazo cai em reduzir_prazo; parcela cai em reduzir_prestacao; reduzir_prazo economiza mais |
| 5. Amortização > saldo | rejeitada com `AMORTIZACAO_EXCEDE_SALDO` |
| 6. Parser de moeda | sem float; 3 casas decimais → null |

**Prova de contraste registrada pelo teste** (por que a regra existe), com saldo de extrato
R$ 380.000,00 vs. valor original R$ 399.891,20, amortizando R$ 4.000:

```
economia c/ saldo real  : 13.767,88
economia c/ valor origem: 13.771,93
```

São números diferentes — usar o valor original produziria recomendação errada.

### 1.3 Teste por sabotagem
**Motor** (executado antes da correção de direção, código inalterado desde então):

| Sabotagem | Resultado |
|---|---|
| half-up → half-down | 1 FALHA detectada |
| busca binária devolve P+1 | 9 FALHAS |
| ordem de sequência invertida | 4 FALHAS |
| restaurado | 108 OK · 0 FALHA |

**Guardas** (executado após a correção):

| Sabotagem | Resultado |
|---|---|
| A — bloqueio removido de `_simCalcularImpacto` | 12+ FALHAS (erros vazam como `TIPO_INVALIDO`/`SISTEMA_INVALIDO` em vez de bloquear) |
| B — fallback silencioso para `contrato_valor` (39989120n) quando falta saldo | **10 FALHAS**, incluindo "sem saldo, contrato_valor NAO supre a falta" |
| restaurado | 63 OK · 0 FALHA |

A sabotagem B injeta exatamente o defeito que a correção de direção proíbe, e é detectada.

### 1.4 Sintaxe — `node -c`
`edr-v2-simulador-calc.js`, `edr-v2-simulador-taxa.js`, `edr-v2-simulador.js`, `edr-v2-auth.js` → OK.

### 1.5 Greps de regressão
- `sbGet|sbPost|sbPatch|sbDelete` nos 3 arquivos do simulador → **1 ocorrência, em
  comentário; zero chamadas**. A ocorrência é a linha 20 de `edr-v2-simulador.js`
  ("Estado local: nada persiste. Sem sbGet/sbPost/sbPatch/sbDelete"), que declara a
  proibição. `calc` e `taxa` têm zero. *(Corrigido em 2026-08-03: dizia "zero ocorrências",
  contradizendo a contagem registrada nas rodadas seguintes.)*
- `repasses_cef` no simulador → só em comentário de proibição.
- nenhum `sbPatch('obras'` no módulo (não grava `contrato_*`).
- `window.distribuicoes\s*=` e `window.ajustesEstoque\s*=` → vazio (contrato do Estoque intacto).

### 1.6 Smoke no browser local (npx serve :3777, sem login)

> ⛔ **EVIDÊNCIA HISTÓRICA — FLUXO REVOGADO PELA REGRA TEMPORAL (2026-08-03).**
> A sequência abaixo amortiza em **2026-08-10** com extrato de **2026-07-30**. Isso era
> aceito em 2026-07-30 e **hoje é bloqueado**: a V1 só amortiza na data de corte.
> Verificado nesta data contra o código atual:
>
> ```
> _simCalcularImpacto(extrato 2026-07-30, amortização em 2026-08-10)
>   → lança DATA_AMORT_FORA_DO_CORTE
> ```
>
> **Não reproduzir este fluxo.** Ele está preservado para mostrar que a regra mudou —
> reescrevê-lo apagaria a evidência de que o comportamento antigo existiu.
> O fluxo válido hoje está em §4 (2ª rodada) e no grupo 8 de
> `tests/simulador-temporal.test.js`.
>
> Equivalente na V1 atual, mesma entrada com a amortização na data de corte:
>
> | | Registrado abaixo (30/07, revogado) | V1 atual (03/08, data de corte) |
> |---|---|---|
> | data da amortização | 2026-08-10 | **2026-07-30** |
> | reduzir prazo | 416 → 412 · economia R$ 13.767,88 | 416 → 412 · economia **R$ 13.801,19** |
> | reduzir prestação | R$ 4.070,62 → R$ 4.027,67 · economia R$ 6.928,15 | R$ 4.078,23 → R$ 4.035,30 · economia **R$ 6.942,51** |
>
> Os números diferem porque o evento passou a incidir sobre o saldo do extrato intocado,
> antes da primeira parcela — que é exatamente o defeito corrigido na 2ª rodada.

Console: **zero erro** dos scripts do módulo (únicos erros: PostHog sem token, pré-existente).

Sequência verificada em **fixture local renderizando a página do módulo** (não o shell do
EDR), com a obra DUAM injetada (dados do print da aba CEF):

| Passo | Resultado |
|---|---|
| Tela inicial | título "Amortização de Contrato"; prévia **bloqueada**; mensagem exata do bloqueio presente |
| Seleciona a obra DUAM | painel de origem mostra "valor ORIGINAL financiado" e o aviso "não é o saldo devedor atual"; campos de saldo, taxa e prazo **continuam vazios**; prévia **ainda bloqueada** |
| Preenche o extrato (saldo 380.000,00 · ref. 2026-07-30 · taxa 0,832834% a.m. · prazo 416 · SAC) | prévia **liberada**, pedindo valor e data da amortização |
| ⛔ Informa R$ 4.000,00 em 2026-08-10 — **REVOGADO**, hoje lança `DATA_AMORT_FORA_DO_CORTE` | prévia dos dois efeitos, explicitando a base usada |

Texto renderizado na prévia **em 2026-07-30** (⛔ fluxo revogado — ver aviso no início de §1.6):

> Impacto de R$ 4.000,00 em 2026-08-10, **sobre saldo de R$ 380.000,00 (extrato de 2026-07-30)**:
> Reduzir prazo: 416 → 412 meses (−4 parcelas) · parcela mantida · juros economizados: R$ 13.767,88
> Reduzir prestação: R$ 4.070,62 → R$ 4.027,67/mês · prazo mantido (416m) · juros economizados: R$ 6.928,15

Estes valores são **ilustrativos**: o saldo de R$ 380.000,00 e a taxa mensal foram digitados
para o teste, não vieram de extrato real da DUAM.

### 1.7 Layout de referência (aplicado em 2026-07-30, após 1.6)

Camada de apresentação reescrita conforme referência visual do Duam. Núcleo de validação e
cálculo (linhas 1–140 do arquivo) **preservado sem alteração** — as duas suítes seguiram verdes
após a troca (108 e 63).

Verificado em **fixture local renderizando a página do módulo**, com screenshot
(não é o shell do EDR — ver alcance da evidência em §4 da 1ª rodada):

| Item | Resultado |
|---|---|
| Header e menu | "Amortização de Contrato" / botão "Amortização" (desktop e mobile) |
| Painel de origem | somente-leitura, "Valor ORIGINAL financiado R$ 399.891,20" com borda de alerta, + taxa, prazo, entrada, subsídio, FGTS, valor total |
| Aviso no painel | "O valor original financiado **não é o saldo devedor atual**. Informe o saldo conforme o extrato abaixo." |
| Campos do extrato | asterisco vermelho nos 5 obrigatórios; saldo **nasce vazio** com a nota "não é preenchido pelo cadastro da obra" |
| Dica de taxa | "Cadastro: 10,47% a.a. equivale a 0,833234% a.m. — confira no extrato" (informativa, não preenche) |
| Cards de efeito | dois lado a lado com radio; troca por clique confirmada (`modalidadeEscolhida` alterna) |
| Bloqueio | mantido antes do extrato completo, inclusive após selecionar a obra |

Prévia renderizada (saldo R$ 397.450,00 · SAC · 416m · 0,832834% a.m. · amortizando R$ 5.000):

> Reduzir prazo: novo prazo **411 meses** · parcela mantida R$ 4.257,54 · parcelas eliminadas: **5**
> · economia de juros **R$ 17.192,60**
> Reduzir prestação: nova parcela **R$ 4.203,86** · redução mensal **−R$ 53,68** · prazo mantido
> 416 meses · economia de juros **R$ 8.667,37**

> ⚠️ **VALORES DESATUALIZADOS pela correção de ordem (2ª rodada, 2026-08-03).**
> Foram produzidos pelo motor que aplicava o evento **depois** da 1ª parcela. Não são
> reprodutíveis hoje. Recalculado nesta data, mesma entrada, com a amortização na data de
> corte:
>
> | | Acima (30/07) | V1 atual (03/08) |
> |---|---|---|
> | novo prazo · parcelas eliminadas | 411 · 5 | 411 · 5 *(iguais)* |
> | parcela mantida | R$ 4.257,54 | **R$ 4.265,50** |
> | economia — reduzir prazo | R$ 17.192,60 | **R$ 17.234,24** |
> | nova parcela — reduzir prestação | R$ 4.203,86 | **R$ 4.211,84** |
> | economia — reduzir prestação | R$ 8.667,37 | **R$ 8.681,75** |
>
> A economia aumentou porque o evento passou a incidir sobre o saldo do extrato intocado.
> A **dica de taxa** citada na tabela acima ("Cadastro: 10,47% **a.a.** equivale a...") também
> mudou: o sufixo deixou de ser concatenado, para não gerar `%%` quando `contrato_taxa` já
> traz o símbolo. Hoje lê "Cadastro: 10,47% equivale a 0,833234% a.m. — confira no extrato".

Reduzir prazo economiza mais que reduzir prestação, como esperado.

**Bug corrigido durante a verificação:** o painel de origem exibia "R$ 399891,20" sem separador
de milhar. Causa: `_simNumParaMoedaTxt` formata para input, não para leitura. Adicionada
`_simNumParaExibicao`, que reusa o formatador do motor (`centavosParaTexto`). Continua sendo
apenas exibição — não produz valor de cálculo. Suíte de guardas seguiu 63 OK após a correção.

Estes valores são **ilustrativos**: saldo e taxa foram digitados para o teste, não vieram de
extrato real da DUAM.

### 1.8 Registro do módulo (8 pontos — 7 aplicados, 1 pendente de propósito)
| # | Ponto | Estado |
|---|---|---|
| 1 | `index.html:1764` nav desktop (grupo Financeiro) | aplicado |
| 2 | `index.html:2658` menu mobile "mais" | aplicado |
| 3 | `index.html:2618` `<div id="view-simulador">` | aplicado |
| 4 | `index.html:2699` VIEW_TITLES | aplicado |
| 5 | `index.html:3273-3275` 3 tags script | aplicado |
| 6 | `edr-v2-auth.js:242` _MODULOS_PERMISSAO | aplicado |
| 7 | `_TABELAS_TENANT` (`infra.js:27`) | **NÃO aplicado de propósito** — tabelas não existem |
| 8 | `viewRegistry.register('simulador', ...)` | aplicado |

---

## 2. Implementado mas NÃO integrado
- Persistência: **memória da sessão**. Banco não existe; UI avisa em badge fixo.
- Modelo de tabelas precisa ser **revisto** para a nova direção (posição de contrato via extrato
  + lançamentos), antes de qualquer DDL.
- Ponto 7 do registro (`_TABELAS_TENANT`) — junto com o DDL futuro.

## 3. Não testado
- Fluxo da UI **via clique humano real** (digitação campo a campo, toasts, botão Registrar).
  O que foi exercitado é o fluxo interno da página do módulo em fixture local, via script.
- UI **logada com dados reais** de `obras` (o teste injetou a obra DUAM na página).
- Menu mobile **renderizado** em viewport mobile (botão presente no DOM).
- `deploy.sh` reescrevendo o `?v=` das 3 tags novas.
- Combinações exaustivas de SAC/Price sob múltiplas amortizações encadeadas na nova UI.
- Comportamento com `obras` vazio ou obra sem `contrato_*` (guardado por `typeof`, não exercitado
  com dados reais).

## 4. Bloqueado por banco/RLS (fora desta janela)
- DDL das tabelas (modelo lógico a revisar em `SIMULADOR-FINANCIAMENTO.md` §6).
- Auditoria read-only de `pg_policies` / `auth_company_id()` / expressão de perfil admin.
- Policies RLS + FKs compostas + índices únicos compostos.
- Teste de isolamento com 2 tenants (EDR × Jackson), incluindo fetch manual sem filtro do front.
- Troca do armazenamento em memória por persistência real.

## 5. Falhas durante o desenvolvimento
- Hook de segurança bloqueou Write da UI duas vezes (aviso XSS/`innerHTML`). Causa: padrão
  `innerHTML` do EDR. Resolução: todo conteúdo dinâmico passa por `esc()`; moeda e datas vêm
  formatadas do motor; regra registrada no cabeçalho do arquivo.
- Nenhuma outra falha de ferramenta ou teste não explicada.

## 6. Reclassificação de números anteriores
Os resultados publicados antes da correção de direção — cenário "DUAM — contrato CEF"
(1ª parcela R$ 4.284,15, 420 meses, total R$ 1.101.284,71) e a prévia de R$ 4.000 sobre
R$ 200.000 (−7 parcelas, R$ 9.078,40) — são **ilustrativos do motor**. Partiam do valor
original financiado como se fosse saldo devedor, o que a V1 agora **bloqueia**. Não são
recomendação nem resultado do contrato real de nenhuma obra.

## 7. Próximo passo (fora desta janela — exige autorização)
Auditoria independente do Codex de motor, documentação, DDL/RLS proposto, integração de UI,
isolamento entre tenants e smoke real — antes de qualquer decisão de banco ou publicação.

---

# Auditoria de regras temporais — 2026-08-03

Branch: `backup/wip-pre-sync-20260802` · Base: `d83778d` · Worktree isolado.
Janela: correção local. **Sem SQL, sem banco, sem RLS, sem commit, sem push, sem deploy,
sem API paga.** Nenhum módulo fora do simulador foi tocado.

Achados levantados pelo Codex, **confirmados localmente** por teste que falhava antes
da correção.

## 1. Comando exato e resultado

```
node tests/simulador-calc.test.js       → RESULTADO: 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    → RESULTADO GUARDAS: 63 OK · 0 FALHA
node tests/simulador-temporal.test.js   → RESULTADO TEMPORAL: 33 OK · 0 FALHA
node -c js/edr-v2-simulador-calc.js     → OK
node -c js/edr-v2-simulador-taxa.js     → OK
node -c js/edr-v2-simulador.js          → OK
git diff --check                        → vazio
```

Total: **204 asserções, 0 falha.**

### Estado ANTES da correção (suíte temporal recém-escrita)

Rodada contra o código original, a suíte acusou os 7 achados. O grupo 7 interrompeu a
execução com `TypeError: UI._simTaxaOrigemTexto is not a function` — a função não existia.

## 2. Causa e correção, achado por achado

| # | Achado | Causa | Correção |
|---|---|---|---|
| 1 | `2026-02-31` passava como data de referência | validação por `/^\d{4}-\d{2}-\d{2}$/`, que confere formato e não calendário | `SimuladorCalc.parseDataISO()` na validação do extrato (`edr-v2-simulador.js`) |
| 2 | `data_referencia_saldo` era decorativa | `_simCalcularImpacto` usava `dataPrimeiraParcela: amortizacao.dataAmortizacao`; a data do extrato não entrava em conta nenhuma | `dataReferencia` vira data de corte; 1ª parcela = corte + 1 mês, via `somarMeses` |
| 3 | Data de amortização livre, sem pró-rata | UI oferecia campo de data independente | bloqueio `DATA_AMORT_FORA_DO_CORTE`; campo virou espelho `readonly` do corte |
| 4 | Evento anterior à 1ª parcela aplicado em silêncio | `_ordenarEventos` não tinha piso temporal | parâmetro `dataBase`; erro `EVENTO_ANTES_DA_BASE` |
| 5 | Sequência negativa e duplicada aceitas | `_ordenarEventos` só exigia inteiro | `SEQUENCIA_INVALIDA` (< 0) e `SEQUENCIA_DUPLICADA` (par data+sequência único, via `Set`) |
| 6 | `contrato_taxa = "7,95%"` virava `7,95%% a.a.` | 3 pontos concatenavam `'% a.a.'` a texto livre do cadastro | `_simTaxaOrigemTexto()` / `_simPrazoOrigemTexto()`: exibem como veio, sem sufixo |
| 7 | Comentário do núcleo proibia `Number()` sem ressalva | o próprio motor usa inteiro nativo como contador de meses | comentário corrigido: `Number()` só para contador de meses; jamais moeda, taxa ou saldo |

### Correção de rota durante a auditoria

O grupo 2 falhou inicialmente por erro **do teste**, não do código: procurava
`linhas[0].dataISO`, e o campo do motor chama-se `vencimento`. Corrigido o teste.
Se o motor tivesse sido "corrigido" para expor `dataISO`, teria ganhado um campo
duplicado e o defeito real continuaria.

### Efeito colateral tratado

`tests/simulador-guardas.test.js` usava `dataAmortizacao: '2026-08-10'` com extrato de
`2026-07-30`. Com a regra nova isso é bloqueado, e a suíte quebrou com
`DATA_AMORT_FORA_DO_CORTE`. A fixture foi alinhada à data de corte (2 linhas), com
comentário apontando o teste temporal. **A quebra foi consequência correta da regra**,
não regressão.

## 3. Sabotagem executada (verde sozinho não prova nada)

Cada guarda nova foi desligada e a suíte reexecutada:

| Sabotagem | Resultado |
|---|---|
| A — bloqueio de data desligado (`if (false)`) | **2 FALHAS**: data posterior e anterior ao corte |
| B — rejeição de sequência duplicada desligada | **3 FALHAS**: duplicata + ordens [A,B] e [B,A] |
| C — piso `dataBase` desligado | **1 FALHA**: evento antes da data-base |
| D — validação de data de volta para só regex | **7 FALHAS**: as datas impossíveis do grupo 1 |
| restaurado | 108 · 63 · 33 — 0 falha |

A sabotagem D precisou ser refeita: a primeira versão inverteu a lógica em vez de
reproduzir o defeito original, e acusou a data **válida** (`2024-02-29`) em vez das
inválidas. Sabotagem que não reproduz o defeito real dá sinal falso.

## 4. Smoke no navegador (Playwright, servidor local :4911, sem login)

> **ALCANCE DESTA EVIDÊNCIA** (reclassificado em 2026-08-03, risco apontado pelo Codex):
> a página é uma **fixture local com estilização básica**, não o shell do EDR. Prova que a
> lógica da tela responde como esperado; **não** prova integração visual no sistema real,
> com login, CSS do EDR ou celular. A validação pelo sistema completo fica para a auditoria
> final, antes de qualquer integração em `dev`.

Página de fixture com `obras` injetado, renderizando `_simBuildPagina()` de verdade.
Console: **apenas 404 de favicon**. Verificado no DOM:

| Verificação | Resultado |
|---|---|
| campo de obra | `INPUT` com `datalist` (não é mais `<select>`) |
| data da amortização | espelha `2026-07-30`, `readOnly = true` |
| mudar corte para `2026-09-30` | campo e prévia acompanham (`extrato de 2026-09-30`) |
| `2026-02-31` no corte | prévia bloqueada, aponta "data de referência" |
| `contrato_taxa = "7,95%"` | renderiza `7,95%`; `%%` ausente em toda a página |
| `contrato_taxa = "10,47"` | renderiza `10,47`, sem sufixo acrescentado |
| obra inexistente digitada | painel de origem some, `obraId` vazio |
| prévia com extrato completo | calcula os dois efeitos, com "Economia de juros" |

Um `[WARNING]` do navegador apareceu ao injetar `2026-02-31` em `<input type="date">`
("does not conform to the required format"). É recusa correta do próprio campo,
provocada pelo teste — não defeito da aplicação.

## 5. Greps de regressão

```
sbGet|sbPost|sbPatch|sbDelete nos 3 JS  → 1 ocorrência, no comentário de proibição
                                           (idêntica ao commit d83778d; nenhuma chamada)
sbPatch('obras'                          → 0
repasses_cef                             → 0
select id="sim-obra"                     → 0 (virou input + datalist)
```

## 6. Classificação do estado

### Confirmado localmente
- 204 asserções verdes nas três suítes, com sabotagem provando cada guarda nova.
- Sintaxe dos três arquivos JS (`node -c`).
- Comportamento da UI no navegador, conforme tabela do item 4.
- `git diff --check` limpo; 5 arquivos alterados, todos do simulador.

### Implementado, mas NÃO integrado
- Todo o módulo vive apenas em `backup/wip-pre-sync-20260802`. **Não está em `dev`.**
- Registro de amortização segue em memória de sessão — some ao recarregar.
- `_TABELAS_TENANT` continua sem as tabelas, de propósito: elas não existem.

### Não testado
- Login real e UI logada com `obras` vindo do banco.
- Celular físico e menu mobile.
- Perfil não-admin.
- Autocomplete com lista grande de obras (o smoke usou 2).
- Combinações exaustivas de SAC/Price com várias amortizações encadeadas na UI nova.
- `deploy.sh` reescrevendo `?v=` das tags de script.

### Bloqueado por banco/RLS
- DDL das tabelas — o modelo lógico ainda precisa ser revisto à luz da data de corte.
- Auditoria read-only de `pg_policies` / `auth_company_id()`.
- Policies, FKs compostas, índice único composto por `(obra_id, data, sequencia)` —
  a regra `SEQUENCIA_DUPLICADA` do motor precisará de equivalente no banco.
- Teste de isolamento com 2 tenants.
- Persistência real no lugar da memória de sessão.

## 7. Procedência

Tudo acima é **reportado pelo Claude**, a partir de execuções nesta sessão. Os achados
foram levantados pelo Codex e confirmados aqui por teste. A **auditoria independente do
Codex sobre esta correção continua pendente** — em particular: a decisão de tornar a
amortização obrigatoriamente igual à data de corte, e o efeito disso no modelo de
persistência ainda não projetado.

---

# Auditoria — 2ª rodada (2026-08-03) · falha encontrada na 1ª correção

A auditoria do Codex reprovou a conclusão anterior. A regra temporal havia sido
**documentada e não implementada**: os 204 testes verdes da 1ª rodada não cobriam a
regra central que o próprio documento acabara de fixar.

## 1. Causa

`simular()` aplicava **todo** evento depois de gerar a parcela do mês
(`edr-v2-simulador-calc.js`, comentário "Eventos com data <= vencimento desta parcela
aplicam-se APÓS ela"). Não havia tratamento especial para a data de corte, então o evento
da data-base entrava depois da prestação de agosto.

Consequência: a amortização incidia sobre saldo já reduzido, e os juros da 1ª parcela eram
calculados sobre o saldo **pré**-amortização — exatamente o contrário do que a
§REGRA TEMPORAL determina.

## 2. Evidência (antes da correção)

```
node -e "... C.simular({saldoCent:38000000n, dataBase:'2026-07-30',
                        dataPrimeiraParcela:'2026-08-30', amortizacoes:[4.000 em 2026-07-30]})"

parcelaReferencia: 1
saldoAntes      : 37908654n      ← R$ 379.086,54
extrato         : 38000000       ← R$ 380.000,00
1a parcela venc : 2026-08-30
```

Suíte temporal recém-escrita (grupo 8), rodada contra esse código: **7 FALHAS**, incluindo
"juros da 1a parcela nao usam o saldo pre-amortizacao — ambos 316477".

## 3. Alteração

`simular()` passou a ter duas fases explícitas:

- **Fase 1 — data-base**: eventos com `dataAplicacao === dataBase` são aplicados **antes**
  do laço de parcelas. Snapshot com `fase: 'data_base'` e `parcelaReferencia: 0`.
- **Fase 2 — parcela**: eventos posteriores seguem aplicados após a parcela do mês, com
  `fase: 'parcela'` e `parcelaReferencia: k`.

A lógica de aplicar um evento (~85 linhas) foi **extraída** para `_aplicarEvento(ev, st, ctx)`,
usada pelas duas fases. Antes existia só dentro do laço; duplicá-la permitiria corrigir uma
cópia e esquecer a outra.

`_simResolverObra()` / `_simRotuloObra()` substituíram a resolução de obra por nome.

### Efeito numérico

Saldo R$ 380.000,00 · corte 2026-07-30 · amortização R$ 4.000,00 · SAC · 416 meses ·
0,832834% a.m.:

| | Antes | Depois |
|---|---|---|
| `fase` / `parcelaReferencia` | — / 1 | `data_base` / **0** |
| saldo antes do evento | R$ 379.086,54 | **R$ 380.000,00** |
| saldo depois | R$ 375.086,54 | **R$ 376.000,00** |
| juros da 1ª parcela | R$ 3.164,77 | **R$ 3.131,46** |
| 1ª parcela | 2026-08-30 | 2026-08-30 (mantida) |
| prazo | 416 → 412 | 416 → 412 |
| economia de juros | — | R$ 13.801,19 |

## 4. Regressão

```
node tests/simulador-calc.test.js       → RESULTADO: 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    → RESULTADO GUARDAS: 63 OK · 0 FALHA
node tests/simulador-temporal.test.js   → RESULTADO TEMPORAL: 51 OK · 0 FALHA
node -c nos 3 arquivos JS               → OK
```

As duas suítes anteriores passaram **sem alteração**: a extração de `_aplicarEvento`
preservou o comportamento dos eventos pós-corte.

Testes novos: grupo 8 (evento na data-base, 10 asserções) e grupo 9 (obras homônimas,
8 asserções). Total da suíte temporal: 33 → 51.

## 5. Sabotagem das guardas novas

| Sabotagem | Resultado |
|---|---|
| **E — fase da data-base desligada** (`if (false)`, evento volta a ser aplicado após a 1ª parcela) | **7 FALHAS**, incluindo saldo antes, `fase`, `parcelaReferencia` e juros da 1ª parcela |
| **F — autocomplete volta a escolher a 1ª homônima** (`porNome.length >= 1`) | **1 FALHA**: "nome ambiguo nao seleciona nenhuma obra" |
| restaurado | 108 · 63 · 51 — 0 falha |

A sabotagem E é exatamente o defeito que a auditoria encontrou, reintroduzido de propósito.

## 6. Lição registrada

Documentar a regra e escrever testes ao redor dela não prova que ela está implementada.
Os 7 testes da 1ª rodada verificavam **validação e bloqueio de entrada** — nenhum verificava
o **saldo sobre o qual o evento incide**. A auditoria independente encontrou o que a suíte
não olhava.

Antes de declarar uma regra de cálculo validada, o teste precisa afirmar o **valor
resultante**, não apenas que a entrada foi aceita ou recusada.

---

# Ajuste documental — 2026-08-03 (3ª rodada, sem alteração de código)

Janela documental. Sem banco, SQL, RLS, `dev`, commit, push ou deploy.

> **Força da afirmação "nenhum `.js` foi tocado"** (ressalva registrada a pedido do Codex):
> a evidência é **circunstancial**, não prova. Sustenta-se em (a) as edições desta rodada
> terem sido só nos dois `.md`, e (b) o horário de modificação dos arquivos — docs às
> 11:03/11:04, `.js` e testes parados em 10:45/10:48. **Não** houve hash dos `.js` tomado
> antes da rodada, então a comparação retroativa de conteúdo é impossível.
>
> O que o estado atual comprova, sem depender de histórico: as três suítes seguem em
> 108 · 63 · 51 e o módulo permanece inteiramente local e não integrado.
>
> Para as próximas rodadas: **registrar `sha256sum` dos arquivos de código no início da
> janela**, para que "não toquei em X" seja verificável em vez de declarado.

## 1. Risco tratado — `fase` e `parcela_referencia` ausentes no modelo lógico

**Apontado pelo Codex.** A §6 da spec mandava guardar "o snapshot do resultado", mas a lista
mínima de campos não citava `fase` nem `parcela_referencia` — os dois únicos campos que
distinguem um evento na data de corte de uma amortização após parcela.

**Por que importa:** sem eles, dois lançamentos com o mesmo `data_amortizacao` ficam
indistinguíveis no banco, embora incidam sobre saldos-base diferentes. O recálculo a partir
da tabela não reproduziria o resultado gravado — e erraria justamente no caso que a auditoria
da 2ª rodada encontrou.

**Correção:** §6 passou a listar os dois campos, com tipo, domínio e as invariantes a
garantir no DDL:

- `fase = 'data_base'` ⇒ `parcela_referencia = 0` e `data_amortizacao = data_referencia_saldo`
- `fase = 'parcela'` ⇒ `parcela_referencia >= 1`
- na V1 todo lançamento nasce `'data_base'`; `'parcela'` existe no domínio para o motor e
  para versões futuras com pró-rata, **não é alcançável pela UI atual**

**Evidência de que os dois valores existem e se distinguem** (motor, sem banco):

```
evento em 2026-07-30 (= data-base) → fase: data_base | parcelaReferencia: 0
evento em 2026-09-30 (posterior)   → fase: parcela   | parcelaReferencia: 2
```

## 2. Risco tratado — alcance da evidência visual

**Apontado pelo Codex.** A captura de tela prova a prévia funcional, mas foi obtida numa
página de fixture com estilização básica. **Não** comprova integração no shell do EDR,
com login, CSS do sistema ou celular.

Reclassificada explicitamente como **teste local**. A validação pelo sistema completo entra
na auditoria final, antes de qualquer integração em `dev`.

## 3. Estado após esta rodada

Inalterado em relação à 2ª rodada — nenhuma linha de código foi modificada:

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
```

Total: **222 asserções.**

O módulo continua **exclusivamente local**, no branch `backup/wip-pre-sync-20260802`:

- **não** está em `dev`;
- **sem** persistência — os lançamentos vivem em memória de sessão e somem ao recarregar;
- **sem** tabelas, DDL, policies ou RLS;
- `_TABELAS_TENANT` continua sem entradas do módulo, de propósito;
- nenhum commit, push ou deploy foi feito em nenhuma das três rodadas.

### Estado das duas árvores de trabalho — são diferentes (correção 2026-08-03)

"Working tree limpo" foi escrito antes sem dizer de qual árvore. São duas, e só uma
está limpa:

| Árvore | Branch | Estado |
|---|---|---|
| `C:\Users\Duam Rodrigues\edr-system` | `dev` (`22ee2e0`) | **limpo** — nada do módulo chegou aqui |
| `C:\Users\Duam Rodrigues\edr-amort-wt` | `backup/wip-pre-sync-20260802` (`d83778d`) | **com alterações não commitadas, de propósito** |

O worktree do módulo tem, sem commit:

```
 M docs/SIMULADOR-FINANCIAMENTO.md
 M docs/SIMULADOR-VALIDACAO-LOCAL.md
 M js/edr-v2-simulador-calc.js
 M js/edr-v2-simulador.js
 M tests/simulador-guardas.test.js
?? tests/simulador-temporal.test.js
```

Permanece assim **até existir janela explícita do Duam para commit**. Commit é fronteira
de autorização, não etapa automática de conclusão. Enquanto o trabalho estiver só na árvore
de trabalho, nenhuma das três rodadas pode ser confundida com algo entregue.

## 4. Pendências que permanecem

### Bloqueado por banco/RLS
- DDL das tabelas, agora incluindo `fase` e `parcela_referencia` com as invariantes acima.
- Decisão trigger × validação de aplicação para essas invariantes e para
  `saldo_depois = saldo_antes − valor` (CHECK com subquery é rejeitado pelo Postgres).
- Auditoria read-only de `pg_policies` / `auth_company_id()`.
- Policies, FKs compostas, índice único `(obra_id, data_amortizacao, sequencia)` —
  equivalente no banco à regra `SEQUENCIA_DUPLICADA` do motor.
- Teste de isolamento com 2 tenants.
- Troca da memória de sessão por persistência real.

### Não testado
- **Integração visual no shell do EDR, com login e CSS do sistema.**
- Celular físico e menu mobile.
- Perfil não-admin.
- Autocomplete com lista grande de obras (os smokes usaram 2 e 3).
- `deploy.sh` reescrevendo `?v=` das tags de script.

## 5. Procedência

Os achados das três rodadas foram levantados pelo **Codex** e confirmados localmente por
teste. Os resultados de execução são **reportados pelo Claude**. A auditoria independente
do Codex sobre o conjunto — motor, documentação, modelo de persistência e integração —
**continua pendente**.

## 6. Hash de base para a próxima rodada

Tomado ao fim desta rodada, para que a próxima possa provar por comparação — e não por
declaração — o que foi ou não alterado:

```
037794455c2c48c44849d27872ed383bead3d9a237c76963d93342ccd43d2a68  js/edr-v2-simulador-calc.js
c5550ce11691fe6bfe924ca249dcc51611b8eff3c182ca71363142c77907b76b  js/edr-v2-simulador-taxa.js
4bc307ef947c80eba755d409c2b687cac79322e4fbd66b9373e38a6a24ba9e2a  js/edr-v2-simulador.js
031bcec44ea96dafdbb1dc306f9d8befb7b102ce5295558c8b1e54c714ad2138  tests/simulador-calc.test.js
829106b34f9f2721189d01ac8228de0b484a213d669c6b2f88357d3b0beb7419  tests/simulador-guardas.test.js
232489ce0c4e9295a50a7c61ddfc0aac9d240e054690b29ab86088a2f0ba0473  tests/simulador-temporal.test.js
```

Conferir com `sha256sum` no início e no fim da janela seguinte.

---

# Correção de rastreabilidade — 2026-08-03 (4ª rodada, documental)

Apenas documentação. Nenhum `.js` e nenhum teste tocado — confirmado por `sha256sum`
contra os hashes da §6 acima, antes e depois.

## 1. Risco tratado — cabeçalho apontava para a árvore errada

**Apontado pelo Codex.** O cabeçalho deste relatório dizia `Branch: dev · Base: ee5ac50`,
enquanto o módulo auditado vive em `backup/wip-pre-sync-20260802` (`d83778d`). `dev` não
contém uma linha do módulo. Um leitor que fosse conferir em `dev` não acharia nada, e
concluiria que o relatório descreve outra coisa.

**Por que aconteceu:** o cabeçalho estava correto quando foi escrito, em 2026-07-30 — o
trabalho realmente estava em `dev` sobre `ee5ac50`, como arquivos novos não commitados.
Depois disso `dev` foi realinhado com `origin/dev` no deploy do PIX das diárias, e o trabalho
local migrou para o branch de backup. O cabeçalho envelheceu junto com o mundo, sem ser
atualizado.

**Correção:** o cabeçalho passou a identificar a árvore/branch/commit **efetivamente
auditados**, com o estado de não-commit explícito, e cita `dev` só como árvore limpa de
destino futuro. A origem em `ee5ac50` virou nota histórica datada, não localização atual.

## 2. Mesmo defeito na spec — §7

`SIMULADOR-FINANCIAMENTO.md` §7 dizia "Auditado no checkout canônico (`dev`, `ee5ac50`)"
sobre a tabela dos 8 pontos de registro do módulo. Como 7 dos 8 aparecem como "aplicado",
a leitura natural era de que o módulo já está registrado em `dev`.

**Verificação feita antes de corrigir:**

```
dev  → grep -c "view-simulador|simulador-calc"  index.html        = 0
dev  → grep -c "id: 'simulador'"                js/edr-v2-auth.js = 0
wt   → grep -c "view-simulador|simulador-calc"  index.html        = 2
wt   → grep -c "id: 'simulador'"                js/edr-v2-auth.js = 1
```

**Correção:** §7 passou a dizer que "aplicado" se refere ao branch de backup, com o resultado
dos greps registrado, e a avisar que levar o módulo a `dev` exigirá refazer os 8 pontos lá.

## 3. Estado após esta rodada

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
```

Árvores, conferidas nesta rodada:

| Árvore | Branch | Estado |
|---|---|---|
| `edr-system` | `dev` (`22ee2e0`) | limpo; **sem nenhuma referência ao módulo** |
| `edr-amort-wt` | `backup/wip-pre-sync-20260802` (`d83778d`) | 6 alterações não commitadas, de propósito |

## 4. Lição

Documento vivo precisa dizer onde o artefato está **agora**. Quando a árvore de trabalho
muda, o cabeçalho é a primeira coisa a envelhecer — e é justamente por ele que um auditor
começa. A origem histórica continua útil, mas como nota datada, nunca como localização.

---

# Reclassificação de evidência histórica — 2026-08-03 (5ª rodada, documental)

Apenas documentação. Nenhum `.js` e nenhum teste tocado — conferido por `sha256sum` contra
os hashes da §6, antes e depois.

## 1. Risco tratado — §1.6 descrevia como validado um fluxo hoje bloqueado

**Apontado pelo Codex.** A §1.6 registra "Informa R$ 4.000,00 em **2026-08-10**" como passo
que liberou a prévia, com extrato de 2026-07-30. Isso era verdade em 2026-07-30 e a regra
temporal da 2ª rodada **revogou**: a V1 só amortiza na data de corte.

O perigo é concreto: alguém lendo só a §1.6 reproduziria um fluxo que hoje lança
`DATA_AMORT_FORA_DO_CORTE`, e concluiria que o módulo quebrou.

**Verificação antes de marcar:**

```
_simCalcularImpacto(extrato 2026-07-30, amortização em 2026-08-10)
  → DATA_AMORT_FORA_DO_CORTE
```

**Decisão: marcar, não reescrever.** Trocar a data por 2026-07-30 deixaria o documento
coerente e apagaria a evidência de que o comportamento antigo existiu — justamente o que
torna rastreável a mudança de regra. A §1.6 ganhou aviso ⛔ no início, marca na linha da
tabela e nota no texto da prévia, com a tabela comparativa:

| | 30/07 (revogado) | V1 atual, na data de corte |
|---|---|---|
| data | 2026-08-10 | 2026-07-30 |
| reduzir prazo | 416 → 412 · R$ 13.767,88 | 416 → 412 · **R$ 13.801,19** |
| reduzir prestação | R$ 4.070,62 → R$ 4.027,67 · R$ 6.928,15 | R$ 4.078,23 → R$ 4.035,30 · **R$ 6.942,51** |

## 2. Mesmo defeito, mais sutil — §1.7

A §1.7 **não** cita data de amortização, então não disparava o mesmo alarme. Mas os valores
foram produzidos pelo motor pré-correção e não são reprodutíveis hoje. Quem tentasse conferir
acharia números diferentes e suspeitaria do motor, não do documento.

Recalculado com a mesma entrada (saldo R$ 397.450,00 · SAC · 416m · amortizando R$ 5.000):

| | 30/07 | V1 atual |
|---|---|---|
| novo prazo · parcelas eliminadas | 411 · 5 | 411 · 5 *(iguais)* |
| parcela mantida | R$ 4.257,54 | **R$ 4.265,50** |
| economia — reduzir prazo | R$ 17.192,60 | **R$ 17.234,24** |
| nova parcela — reduzir prestação | R$ 4.203,86 | **R$ 4.211,84** |
| economia — reduzir prestação | R$ 8.667,37 | **R$ 8.681,75** |

A §1.7 ganhou aviso ⚠️ com essa tabela. Registrada também a mudança no texto da dica de taxa,
que perdeu o sufixo `a.a.` concatenado (achado 6 da 1ª rodada).

## 3. Varredura das demais menções

Conferidas uma a uma; nenhuma outra precisa de marca:

| Local | Data citada | Situação |
|---|---|---|
| §4 (2ª rodada), linha da fixture | `2026-08-10` | já descrita como **quebrada e corrigida** pela regra nova |
| §4 (1ª rodada), smoke | `2026-09-30` como **data de corte** | uso legítimo — mudar o corte é permitido |
| §5 (3ª rodada), evento pós-corte | `2026-09-30` como evento | válido no motor, fase `parcela` |

## 4. Estado após esta rodada

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
```

## 5. Lição

Relatório de validação acumula evidência datada. Quando uma regra muda, as evidências
anteriores **não passam a ser mentira — passam a ser histórico**, e precisam ser marcadas
como tal na hora. Apagá-las esconde que a regra mudou; deixá-las sem marca convida alguém
a reproduzir comportamento revogado.

Regra para as próximas correções de regra: **varrer o relatório inteiro atrás de evidências
que a nova regra invalida**, e marcar cada uma com o comportamento atual ao lado. Números que
não citam a regra explicitamente (como os da §1.7) são os mais fáceis de esquecer.

---

# Uniformização de linguagem — 2026-08-03 (6ª rodada, documental)

Apenas documentação. Nenhum `.js` e nenhum teste tocado — conferido por `sha256sum` contra
os hashes da §6, antes e depois.

## 1. Risco tratado — §1.5 contradizia as rodadas seguintes

**Apontado pelo Codex.** A §1.5 declarava "`sbGet|sbPost|sbPatch|sbDelete` → **zero
ocorrências**", enquanto a 1ª rodada já havia registrado "1 ocorrência, no comentário de
proibição". Duas contagens diferentes para o mesmo grep, no mesmo documento.

**Verificação:**

```
grep -n "sbGet|sbPost|sbPatch|sbDelete" js/edr-v2-simulador*.js
  js/edr-v2-simulador.js:20:  Estado local: nada persiste. Sem sbGet/sbPost/sbPatch/sbDelete.

calc: 0 · taxa: 0 · ui: 1 (comentário)
```

**Correção:** §1.5 passou a dizer "**1 ocorrência, em comentário; zero chamadas**", com a
linha citada e nota de que a redação anterior contradizia as rodadas seguintes. A distinção
importa: "zero ocorrências" seria falsificável por um grep, e um leitor que rodasse o comando
concluiria que o relatório erra. "Zero chamadas" é o que de fato se quer garantir.

`SIMULADOR-FINANCIAMENTO.md` não precisou de ajuste: já dizia "A UI **não chama**
`sbGet/sbPost/sbPatch/sbDelete`" — fala de chamadas, não de ocorrências textuais.

## 2. Melhoria aplicada — "página real" reabria impressão de integração

**Apontada pelo Codex.** §1.6 e §1.7 diziam "verificado na **página real**", termo que
sugere o shell do EDR com login — exatamente a impressão que a 3ª rodada tratou de desfazer
ao rebaixar a evidência a fixture local.

Três ocorrências corrigidas para **"fixture local renderizando a página do módulo"**:

| Linha | Antes | Depois |
|---|---|---|
| §1.6 | "Sequência verificada na página real" | "…em fixture local renderizando a página do módulo (não o shell do EDR)" |
| §1.7 | "Verificado na página real, com screenshot" | "…em fixture local…, com screenshot (não é o shell do EDR)" |
| §3 | "fluxo interno na página real, via script" | "fluxo interno da página do módulo em fixture local, via script" |

Confirmado por grep: **zero ocorrências ativas** — isto é, nenhuma seção de evidência
descreve o teste como "página real". O termo segue aparecendo **neste registro histórico**,
na coluna "Antes" da tabela acima e no texto que a explica; são **citações do texto
corrigido**, não descrições de evidência. A contagem de citações não é fixada aqui de
propósito: ela muda a cada edição do próprio registro — inclusive esta.

Comando que separa as duas coisas (o registro histórico começa no cabeçalho
"# Uniformização de linguagem"):

```bash
L=$(grep -n "^# Uniformização de linguagem" docs/SIMULADOR-VALIDACAO-LOCAL.md | cut -d: -f1)
head -n $((L-1)) docs/SIMULADOR-VALIDACAO-LOCAL.md | grep -c "página real"   # → 0  (evidência)
tail -n +$L      docs/SIMULADOR-VALIDACAO-LOCAL.md | grep -c "página real"   # citações históricas; conferir na execução
```

*(Correção de 2026-08-03, apontada pelo Codex: a redação anterior dizia "zero ocorrências
restantes no relatório" — falsa já no momento em que foi escrita, porque a própria tabela
acima cita o termo. Um relatório que registra as próprias correções reintroduz o texto que
corrigiu; grep bruto passa a acusar para sempre.)*

## 3. Estado após esta rodada

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
```

## 4. Lição

Os dois achados são da mesma família: **uma parte do documento afirmando algo que outra
parte contradiz**. Nenhum dos dois era erro de fato sobre o código — o código sempre esteve
certo. Era o relatório falando duas línguas sobre si mesmo.

Ao acrescentar rodada nova a um relatório existente, verificar se ela **contradiz seção
anterior** — e, quando contradisser, corrigir a antiga em vez de deixar as duas versões
convivendo. Contagem de grep e nome de ambiente de teste são os dois lugares onde isso
mais escapa.

---

# Correção de afirmação auto-referente — 2026-08-03 (7ª rodada, documental)

Apenas documentação. Nenhum `.js` e nenhum teste tocado — conferido por `sha256sum` contra
os hashes da §6, antes e depois.

## 1. Melhoria aplicada — "zero ocorrências" era falso no próprio parágrafo

**Apontada pelo Codex.** A 6ª rodada terminava com "Confirmado por grep: **zero** ocorrências
restantes de 'página real' no relatório". Falso já no instante em que foi escrito: a tabela
logo acima, na coluna "Antes", cita o termo cinco vezes.

**Causa:** o grep de verificação rodou **antes** de eu escrever a tabela que cita o texto
corrigido. A afirmação nasceu desatualizada pela própria edição que a acompanhava.

**Correção:** a frase passou a dizer "**zero ocorrências ativas** — nenhuma seção de
evidência descreve o teste como 'página real'", com o comando que separa as duas regiões:

```bash
L=$(grep -n "^# Uniformização de linguagem" docs/SIMULADOR-VALIDACAO-LOCAL.md | cut -d: -f1)
head -n $((L-1)) docs/SIMULADOR-VALIDACAO-LOCAL.md | grep -c "página real"   # → 0
tail -n +$L      docs/SIMULADOR-VALIDACAO-LOCAL.md | grep -c "página real"   # → citações
```

## 2. Segundo defeito, encontrado ao aplicar a correção

A primeira versão da correção dizia "o termo ainda aparece **6 vezes** neste registro
histórico". Ao reconferir depois de salvar: **8**. A própria correção acrescentara duas
citações.

Qualquer número fixo de citações históricas é **auto-invalidante**: muda a cada edição do
registro, inclusive a edição que o documenta. A contagem de citações foi removida do texto
e vive só no comando acima, para quem quiser conferir na hora.

O número que importa continua fixado, porque é o que a correção garante: **zero nas seções
de evidência**.

## 3. Varredura das demais afirmações de contagem

| Afirmação | Mede o quê | Auto-referente? |
|---|---|---|
| §1.5 — `sbGet\|sbPost\|sbPatch\|sbDelete` → 1 em comentário, 0 chamadas | os `.js` | **não** — verificado: calc 0 · taxa 0 · ui 1 |
| §7 (spec) — `dev` tem 0 ocorrência do módulo | `index.html` e `auth.js` de `dev` | não |
| 6ª rodada — "página real" | **o próprio relatório** | **sim** — corrigida acima |

Só afirmações que medem **o próprio documento** têm esse defeito. As que medem código são
estáveis: o documento pode ser reescrito à vontade sem alterar o resultado.

## 4. Estado após esta rodada

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
```

## 5. Lição

Relatório que registra as próprias correções cita o texto que corrigiu — e assim reintroduz,
como citação, o termo que removeu como descrição. Grep bruto sobre o documento inteiro passa
a acusar para sempre.

Regra: ao afirmar contagem **sobre o próprio documento**, (a) delimitar a região medida,
(b) rodar o grep **depois** de escrever tudo, e (c) não fixar números que a edição seguinte
muda. Contagem sobre código não precisa disso — é estável por natureza.

---

# Correção do número residual — 2026-08-03 (8ª rodada, documental)

Apenas documentação. Nenhum `.js` e nenhum teste tocado — conferido por `sha256sum` contra
os hashes da §6, antes e depois.

## 1. Risco tratado — o número saiu do texto e ficou no comando

**Apontado pelo Codex.** A 7ª rodada removeu a contagem de citações do texto corrido, mas
deixou `# → 6 (citações)` no comentário do comando ilustrativo — quando a contagem já era 13.
O mesmo defeito auto-referente, no mesmo parágrafo que o denunciava.

**Correção:** o comentário da linha `tail` passou a dizer
`# citações históricas; conferir na execução`, sem número.

## 2. Por que os `# → 0` das linhas `head` PERMANECEM

Varredura dos números esperados restantes:

```
head ... | grep -c "página real"   # → 0  (evidência)   ← duas ocorrências, mantidas
tail ... | grep -c "página real"   # citações históricas; conferir na execução
```

*(Sem números de linha de propósito: eles se deslocam a cada inserção acima — mesma
fragilidade da contagem de citações. A referência estável é o conteúdo do comando.)*

Os dois `→ 0` ficam de propósito. A diferença não é de estilo:

| | `head` (evidência) | `tail` (citações) |
|---|---|---|
| natureza | **asserção** | retrato |
| valor esperado | 0, sempre | qualquer |
| se mudar | **defeito** — alguma seção de evidência voltou a dizer "página real" | normal — o registro cresceu |
| ação | corrigir | nenhuma |

Medido nesta data: `head` → **0** (invariante), `tail` → **13** (varia).

**Regra:** número esperado em comando serve para **acusar falha**, não para descrever
estado. Se qualquer valor for aceitável, o número não deve estar lá.

## 3. Estado após esta rodada

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
```

## 4. Lição

A 7ª rodada corrigiu o texto e esqueceu o comentário do código dentro do mesmo bloco.
Ao remover uma informação que envelhece, **varrer todas as formas em que ela aparece** —
texto corrido, tabela, comentário de comando, título de seção. Comentário dentro de bloco
de código é o esconderijo mais fácil, porque a leitura passa por ele como se fosse código,
não como afirmação.

---

# Redesenho da apresentação — 2026-08-03 (9ª rodada)

Escopo: **apenas camada visual** de `js/edr-v2-simulador.js`. Motor, regras temporais,
validações, testes, banco, RLS, `dev`, commit, push e deploy — intocados.

Hashes inalterados nesta rodada (comparados aos da §6):

```
037794…  js/edr-v2-simulador-calc.js      031bce…  tests/simulador-calc.test.js
c5550c…  js/edr-v2-simulador-taxa.js      829106…  tests/simulador-guardas.test.js
                                          232489…  tests/simulador-temporal.test.js
```

## 1. Causa raiz — as classes CSS não existiam

A tela usava três classes que **não existem** no design system do EDR:

```
grep -c "dist-form-input" index.html  → 0
grep -c "btn-pri"         index.html  → 0   (existe .btn-primary)
grep -c "btn-sec"         index.html  → 0   (existe .btn-secondary)
```

Sem estilo aplicado, o navegador desenhava controles nativos do sistema operacional.
Não era questão de estética: **a tela nunca teve o CSS do EDR**.

Componentes reais, confirmados no `<style>` de `index.html`:

| Componente | Uso correto |
|---|---|
| `.field` | **wrapper**: `<div class="field"><label>…</label><input></div>` |
| `.card` | com `.card-header` + `.card-title` + `.card-body` |
| primário | `class="btn btn-primary"` — `.btn-primary` sozinho só define cor |
| secundário | `class="btn-secondary"` (já traz base visual própria) |

## 2. Medição antes × depois (viewport real 375×812, mobile+touch)

| Métrica | Antes | Depois | Meta |
|---|---|---|---|
| altura dos campos | 19–21px | **44px** (52px nos protagonistas) | ≥ 44 |
| altura dos botões | 15px | **44px** | ≥ 44 |
| classes inexistentes no DOM | 10 | **0** | 0 |
| `.field` / `.card` no DOM | 0 / 0 | **8 / 4** | > 0 |
| `.btn.btn-primary` / `.btn-secondary` | 0 / 0 | **1 / 1** | > 0 |
| cards de efeito em 375px | — | **empilhados** | sem rolagem horizontal |
| cards de efeito em 1280px | — | **lado a lado** | comparáveis |
| overflow horizontal | não | **não** | não |

Desktop 1280px: número do efeito a 30px, saldo do extrato a 19px, ressalva presente,
faixa "Memória da sessão" presente.

### Erro de instrumento corrigido no meio da medição

As três primeiras medições reportaram viewport 468, 500 e 981 em vez de 375. Causa: a
**fixture não tinha `<meta name="viewport">`** — sem ela o navegador assume ~980px e encolhe
tudo. O `index.html` real do EDR tem a meta; a fixture, não. Corrigida a fixture, a medição
passou a bater (375). Os números anteriores foram descartados.

## 3. O que mudou na tela

- **Fluxo em 4 passos numerados**, cada um em `.card` com `.card-header`: (1) selecionar
  obra · (2) posição do extrato · (3) valor a amortizar · (4) comparar e decidir.
- **Dois avisos superiores** viraram faixa de status discreta (memória de sessão) +
  ressalva financeira legível em texto lateral. As duas continuam presentes e não removíveis.
- **Protagonistas**: saldo devedor e valor a amortizar com fonte 19px e altura 52px.
  Secundários (taxa, prazo, sistema) visíveis, com peso reduzido — nunca escondidos.
- **Estado vazio orientativo** no lugar do alerta laranja de rodapé: lista o que falta,
  em vez de acusar erro.
- **Comparação**: dois cards com número grande (30px), economia destacada e escolha por
  clique no card inteiro; empilham em ≤720px.
- CSS **escopado em `#view-simulador`** — nenhum estilo global do EDR foi alterado.

## 4. Regressão

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
node -c js/edr-v2-simulador.js          → OK
```

## 5. Alcance da evidência

> **Fixture local**, não o shell do EDR com login. As capturas
> (`ux-ANTES/DEPOIS-desktop/mobile.png`) renderizam `_simBuildPagina()` com o CSS do EDR
> extraído do `index.html`, servido de `edr-amort-wt` em porta local.
>
> **Não valida**: fluxo autenticado (login → menu → view), celular físico, banco, RLS,
> produção, isolamento entre tenants. Ver §"Dois sentidos de shell real" na 11ª rodada:
> o *shell com view injetada* foi validado depois; o *fluxo autenticado* segue pendente.

## 6. Pendências

- Validar no **fluxo autenticado** (login → menu Financeiro → Amortização), que é
  diferente do shell com view injetada já medido.
- Celular físico.
- Autocomplete com lista grande de obras (fixture usou 2).
- Tudo que depende de banco.

---

# Ajustes de UI após revisão do Codex — 2026-08-03 (10ª rodada)

Escopo: `js/edr-v2-simulador.js`, camada visual. Motor, taxa e testes com hash inalterado.

## 1. Ressalva financeira — contraste insuficiente

Era 12px em `--text-secondary`, com borda lateral fina. Informação obrigatória e
comercialmente sensível não pode competir por atenção com o rodapé.

Virou callout: 13px, texto em `--text-primary` (`rgb(17,24,39)`), fundo âmbar 7% e
ícone "!". Continua discreta, mas legível. Medido: `fontSize 13px`,
`color rgb(17,24,39)`, `background rgba(217,119,6,.07)`.

## 2. Etapa 2 — quinto campo órfão

`repeat(auto-fit,minmax(200px,1fr))` com 5 campos deixava "Sistema de amortização"
sozinho na segunda linha, com vazio grande ao lado.

Grade explícita de 6 colunas: saldo ocupa 4 (protagonista), os outros 2 cada.

| | Antes | Depois |
|---|---|---|
| linha 1 | saldo · data · taxa · prazo | **saldo · data** |
| linha 2 | sistema *(órfão)* | **taxa · prazo · sistema** |

Medido em 1280px: `[["sim-saldo","sim-dataref"],["sim-taxa","sim-prazo","sim-sistema"]]`.
Em ≤980px cai para 4 colunas; em ≤720px empilha.

## 3. Barra cinza no rodapé — NÃO é defeito do módulo

Suspeita de overflow horizontal. **Não confirmada.** Medição em 1280px e 375px:

```
.sim-vazio    scrollW 987  clientW 987   overflowX false
.card-body    scrollW 1037 clientW 1037  overflowX false
.card         scrollW 1037 clientW 1037  overflowX false
#view-simulador scrollW 1040 clientW 1040 overflowX false

375px: body scrollWidth 375 · viewport 375 · elementos com overflowX: []
```

Varredura de `position:fixed|sticky` com altura < 30px: **nenhum elemento**.

Cadeia de containers: nenhum rola (`rolaX/rolaY false`); só o documento
(`docRolaY: true`). O elemento é a **barra de rolagem vertical da janela**, que o
Windows desenha curta e centralizada ao desaparecer por inatividade — visível na captura
porque estava a 75% de zoom.

## 4. Verificação em 375px após os ajustes

```
viewport 375 · bodyOverflow false · campos empilhados true
campos/botões < 44px: 0 · elementos com overflowX: []
```

## 5. Regressão

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
node -c js/edr-v2-simulador.js          → OK
```

Hashes inalterados: `037794…` calc · `c5550c…` taxa · `232489…` teste temporal.

## 6. Evidência e alcance

Capturas: `ux-v2-desktop.png`, `ux-v2-mobile.png` — renderizadas no **shell do EDR com
view injetada** (`localhost:5180`, `index.html`), **sem login e sem navegação pelo menu**.

**Não valida**: login real, celular físico, banco, RLS, produção. O teste humano sem
explicação prévia continua pendente.

---

# Auditoria de acessibilidade — 2026-08-03 (11ª rodada)

Retomada após a publicação da correção de Entrada do Cliente (frente separada, no
checkout canônico). **Este worktree não foi tocado durante aquela publicação.**

## 1. Estado antes de editar

```
worktree:     C:\Users\Duam Rodrigues\edr-amort-wt
branch:       backup/wip-pre-sync-20260802
commit-base:  d83778d
```

```
git status --porcelain -uall:
 M docs/SIMULADOR-FINANCIAMENTO.md
 M docs/SIMULADOR-VALIDACAO-LOCAL.md
 M js/edr-v2-simulador-calc.js
 M js/edr-v2-simulador.js
 M tests/simulador-guardas.test.js
?? tests/simulador-temporal.test.js
```

Hashes de entrada:

```
037794…  js/edr-v2-simulador-calc.js
c5550c…  js/edr-v2-simulador-taxa.js
1b260b…  js/edr-v2-simulador.js          (mudou desde a §6: correções de área segura + teclado)
031bce…  tests/simulador-calc.test.js
829106…  tests/simulador-guardas.test.js
232489…  tests/simulador-temporal.test.js
```

Suítes na entrada: **108 · 63 · 51 — 0 falha.** `node -c` OK nos três JS.

## 2. Auditoria dos cards de decisão no shell com view injetada

Servido de `edr-amort-wt` em `localhost:5310`, `index.html` do EDR, view injetada.

### Já conforme (verificado, não presumido)

| Item | Medido |
|---|---|
| contêiner | `role="radiogroup"` com `aria-label` |
| cards | `role="radio"`, `aria-checked` refletindo a seleção |
| roving tabindex | selecionado `0`, outro `-1` — **um só ponto de parada no Tab** |
| Enter / Espaço | selecionam (disparados como `KeyboardEvent`, seleção mudou) |
| Setas ←→↑↓ | alternam entre os dois |
| foco | acompanha o card que passou a valer |
| `:focus-visible` | regra presente na folha de estilo |

Ordem de tabulação do módulo, medida:
`sim-obra → saldo → dataref → taxa → prazo → sistema → am-valor → [card selecionado] →
btn-secondary → btn btn-primary`

### Defeito encontrado e corrigido — nome acessível

Sem `aria-label`, o nome acessível de um `div[role=radio]` cai no `textContent`. O leitor
de tela anunciava o card inteiro grudado:

```
"Reduzir prazoNovo prazo412 mesesParcela segue R$ 4.078,23Você deixa de pagar 4 parcelasEco…"
```

**Correção:** `aria-label` explícito, montado a partir dos mesmos números do card:

```
"Reduzir prazo: novo prazo de 412 meses, 4 parcelas a menos, parcela mantida em
 R$ 4.078,23. Economia de juros de R$ 13.801,19."

"Reduzir prestação: nova parcela de R$ 4.035,30, R$ 42,93 a menos por mes, prazo
 mantido em 416 meses. Economia de juros de R$ 6.942,51."
```

Único arquivo alterado nesta rodada: `js/edr-v2-simulador.js`
(`1b260b…` → `3bb960b6ec676a45a5be1dcfa970645b912f41ec1708097d4f9021556d61d25f`).

## 3. Desktop e 375px — medido no shell com view injetada

375×812, mobile+touch, com o extrato preenchido:

```
viewport 375 · bodyOverflow false
campos cobertos pela .bnav (ao focar, incluindo os cards): []
elementos com overflowX: []
campos/botões com altura < 44px: []
cards de efeito: empilhados
```

A verificação de cobertura pela barra inferior agora inclui **os cards de decisão**, não
só os campos — eles também recebem foco por teclado.

## 4. Três ambientes distintos — não confundir

| Ambiente | O que é | O que prova |
|---|---|---|
| **fixture local** | `_ux.html`, página só com a view e o CSS do EDR extraído | lógica e estilo do módulo isolados |
| **shell com view injetada** | `index.html` de `edr-amort-wt` em `localhost:5310`, view escrita por script | integração com CSS, `.bnav` e layout do EDR |
| **fluxo autenticado** | login → menu Financeiro → Amortização | **NADA — nunca executado** |
| **produção** | `sistema.edreng.com.br` | **nada deste módulo — ele não está lá** |

As medições desta rodada são do **shell com view injetada**. O módulo **não está em `dev`
nem em produção**.

### Dois sentidos de "shell real" — desambiguados em 2026-08-03

O termo era usado para duas coisas diferentes, e o documento chegou a afirmar e negar a
mesma validação (risco apontado pelo Codex):

| Sentido | Estado |
|---|---|
| **arquivo** `index.html` do EDR, com CSS, sidebar e `.bnav` reais | **validado** — é o que foi medido |
| **fluxo autenticado**: login → menu → view renderizada pela navegação | **pendente — nunca executado** |

A partir daqui o documento usa **"shell com view injetada"** e **"fluxo autenticado"**.
"Shell real" sozinho não deve mais aparecer descrevendo evidência.

## 5. Estado ao fim da rodada

```
node tests/simulador-calc.test.js       → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js    →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js   →  51 OK · 0 FALHA
node -c nos 3 JS                        → OK
```

Hashes inalterados: motor, taxa e os três testes. Só a UI mudou.

## 6. Não testado / não validado

- **Login real.** A view foi injetada por script; não passei pela autenticação.
- **Leitor de tela de verdade** (NVDA, VoiceOver). O que foi medido é o `aria-label` e a
  árvore de acessibilidade — não a locução real.
- **Celular físico.** Só emulação 375×812.
- **Teclado físico.** Os eventos foram disparados por `dispatchEvent`, não digitados.
- Perfil não-admin, autocomplete com lista grande de obras.
- Tudo que depende de banco: DDL, RLS, `pg_policies`, isolamento entre tenants,
  persistência.

**O módulo NÃO está integrado, NÃO está pronto, NÃO tem persistência, NÃO foi validado
contra banco e NÃO está apto a deploy.** Continua exclusivamente no worktree, sem commit.

> **[REVOGADO em 2026-08-03]** — verdadeiro quando escrito. O módulo foi integrado em
> `dev` e publicado (`a300ea1`). Segue sem persistência e sem banco. Ver seção 5.

---

# Cobertura da UI acessível — 2026-08-03 (12ª rodada)

Dois riscos apontados pelo Codex. Sem commit, integração, banco ou deploy.

## 1. Contradição documental sobre "shell real" — corrigida

O documento dizia, em pontos diferentes, que a validação no "shell real local"
**continuava pendente** e que **foi medida**. O termo carregava dois sentidos:

| Sentido | Estado |
|---|---|
| **arquivo** `index.html` do EDR — CSS, sidebar e `.bnav` reais | **validado** |
| **fluxo autenticado** — login → menu → view pela navegação | **pendente, nunca executado** |

A partir daqui o documento usa **"shell com view injetada"** e **"fluxo autenticado"**.
Títulos de §2 e §3 da 11ª rodada renomeados; a tabela de ambientes ganhou a linha
"fluxo autenticado — NADA, nunca executado". "Shell real" sozinho não descreve mais
evidência (as 2 ocorrências restantes citam o título desta seção).

## 2. `aria-label`, `role="radio"` e `_simTeclaEfeito` sem teste — coberto

As 222 asserções cobriam motor, guardas e regra temporal. Uma regressão na UI acessível
passaria verde. Criada **`tests/simulador-acessibilidade.test.js`** — 37 asserções:

| Grupo | Cobre |
|---|---|
| 1 | `role="radio"` nos dois cards; `aria-checked` refletindo a seleção |
| 2 | roving tabindex: selecionado `0`, outro `-1`; invariante de **um só** ponto de parada |
| 3 | `aria-label` é frase, começa pelo nome, cita prazo/parcelas/economia, **não** é o `textContent` grudado |
| 4 | Enter, Espaço, `Spacebar`, 4 setas, ida-e-volta, `preventDefault` em cada, tecla irrelevante inerte, **Tab não capturado** |
| 5 | efeito não aplicável: sem `role`, sem `tabindex`, sem `onkeydown` |

### Natureza do arquivo — markup + handler, NÃO teste de DOM

Ele **não monta nem interpreta HTML**: verifica por regex a string produzida por
`_simCardEfeito` e chama `_simTeclaEfeito` direto, com stubs. Vale como guarda unitária
contra regressão; **não** prova árvore de acessibilidade nem foco real no navegador.
Chamá-lo de "DOM mínimo" era impreciso — corrigido na 13ª rodada.

Por que não jsdom/Playwright: nenhum está instalado (`require` falha) e o EDR é HTML+JS
vanilla sem build. `_simCardEfeito`, `_simTeclaEfeito` e `SimuladorModule` foram
acrescentados ao `module.exports`.

### Sabotagem — cada uma com hash antes/depois

| Sabotagem | Hash | Resultado |
|---|---|---|
| A — `aria-label` removido | linha suprimida | **8 FALHAS** (grupo 3 inteiro) |
| B — os dois cards com `tabindex="0"` | `ca8b78…` → `04181d…` | **2 FALHAS** (roving tabindex) |
| C — `Tab` capturado pelo handler | `ca8b78…` → `455baf…` | **1 FALHA** (Tab sai do radiogroup) |
| restaurado | `ca8b78abce7e` | 37 OK · 0 FALHA |

**Erro de método registrado:** ao aplicar a sabotagem A concluí, por `grep -c aria-label`
retornar 2, que nada havia mudado — mas o 2 era resíduo (comentário + outra ocorrência) e
a linha tinha sido removida. Contagem de grep sem saber o que compõe o número não é
evidência; o certo é comparar **hash** antes/depois, como nas sabotagens B e C.

## 3. Estado

```
node tests/simulador-calc.test.js            → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js         →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js        →  51 OK · 0 FALHA
node tests/simulador-acessibilidade.test.js  →  37 OK · 0 FALHA   (nova)
node -c nos 3 JS                             → OK
```

Total: **259 asserções.**

```
037794…  js/edr-v2-simulador-calc.js   (inalterado)
c5550c…  js/edr-v2-simulador-taxa.js   (inalterado)
ca8b78…  js/edr-v2-simulador.js        (só o export acrescentado nesta rodada)
```

## 4. Continua fora de cobertura automatizada — validação MANUAL

- **Leitor de tela real** (NVDA / VoiceOver): o teste verifica o `aria-label`; a locução
  pode diferir do atributo.
- **Teclado físico**: o handler é chamado direto, sem foco do sistema operacional.
- **`:focus-visible` renderizado**: é CSS, exige navegador.
- **Fluxo autenticado**: login → menu → view.
- Celular físico, perfil não-admin, autocomplete com lista grande.
- Tudo que depende de banco: DDL, RLS, `pg_policies`, isolamento entre tenants,
  persistência.

**O módulo NÃO está integrado, NÃO está pronto, NÃO tem persistência, NÃO foi validado
contra banco e NÃO está apto a deploy.**

> **[REVOGADO em 2026-08-03]** — verdadeiro quando escrito. Integrado e publicado em
> `a300ea1`. Segue sem persistência e sem banco. Ver seção 5.

---

# Foco após setas e natureza do teste — 2026-08-03 (13ª rodada)

Dois pontos do Codex sobre `tests/simulador-acessibilidade.test.js`. Sem commit,
integração, banco ou deploy.

## 1. BUG — a suíte passava sem exercitar `alvo.focus()`

`_simTeclaEfeito` devolve o foco ao card que passou a valer:

```js
const alvo = document.querySelector('#view-simulador .sim-ef.sel');
if (alvo) alvo.focus();
```

O stub devolvia `null` para **qualquer** seletor. O `if (alvo)` engolia a chamada, e as
37 asserções passavam **sem nunca executar nem verificar** a devolução de foco — falso
verde exatamente na parte que o teste existia para cobrir.

**Correção:** `querySelector('#view-simulador .sim-ef.sel')` passou a devolver um card
espião que conta chamadas a `focus()`. Asserções acrescentadas (37 → **44**):

| Asserção | Por quê |
|---|---|
| cada uma das 4 setas devolve o foco (`+1` no contador) | é o comportamento do padrão radiogroup |
| Enter **não** move o foco (`+0`) | quem apertou já está no card |
| Espaço **não** move o foco (`+0`) | idem |
| tecla irrelevante **não** move o foco (`+0`) | não pode haver efeito colateral |

### Sabotagem D — a exigida pelo Codex

| | |
|---|---|
| alteração | `if (alvo) alvo.focus();` → comentário |
| hash | `ca8b78abce7e` → `d246f5068795` |
| resultado | **4 FALHAS** — uma por seta |
| restaurado | `ca8b78abce7e` · 44 OK · 0 FALHA |

## 2. MELHORIA — o arquivo não é "DOM mínimo"

Ele não monta nem interpreta HTML: casa regex na string de `_simCardEfeito` e chama
`_simTeclaEfeito` direto. Renomeado no cabeçalho para **"markup + handler"**, com o
limite explícito de que **não prova árvore de acessibilidade nem foco real**.

A lista do que **não** substitui ganhou dois itens:

- árvore de acessibilidade computada pelo navegador;
- **foco real** — `focus()` é contado num espião, não movido de verdade.

## 3. Estado

```
node tests/simulador-calc.test.js            → 108 OK · 0 FALHA
node tests/simulador-guardas.test.js         →  63 OK · 0 FALHA
node tests/simulador-temporal.test.js        →  51 OK · 0 FALHA
node tests/simulador-acessibilidade.test.js  →  44 OK · 0 FALHA
node -c nos 3 JS                             → OK
```

Total: **266 asserções.** Hashes de motor e taxa inalterados; `edr-v2-simulador.js` em
`ca8b78abce7e` (não mudou nesta rodada — só o teste e a documentação).

## 4. Continua como validação MANUAL

Leitor de tela real (NVDA/VoiceOver) · teclado físico · `:focus-visible` renderizado ·
**árvore de acessibilidade do navegador** · **foco real movido** · fluxo autenticado ·
celular físico · perfil não-admin · autocomplete com lista grande · tudo que depende de
banco.

**O módulo NÃO tem persistência e NÃO foi validado contra banco.**

---

## 5. Integração e publicação — 2026-08-03

Integrado em `dev` e publicado. O commit `4f7f062` (branch `backup/wip-pre-sync-20260802`)
**não** pôde ser levado por `cherry-pick`: ele nasceu sobre `d83778d`, onde os arquivos do
simulador já existiam, então registra *modificações*. Em `dev` esses arquivos nunca
existiram → conflito `DU` em 5 dos 7 arquivos. Abortado sem forçar nem resetar.

Estratégia usada: `git checkout 4f7f062 -- <pacote>` (copia o conteúdo final, não aplica
diff) + edição cirúrgica dos 2 arquivos existentes. Evita arrastar o resto do WIP
(`d83778d` traz quadro de diárias, notas/importar/estoque e rascunho do PIX) e evita
apagar a Entrada do Cliente — que no branch de backup aparece como deleção
(`edr-v2-entrada-cliente.js | 125 --`), por ser anterior a ela.

### Escopo publicado — 12 arquivos

| Arquivo | Ação |
|---|---|
| `js/edr-v2-simulador-{calc,taxa}.js`, `js/edr-v2-simulador.js` | novos |
| `tests/simulador-{calc,guardas,temporal,acessibilidade}.test.js` | novos |
| `docs/SIMULADOR-{FINANCIAMENTO,VALIDACAO-LOCAL}.md` | novos |
| `index.html` | +10 linhas (view, menu ×2, título, 3 scripts) |
| `js/edr-v2-auth.js` | +1 linha (item no registry) |
| `docs/ENTRADA-CLIENTE.md` | commit separado (evidências do deploy anterior) |

`SIMULADOR-VALIDACAO-LOCAL.md` veio da versão **commitada** em `4f7f062`, não da alteração
local pós-commit no worktree.

### Verificações antes do commit

```
comparação arquivo a arquivo vs worktree  → 9/9 iguais (divergência era só CRLF)
index.html — auditoria linha a linha      → 10 linhas, todas do simulador
node -c nos 3 JS + auth.js                → OK
git diff --check                          → limpo
lista final                               → 12 arquivos, nenhum extra
```

```
simulador-calc            108 OK · 0 FALHA
simulador-guardas          63 OK · 0 FALHA
simulador-temporal         51 OK · 0 FALHA
simulador-acessibilidade   44 OK · 0 FALHA
entrada-cliente (regress.) 67 OK · 0 FALHA     → 333 asserções, zero falhas
```

### Commits

```
b8d54ef  feat(simulador): motor de amortizacao SAC/Price com regras temporais
da713d4  test(simulador): 266 assercoes em 4 suites + relatorio de validacao local
ffa313c  feat(shell): expor Amortizacao no menu Financeiro
3ef2091  docs(entrada-cliente): registrar evidencias do deploy d6e64a1
a300ea1  deploy — cache-busting (13 arquivos, 47/47 linhas simétricas)
```

Publicado por `./deploy.sh`. Versão `08031749` · SW `edr-system-v20260803174935`.
`d6e64a1..a300ea1` em `dev` e `main`.

### Evidência em produção — `https://sistema.edreng.com.br`

```
3 scripts do simulador servindo         → HTTP 200 (?v=08031749)
edr-v2-entrada-cliente.js               → HTTP 200 (preservado)
botões data-view="simulador"            → 2 (desktop + mobile), texto "Amortização"
setView('simulador')                    → tela montada, 1500px, 8 campos, 0 erros
viewRegistry: simulador entre 24 handlers, view reconstruída do zero (3842 chars)
console                                 → sem erro do simulador
                                          (PostHog sem token é pré-existente)
```

**Ressalva de método:** o shell foi revelado por script **sem autenticar**, para provar a
montagem da tela. Isso prova que o módulo carrega, registra e renderiza em produção —
**não** prova o fluxo com login real, dados de obra reais nem permissão por perfil.

### Pendências

- Validação do Duam com **login real**: menu Financeiro → Amortização, simulação de ponta
  a ponta com obra real.
- Perfil não-admin: o item `simulador` foi adicionado ao registry de permissões, mas o
  comportamento com perfil restrito **não** foi testado.
- Persistência: segue como projeção de sessão; não grava em banco.
- Acessibilidade com leitor de tela real e teclado físico — segue não testada.
