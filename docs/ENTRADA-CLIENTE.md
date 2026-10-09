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

## 4. Deploy executado — evidência

```
./deploy.sh "fix(custos/obras): entrada do cliente mostra pendente e recebido — repasses sao a fonte de verdade"

[dev d6e64a1] ... 18 files changed, 677 insertions(+), 51 deletions(-)
 create mode 100644 docs/ENTRADA-CLIENTE.md
 create mode 100644 js/edr-v2-entrada-cliente.js
 create mode 100644 tests/entrada-cliente.test.js

To https://github.com/Duamrt/edr-system.git
   22ee2e0..d6e64a1  dev  -> dev
   22ee2e0..d6e64a1  main -> main

=== Deploy concluido! ===
Versao: 08031552
Cache SW: edr-system-v20260803155231
```

**Por que 18 arquivos:** `6 autorizados + 11 HTMLs adicionais + sw.js = 18`.
`index.html` está nos dois grupos — é um dos 6 autorizados **e** foi reescrito pelo
cache-busting —, por isso não se somam 6 + 12. Os 11 HTMLs adicionais tiveram apenas o
`?v=` trocado (2 linhas cada), confirmado no `git show --stat` com `| 2 +-`:
`acompanhar`, `agenda-iannaline`, `agenda`, `landing`, `meu-plano`, `novo-cliente`,
`preview-polimento`, `produto`, `relatorio-obra`, `termo-entrega`, `tracker`.

### Cache-busting aplicado

```
antes:  js/edr-v2-{entrada-cliente,custos,obras}.js?v=08020734
depois: js/edr-v2-{entrada-cliente,custos,obras}.js?v=08031552

sw.js antes:  const CACHE_NAME = 'edr-system-v20260802073401';
sw.js depois: const CACHE_NAME = 'edr-system-v20260803155231';
```

### Verificação em produção — https://sistema.edreng.com.br

```
index.html                    HTTP 200
js/edr-v2-entrada-cliente.js  HTTP 200
js/edr-v2-custos.js           HTTP 200
js/edr-v2-obras.js            HTTP 200
```

O JS novo deu **404 na primeira tentativa** (propagação do GitHub Pages) e passou a 200 na
verificação seguinte. Conteúdo conferido contra o local: **idêntico** — a diferença de
125 bytes é apenas CRLF (local) vs LF (servidor), confirmada por
`diff <(tr -d '\r' local) <(tr -d '\r' producao)` → sem diferenças.

### Alcance do que foi provado em produção

**Artefato publicado e motor exercitado** — não fluxo produtivo validado.

O que está provado: os arquivos respondem 200, o conteúdo servido é idêntico ao local, e
a função pura, carregada da URL `.../edr-v2-entrada-cliente.js?v=08031552`, devolve o
resultado esperado para uma entrada **sintética** digitada no console:

```
calcular({contrato_entrada: 14000}, [{valor: 5000, tipo: 'entrada'}])
  → "Entrada: R$ 9.000,00 pendente · R$ 5.000,00 recebido"
```

O que **não** está provado: as telas de Custos e Obras renderizando com **dado produtivo**.
Isso exigiria abrir a obra logado em produção — não foi feito. A validação com dado real
(LUCIVANIA MACENA) ocorreu **no ambiente local**, antes do deploy.

## 5. O que NÃO foi validado em produção

- **A UI de Custos e Obras com dado produtivo.** Em produção só foram exercitados os
  artefatos (HTTP 200 + conteúdo idêntico) e o motor com dados sintéticos no console.
- Apenas o **caso parcial** foi conferido com dado real, e **localmente**
  (LUCIVANIA MACENA), antes do deploy.
- Sem lançamento, quitação exata, excedente, legado sem repasse e legado parcial:
  cobertos por teste, **não** observados com obra real.
- Celular, perfil não-admin.
- **Obras com `entrada_paga = true` e sem repasse passarão a exibir "CONFERIR" em
  vermelho.** É o comportamento correto pela regra, mas o volume não foi medido —
  nenhuma consulta ao banco foi feita.

---

# Plano de pagamento da entrada — integração v6 (08/10/2026)

## Fonte e estado da retomada

A prévia aprovada foi recuperada pelo fluxo oficial do Sites, sem alteração ou publicação da prévia: projeto `appgprj_6ac3f96303f081918916ebe011d0e5f2`, versão 6, commit `79e4ffe85b8affdffae76fcee3cadd39299c8b1f`. Esse SHA é da prévia, não do EDR publicado. O pedido atual autoriza a integração isolada, testes, documentação e publicação pelo processo do projeto, preservando os trabalhos locais.

