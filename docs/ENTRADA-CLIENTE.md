# Entrada do Cliente — regra de saldo (2026-08-03)

> Correção local no checkout canônico `edr-system`, branch `dev`.
> **Sem banco, SQL, RLS, commit, push ou deploy.** O simulador de Amortização
> permanece pausado no worktree `edr-amort-wt`.

## 1. Defeito

Contrato de entrada R$ 14.000,00, repasse lançado de R$ 5.000,00.
A tela exibia **"Entrada: R$ 14.000,00 pendente"** — o valor contratado inteiro.

| Arquivo | Comportamento anterior |
|---|---|
| `js/edr-v2-custos.js:402` | calculava `totalEntradaPaga` e **não usava no selo**; servia só para decidir ✓/pendente |
| `js/edr-v2-custos.js:428` | renderizava `fmtR(contratoEntrada)` sempre |
| `js/edr-v2-obras.js:616` | lia **só o booleano** `obra.entrada_paga`, sem consultar repasse — divergia de Custos |

Não era erro de lançamento nem de banco: o repasse entrava normalmente no
agregado geral ("Recebido: R$ 5.000,00"). Era regra derivada de apresentação.

## 2. Regra (decisão do Duam — o ledger vence)

Fonte de verdade: `repasses_cef` de tipo `'entrada'`.

- `contrato_entrada` é o **contratado**; nunca é decrementado.
- `recebido  = Σ repasses tipo 'entrada' da obra`
- `pendente  = max(contratado − recebido, 0)` — nunca negativo
- `excedente = max(recebido − contratado, 0)` — exibido à parte
- **`entrada_paga = true` sem repasse NÃO quita.** É inconsistência de
  conciliação: o booleano não fabrica dinheiro recebido. O resumo geral já
  conta R$ 0 nesses casos; divergir criaria duas contabilidades.
- Booleano `true` + repasse parcial → mesma inconsistência; o ledger prevalece.

**`saldo a receber` NÃO foi alterado.** Ele usa `totalRecebido`, que já inclui os
repasses de entrada — descontar de novo contaria a entrada duas vezes.

## 3. Implementação

Regra única em **`js/edr-v2-entrada-cliente.js`** (`EntradaCliente.calcular/rotulo/cor`),
consumida por Custos e Obras. Registrada no `index.html` **antes** de `edr-v2-obras.js`,
porque os dois módulos dependem dela.

Em Obras, o cálculo foi movido para **depois** de `reps` — a versão anterior declarava
`entradaPaga` acima da linha que monta a lista de repasses.

### Checkbox do contrato

Era "Entrada já paga pelo cliente", o que induzia a tratá-lo como registro de
recebimento. Passou a:

> ☐ Marca legada de conciliação — **não registra recebimento**
> O valor recebido vem dos repasses do tipo Entrada. Para registrar que o cliente
> pagou, lance o repasse — marcar aqui não soma ao caixa nem quita a entrada.

## 4. Como cada caso aparece

Verificado no shell real (`localhost:5210`), com `EntradaCliente` carregado:

| Caso | Selo | Cor |
|---|---|---|
| 14k contratado · 5k lançado | Entrada: R$ 9.000,00 pendente · R$ 5.000,00 recebido | amarelo |
| 14k · sem lançamento | Entrada: R$ 14.000,00 pendente | amarelo |
| 14k · 14k lançado | ✓ Entrada quitada: R$ 14.000,00 | verde |
| 14k · 16k lançado | ✓ Entrada quitada · R$ 2.000,00 acima do contratado | verde |
| legado: marcado, sem repasse | Entrada: R$ 14.000,00 pendente · conferir conciliação | **vermelho** |
| legado: marcado, 5k lançado | Entrada: R$ 9.000,00 pendente · conferir conciliação | **vermelho** |

Os dois casos de legado trazem `title` com o motivo:
"Marcada como paga no cadastro, mas sem repasse registrado." / "…mas o repasse
registrado não cobre o valor contratado."

Em Obras, o card mostra o rótulo de status (QUITADA / PARCIAL / PENDENTE / **CONFERIR**),
o valor contratado, uma linha com recebido e pendente, e o alerta quando houver.

## 5. Testes

```
node tests/entrada-cliente.test.js   → RESULTADO ENTRADA: 67 OK · 0 FALHA
node -c js/edr-v2-entrada-cliente.js → OK
node -c js/edr-v2-custos.js          → OK
node -c js/edr-v2-obras.js           → OK
```