O checkout canônico `C:\Users\Duam Rodrigues\edr-system` estava em `dev`, SHA `74f33d0`, com alterações locais. O remoto estava em `235d371`, incluindo Caixa prospectivo e Visão Financeira. A implementação usa worktree separado `C:\Users\Duam Rodrigues\edr-system-plano-entrada-v6-20261008`, branch `codex/plano-entrada-v6-atual-20261008`, a partir desse remoto. O checkout canônico não foi substituído nem limpo.

O bloqueio de segurança da tarefa anterior é histórico. Nesta retomada, a recuperação oficial da fonte e as operações locais necessárias foram permitidas. Erros de acesso do sandbox, resolução de rede e SQL não devem ser registrados como uma nova recusa de segurança. Uma nova rejeição explícita de revisão automática exige interromper a ação e registrar o resultado concreto; não autoriza trocar de rota para repetir a ação rejeitada.

## Regras de valores e governança

- `obras.contrato_entrada` e `obras.valor_venda` conservam os valores originais. O plano guarda o original; a carteira derivada acrescenta somente `total aprovado líquido − original` à venda original. Cancelamento de acréscimo não fabrica receita, despesa ou movimento.
- Resumo, panorama e relatório de Custos aplicam essa mesma carteira derivada. A revisão encontrou os três pontos ainda usando só a venda original; foram corrigidos e ganharam regressão. A aba CEF de Obras também consulta o ledger corrente e a mesma projeção aprovada, sem manter obra/identidade capturadas antes da espera. Com entrada original 100, acordo 115 e cancelamento 5, o ajuste é 10 (final 110), sem subtrair cancelamento novamente. Contrato CEF e venda permanecem apresentados como originais. Falha de leitura dos repasses não é recebido zero; saldo fica indisponível. A recarga do detalhe usa o render existente e confere identidade/revisão da leitura.
- Cada parcela tem original, modo exclusivo (`waived`, `percent` ou `final`), acréscimo, final vigente, recebido e saldo. Percentual é aplicado uma vez; valor final negociado não recebe percentual adicional.
- 15% é sugestão editável somente quando vencimento e entrega estiverem definidos e o vencimento for posterior à entrega. Não há juros mensais ou compostos.
- Elyda solicita mudanças e estornos; Duam aprova ou rejeita. O servidor usa os Auth UIDs configurados para a empresa e verifica vínculo atual ativo, sem confiar em nome ou botão. A configuração não cria usuários, não muda papéis e não amplia permissões legadas.
- Solicitações exigem motivo. Antes/depois, solicitante, aprovador e data/hora ficam auditados. Uma solicitação não modifica parcelas vigentes; pagamento ou outra alteração invalida aprovação de proposta obsoleta. Rejeição preserva o acordo vigente.
- Duam e Elyda, enquanto administradores ativos configurados, podem registrar dinheiro efetivamente recebido. Operadores sem essa atribuição não ganham essa permissão pelo novo módulo.
- A previsão financeira de entrega fica exclusivamente em `entrada_planos.delivery`. `obras.data_entrega` continua sendo a data real do Termo: aprovar o plano não a preenche nem impede concluir/reimprimir a obra. Uma mudança do contrato cadastrado durante a proposta inicial impede aprovar o snapshot obsoleto; rejeitar a proposta e solicitar novamente permite conferir o original atual sem apagar a trilha.
- Vencimentos/entrega indefinidos ficam sem data. Aprovar o plano internamente não é evidência de aceite da cliente. Não importar exemplos da prévia como operação real.

A revisão final reproduziu uma exposição no replay: o snapshot durável podia conter contas do Caixa e era devolvido antes de conferir o papel/responsável atual. O patch aditivo `sql/entrada-plano-revalidar-replay.sql`, SHA-256 `D0F0CF1570D2D654A4FBD37E0239D338B3A4F4FBAF4C59C789F30B73660199E4`, restringe SELECT ao autor ainda administrador ativo e revalida papel, atribuição e tipo depois da espera nos locks, antes de devolver o UUID antigo. A leitura de permissões também exige admin para solicitar. Não altera operações, snapshots, contratos, recibos ou saldos. Configuração trocada revoga a ação; administrador ainda ativo pode ler seu histórico próprio. Testes de downgrade/desativação/troca de responsável e concorrência conferem a recusa sem duplicar dinheiro.

## Recebimentos, antecipação e estorno

O dinheiro recebido continua vindo exclusivamente dos repasses reais do tipo `entrada`. Vincular um repasse existente usa seu ID e não cria outro repasse nem movimento de Caixa. Antes de receber dinheiro novo, os repasses de entrada existentes precisam estar conciliados nas parcelas; a tela deve informar qualquer falta de vínculo. A posição agregada desconta o ledger uma única vez.

Leitura de produção em 09/10 confirmou nenhuma conta/abertura do Caixa para a EDR. Não criar abertura zero ou saldo por dedução. Recebimento novo e estorno com saída real exigem abertura confirmada de Banco/Dinheiro, corte e valores fornecidos pelo Duam; vincular o repasse antigo permanece independente dessa abertura. A publicação do plano não comprova que o Caixa foi configurado.

Um novo recebimento confirmado gera, na mesma transação, um evento imutável do plano, um repasse e um movimento identificado no Caixa prospectivo. A conta Banco/Dinheiro, data efetiva, horário conhecido e posição em relação ao marco seguem as regras do Caixa. Clique duplo/reenvio usa o mesmo UUID e payload; reutilizar UUID com dados ou pessoa diferentes é recusado. Um novo UUID para o mesmo comprovante não é deduplicação automática: em resposta incerta, recuperar o pedido original antes de iniciar outro.

Antecipação estritamente antes da entrega definida recebe principal e cancela o acréscimo proporcional ainda aberto. Em R$ 7.000 + R$ 1.050, receber R$ 3.500 antes da entrega cancela R$ 525: restam R$ 3.500 de principal e R$ 525 de acréscimo. O cancelamento não integra dinheiro recebido. No dia da entrega, depois dela ou com entrega indefinida, não existe cancelamento automático. A proporção acumulada conserva centavos em várias parciais; a última parcela de principal cancela o restante elegível.

Estorno parcial/total depende de solicitação e aprovação. Preserva o recebimento original e cria eventos inversos rastreáveis, com saída real do Caixa e repasse negativo correspondente. Principal, acréscimo recebido e cancelamento anterior são recompostos proporcionalmente. Não excluir/editar silenciosamente recebimentos, repasses ou movimentos vinculados por rotas legadas.

## Larissa e cimento

A leitura real confirmou na retomada: entrada original de R$ 46.216,58, um repasse de R$ 5.000 em 04/09/2026, `entrada_paga = false` e entrega sem data. Esses registros são preservados. O exemplo de R$ 48.316,58 e saldo de R$ 43.316,58 é uma proposta para conferência, não um plano criado automaticamente. Os anos/dias de maio, outubro/dezembro e entrega permanecem sem confirmação.

Não reaplicar ajustes de cimento. A referência local no checkout canônico é `docs/incidentes/ESTOQUE-CIMENTO-CONTAGEM-2026-10-08.md`, ainda não versionada; a contagem/retificação auditadas e os trabalhos de estoque permanecem fora deste release.

## Avisos: dados preparados, automação pendente

Os dados de leitura identificam parcela, obra, empresa, revisão vigente, vencimento e saldo. Aviso elegível considera somente plano aprovado, data completa, saldo positivo e vencimento três dias após a referência. Quitação, substituição ou renegociação aprovada deve atualizar a fonte. Falta de conciliação dos recebimentos antigos deve ser resolvida antes de publicar previsão por parcela.

A futura rotina precisa confirmar fonte acessível, horário/fuso, destino neste chat e registro durável de avisos emitidos. A chave lógica da parcela/vencimento, com revisão separada, deve impedir repetição e permitir substituir o aviso obsoleto. A criação/teste da rotina e a verificação de sua existência são etapas próprias. **Não há automação ativa nesta entrega; não há cobrança enviada a clientes.**

## Migração e implantação

`sql/entrada-plano-DRAFT.sql` contém a DDL aditiva, tabelas com RLS, RPCs autenticadas, histórico/recibos imutáveis e guardas específicas para obra, repasse e Caixa vinculados. Não contém seed de Larissa, datas demonstrativas, saldo de abertura ou identidades reais. A configuração de responsáveis é uma etapa separada e conferível em `sql/entrada-plano-responsaveis-EDR-DRAFT.sql`, usando os Auth UIDs atuais da Elyda e do Duam na empresa EDR. Revalida vínculos ativos/admin na transação e recusa configuração divergente. Não cria identidade nem modifica papel.

Hashes SHA-256 revisados: estrutura `3751522F2989884E579591F8E52A424E6E7E364E0E5C3A4C92B750E140B2DF80`; configuração EDR `990204A59C4350C65C20FE9A31C9EF3BEAB3F55073B5DE6CE9042D1838A91706`. Alteração posterior exige nova revisão e hash.