Cobre: sem lançamento · parcial 14k/5k · quitação exata · múltiplos lançamentos ·
acima do contratado · legado sem repasse · legado parcial · booleano com cobertura
(sem alarme falso) · filtro por obra e por tipo · bordas (contrato 0, campos ausentes,
valor não numérico, `obra_id` numérico vs string).

### Sabotagem

| Sabotagem | Resultado |
|---|---|
| A — `pendente = contratado` (o defeito original) | **6 FALHAS**, incluindo o caso 14k/5k |
| C — guarda de inconsistência removida | **11 FALHAS** |
| restaurado | 67 OK · 0 FALHA |

**Sabotagem B, descartada como inválida:** injetar `|| marcadaNoCadastro` no ramo de
quitação não alterou saída nenhuma — comparadas lado a lado, sabotada e correta deram
`{status:'inconsistente', quitada:false, pendente:14000}`. O `||` só teria efeito quando
`recebido < contratado`, e nessa condição a guarda seguinte já sobrescreve o status.
A sabotagem era **inócua, não invisível**. Ficou registrado para não se confundir
"teste não detecta" com "não há o que detectar".

O grupo 6b foi acrescentado nessa investigação e **é útil por outro motivo**: trava o
invariante de que o booleano não altera `quitada`, `recebido` nem `pendente`, para
qualquer ledger.

## 6. Alcance e pendências

**Não validado:** login real, dados de produção, celular, banco, RLS. As renderizações
foram exercitadas por script no shell local, com dados sintéticos.

**Pendência de dados (não executada, exige autorização):** medir quantas obras têm
`entrada_paga = true` sem repasse de entrada. Elas passarão a exibir "conferir
conciliação" em vermelho — comportamento correto pela regra, mas convém saber o volume
antes que apareça na tela de alguém. **Nenhum dado foi lido, migrado ou apagado.**

---

# Revisão 2 — hierarquia do card e cache (2026-08-03)

## 1. Obras exibia o contratado como número principal

**Apontado pelo Codex.** Custos já mostrava "R$ 9.000,00 pendente · R$ 5.000,00 recebido",
mas o card de Obras mantinha **R$ 14.000,00 como valor grande**, com o pendente em letra
miúda. Mesma regra, leitura visual repetindo a confusão original.

**Correção — o número grande passou a ser o que FALTA receber:**

| Caso | Rótulo | Valor grande | Linha abaixo |
|---|---|---|---|
| **real 14k/5k** | Entrada pendente · PARCIAL | **R$ 9.000,00** | R$ 14.000,00 contratado · R$ 5.000,00 recebido |
| sem lançamento | Entrada pendente · PENDENTE | R$ 14.000,00 | R$ 14.000,00 contratado · R$ 0,00 recebido |
| quitada | Entrada · QUITADA | R$ 14.000,00 | R$ 14.000,00 contratado |
| excedente | Entrada · QUITADA | R$ 16.000,00 | R$ 14.000,00 contratado · R$ 2.000,00 acima |
| legado sem repasse | Entrada pendente · CONFERIR | R$ 14.000,00 | R$ 14.000,00 contratado · R$ 0,00 recebido |

Quando quitada, o número grande é o **recebido** (fica verde) — não faria sentido destacar
R$ 0,00 de pendente.

## 2. Cache dos scripts — verificado, NÃO é pendência de deploy

**Levantado pelo Codex:** os `?v=08020734` de `edr-v2-obras.js` e `edr-v2-custos.js` não
foram atualizados, com risco de o navegador servir JS antigo.

**Verificação do `deploy.sh`:**

```
linha 20:  sed -i -E "s/\.js(\?v=[0-9a-zA-Z]+)?\"/.js?v=$SHORT_V\"/g" "$f"
linha 22:  (idem para .css)
linha 35:  sed -i -E "s/const CACHE_NAME = 'edr-system-v[0-9]+';/...v$VERSION';/" sw.js
```

O `deploy.sh` **reescreve todos os `?v=` de `.js` em todos os HTMLs** e bumpa o
`CACHE_NAME` do SW. Testado com a tag do arquivo novo:

```
entrada:  <script src="js/edr-v2-entrada-cliente.js?v=08020734"></script>
saida:    <script src="js/edr-v2-entrada-cliente.js?v=TESTE123"></script>
```

O regex cobre o arquivo novo. **Não é preciso bumpar manualmente antes do deploy.**