Antes de aplicar: concluir ensaios SQL/concorrência/UI e revisão de permissões; conferir schema real, owners, grants, triggers e backup disponível; registrar hash exato da migração e configuração. Não mudar helpers/grants legados para fazer testes passarem. A aplicação e configuração reais devem constar do registro de execução, com leitura posterior que confirme resultado. Existência de arquivo SQL não prova aplicação.

Publicar em checkout limpo atualizado, com arquivos explícitos da integração e diff revisado. O fluxo permanece `dev` → `deploy.sh` → fast-forward de `main`, sem push manual alternativo, `SKIP_CHECK`, reset ou force push. O script atual exige commit funcional antes de cache/deploy. Confirmar Pages, conteúdo servido, versão curta e build/SW após propagação. HTTP 200 não comprova login/persistência; smoke autenticado de produção é somente leitura, sem pagamento de teste, abertura ou alteração financeira real. Não abrir Agenda operacional para testar esta integração.

## Recuperação que preserva operações

O rollback DRAFT do banco só pode ser considerado com todas as tabelas novas vazias, inclusive configuração, após adquirir locks `NOWAIT` nas tabelas novas e nas tabelas legadas guardadas e verificar ausência de dados na mesma transação. Ocupação recebe `55P03` e aborta antes de qualquer DROP, sem desconectar usuário nem deixar DDL parcial. As RPCs consultam operações antes de travar obra/configuração para impedir ordem inversa com a recuperação. Seu teste local não autoriza executá-lo em produção. Depois de qualquer configuração/proposta/recebimento, conservar tabelas, auditoria, UUIDs, vínculos e snapshots; corrigir para frente. Não executar DROP/TRUNCATE, excluir trilha ou restaurar backup global apagando operações posteriores.

Antes da migração, conservar esquema/owners/grants/triggers e confirmar backup/procedimento oficial. Depois do uso, preservar também o estado corrente consistente de planos, parcelas, propostas, histórico, operações, recebimentos, repasses e movimentos/contas do Caixa. Dumps e credenciais privadas não pertencem ao repositório publicado. Ensaio de recuperação sintética local não prova restauração física/PITR de produção.

Para contingência do aplicativo, não voltar cegamente a uma UI antiga que desconhece vínculos e permite registrar/excluir entradas avulsas. Preparar patch compatível que suspenda novas mutações do plano, conserve leitura, histórico, guardas e saldo persistido. Publicar pelo mesmo fluxo autorizado e conferir cache/build; abas antigas podem permanecer abertas/offline. Preservar as guardas do banco. Registrar SHA funcional e SHA de cache; reverter apenas HEAD do cache não remove a funcionalidade.

## Registro atual de validação

| Etapa | Resultado confirmado |
| --- | --- |
| Recuperação da fonte | V6/commit conferidos; prévia não alterada/publicada |
| Cálculo local | 10 testes passaram (incluídos nos 323 abaixo), zero falhas/ignorados; inclui comparação com fonte v6, antecipação/estornos parciais acumulados e datas indefinidas |
| Integração/regressão | 323 testes passaram, zero falhas/ignorados: cálculo com comparação v6, projeções, entrada legada e regressões financeiras/DRE |
| Interface local | 32 testes passaram, zero falhas/ignorados: 18 controllers/render e 14 Chromium, desktop/390/320 px; mais 3 ensaios das projeções no Caixa. Inclui bloqueio sem abertura do Caixa e tradução dos tipos reais do histórico |
| Custos derivado | 14 testes passaram, zero falhas/ignorados; resumo/panorama/relatório usam venda original + ajuste líquido aprovado, incluindo adicionais/recebimentos uma vez. Fonte de repasses falha fica desconhecida; vazio confirmado representa zero. Troca de ator/perfil/empresa/token e leitura antiga não publicam estado anterior |
| Banco/concorrência | 37 casos finais passaram, zero falhas/ignorados: 25 SQL PGlite e 12 PostgreSQL 17 com conexões distintas. Inclui rebaixamento durante espera no lock, replay autorizado sem dinheiro duplicado, original obsoleto, entrega real independente, rollback ocupado e dump/restauração sintéticos. Uma conexão de teste encerrada após erro esperado foi corrigida no harness; os 12 PG foram repetidos, sem repetir os 25 SQL válidos |
| Obras/CEF e transporte | 17/17 casos locais e 1/1 Chromium relacionado passaram; carteira vigente líquida, troca de identidade/obra e consultas concorrentes; sbGet/sbGetAll e fetch reais locais recusam HTTP 200 com objeto e falha após página válida, sem saldo parcial confirmado. O fallback legado sem modo estrito foi preservado |
| Auth real local | 16/16 HTTP (15 casos mais agrupador) e 9/9 UI (8 casos mais agrupador) passaram em 09/10/2026 sobre as fontes finais, zero falhas/ignorados; GoTrue/PostgREST e PostgreSQL 17.6 reais, somente 127.0.0.1. Inclui Elyda solicita, Duam aprova, parcial/estorno proporcional, clique duplo/replay, revisão concorrente, RLS/tenant e terceiro negado. Tela geral de login e produção não testadas |
| Migração/configuração de produção | Aplicadas em 09/10/2026: entrada_plano_v6 20261009121823; responsáveis EDR conferidos às 12:19:14 UTC; 19 gates SQL verdes, seis tabelas operacionais vazias e 13 fingerprints legados preservados |
| Commit/publicação/smoke real | Ainda não executados |
| Automação de avisos | Não criada/ativa |

Comando do cálculo: `EDR_PREVIA_V6` aponta para a fonte recuperada fora do repositório, seguido de `node --test tests/entrada-plano-calc.test.js`. Sem essa referência, somente o caso comparativo é explicitamente ignorado; isso não deve ser apresentado como comparação executada.

Homologação Auth de 09/10: stack local dedicada `edr-entrada-qa-20261008`, PostgreSQL 17.6, API `127.0.0.1:55421` e banco `127.0.0.1:55422`; usuários/fixtures preservados fora da produção. A CLI 2.117 publicou inicialmente DB/Kong em `0.0.0.0`; antes de criar identidades, somente esses dois containers QA foram recriados pela API oficial Docker com `HostIp=127.0.0.1`, preservando imagens, configuração, arquivos Kong e volumes. Rede/firewall/daemon globais e outras stacks não foram alterados. Não reiniciar essa QA por `supabase start` sem reconferir os bindings e a escuta efetiva; nenhum segredo ou backup privado pertence ao Git. Os testes Auth usam os preparadores em `tests/fixtures/entrada-plano-auth-local-*` e recusam destino fora da QA marcada.

### Aceite e aplicação real — 09/10/2026

Duam aceitou visualmente Entrada e Custos nesta conversa antes do commit: "ACEITO. PODE PROSSEGUIR". O aceite cobre a apresentação conferida com dados de TESTE; não representa teste de pagamento real ou aceitação do acordo pela cliente.

A migração estrutural foi aplicada pelo conector oficial como `entrada_plano_v6`, versão `20261009121823`, com o hash revisado acima. A configuração separada foi aplicada por owner às `2026-10-09 12:19:14.01147 UTC`; um erro de transporte inicial foi seguido de SELECT vazio e repetição idempotente do mesmo SQL. Nenhuma rejeição de segurança ocorreu nessa aplicação. Leitura posterior às `12:19:24 UTC`: 19 condições verdadeiras, RLS/ACLs/owners/triggers/RPCs conferidos, apenas uma configuração EDR e seis tabelas operacionais vazias. Todos os 13 fingerprints legados permaneceram iguais; Larissa conserva original R$ 46.216,58, repasse R$ 5.000 e entrega sem data. Não houve plano, parcela, recebimento ou abertura fictícios em produção.

O advisor apontou somente controles intencionais nos objetos novos: [configuração privada com RLS sem policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), sem grants aos clientes, e [quatro RPCs definer executáveis por autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), com identidade ativa/tenant/papel conferidos internamente, search_path fixo e helpers privados sem EXECUTE público. Não abrir grants para silenciar avisos. Alertas sobre objetos legados não foram alterados neste escopo.

Patch aditivo aplicado pelo conector oficial como `entrada_plano_revalidar_replay`, versão `20261009124446`, após os ensaios finais. Leitura posterior confirmou os mesmos 19 gates verdes e 13 fingerprints legados preservados, seis tabelas operacionais vazias e corpos das funções iguais aos ensaiados: estado `d477b8c3110466c216ec2b086d1cc4f5`, operar `397d340e8c127361d49ccdad954dc7ae`. Policy de operações exige autor/tenant/admin ativo. Nenhuma operação financeira foi criada.

Recuperação após configuração: não usar o rollback de tabelas vazias, pois a configuração real já existe. Conservar schema, trilha e vínculos; eventual correção é para frente e a contingência de UI deve ser compatível com as guardas. Publicação e smoke autenticado ainda pendentes nesta etapa.