**O risco que permanece** é outro: enquanto NÃO houver deploy, qualquer teste local em
navegador que já tenha o EDR em cache pode servir o JS antigo. Ao validar, usar
recarga forçada (Ctrl+Shift+R) ou aba anônima.

## 3. Estado

```
node tests/entrada-cliente.test.js   → 67 OK · 0 FALHA
node -c nos 3 arquivos               → OK
```

```
 M index.html                      (registra o script novo)
 M js/edr-v2-custos.js
 M js/edr-v2-obras.js
?? js/edr-v2-entrada-cliente.js
?? tests/entrada-cliente.test.js
?? docs/ENTRADA-CLIENTE.md
```

Nada commitado. Sem banco, SQL, RLS, push ou deploy.

**Não validado:** o card de Obras com a obra real na tela (os 5 casos acima foram
exercitados por script no shell local), celular, perfil não-admin.

---

# Publicação — 2026-08-03

Autorizada nominalmente pelo Duam ("EU DUAM TO AUTORIZANDO"), escopo Ordem 1:
somente a correção de Entrada do Cliente.

## 1. Pré-condições verificadas ANTES do deploy

```
branch: dev
HEAD:   22ee2e0 feat(diarias): chave PIX + nome completo no PDF da folha + admissao

git status --porcelain -uall:
 M index.html
 M js/edr-v2-custos.js
 M js/edr-v2-obras.js
?? docs/ENTRADA-CLIENTE.md
?? js/edr-v2-entrada-cliente.js
?? tests/entrada-cliente.test.js
```

Exatamente os 6 arquivos autorizados. **Nenhum arquivo extra** — verificado com
`-uall` porque `git status` resumia `tests/` como diretório, escondendo o conteúdo.

```
node tests/entrada-cliente.test.js    → RESULTADO ENTRADA: 67 OK · 0 FALHA
node -c js/edr-v2-entrada-cliente.js  → OK
node -c js/edr-v2-custos.js           → OK
node -c js/edr-v2-obras.js            → OK
git diff --check                      → vazio
```

## 2. Cache-busting e Service Worker — evidência lida do deploy.sh

```
linha 20:  sed -i -E "s/\.js(\?v=[0-9a-zA-Z]+)?\"/.js?v=$SHORT_V\"/g" "$f"   (todos os *.html)
linha 22:  idem para .css
linha 27:  node -e ... substitui const _VER em novo-cliente.html
linha 35:  sed -i -E "s/const CACHE_NAME = 'edr-system-v[0-9]+';/...v$VERSION';/" sw.js
linha 38:  git add -A          <- adiciona TUDO da árvore, não só o que eu selecionar
linha 41:  pre-deploy-check.sh (secrets / SQL destrutivo / RLS aberta)
linha 47:  git push; se branch = dev, checkout main + reset --hard dev + push --force-with-lease
```

`SHORT_V` = `date +%m%d%H%M`, `VERSION` = `date +%Y%m%d%H%M%S`.

**Nota sobre `git add -A` (linha 38):** o script comita a árvore inteira. Por isso a
verificação de escopo tem de acontecer **antes** de rodá-lo — um sétimo arquivo entraria
no commit sem aviso. Confirmado que só há os 6.

Estado imediatamente antes do deploy:

```
js/edr-v2-entrada-cliente.js?v=08020734
js/edr-v2-obras.js?v=08020734
js/edr-v2-custos.js?v=08020734
const CACHE_NAME = 'edr-system-v20260802073401';
```

## 3. Caso real validado visualmente

Obra **LUCIVANIA MACENA**, contrato de entrada R$ 14.000,00 com um repasse de
R$ 5.000,00 (tipo `entrada`, crédito em 30/05/2026):

| Módulo | Exibição confirmada em tela |
|---|---|
| **Custos** | selo `Entrada: R$ 9.000,00 pendente · R$ 5.000,00 recebido` |
| **Obras** | `ENTRADA PENDENTE · PARCIAL` · **R$ 9.000,00** · abaixo: `R$ 14.000,00 contratado · R$ 5.000,00 recebido` |

Agregados **inalterados** nas duas telas — sem dupla contagem:
Recebido R$ 5.000,00 · Falta R$ 135.613,02 (contrato) · Saldo a receber R$ 176.802,02.

**Somente o caso parcial foi validado com dado real.** Os demais (sem lançamento,
quitação exata, excedente, legado sem repasse, legado parcial) estão cobertos por
teste e foram exercitados por script no shell local — **não** foram vistos com obra
real em produção.
