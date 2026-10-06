# Chromium com Auth/RPC reais na QA local

**APROVADO: 1/1 E2E, 0 falhas, 0 skips, 3,61 segundos.** Registro em 06/10/2026 09:45 UTC. Playwright `1.62.1`; Chromium existente `147.0.7727.15`, headless com contexto novo, sem tocar a sessao do usuario.

O teste criou um tenant e uma identidade sintetica exclusivos para UI, distintos da matriz Auth anterior. GoTrue real criou a identidade e emitiu JWT por login local. O navegador consultou `/auth/v1/user` e `company_users` com esse JWT; `sbCurrentUser`, `usuarioAtual.perfil` e `_companyId` vieram desses retornos reais. Nenhum JWT foi fabricado e nenhum saldo/movimento/recibo foi simulado.

## Alcance da interface

Foi carregado o arquivo original `js/edr-v2-caixa-prospectivo.js` e o CSS original de `index.html`. O HTML de sustentacao foi servido pelo harness numa origem loopback; adaptadores `sbGet`/`sbRpcEstoque` enviaram HTTP verdadeiro para PostgREST/GoTrue da QA, exclusivamente `127.0.0.1:55321`. O SQL conferiu os saldos e a quantidade de movimentos persistidos por tenant.

O login visual, dashboard completo, refresh da sessao e boot integral do aplicativo **nao foram carregados**. A evidencia prova a tela Caixa, seus formularios e persistencia real sob sessao emitida pelo Auth. Complementa a [matriz Auth/RLS real](2026-10-06-auth-local-resultado.md) e os testes UI/regressoes gerais; nao substitui smoke autenticado autorizado no site publicado.

## Fluxos aprovados

| Fluxo | Resultado persistido e observado na tela |
| --- | --- |
| Abertura pela UI | Banco QA R$500 + dinheiro R$100 = R$600; saldo manual sintetico permaneceu igual. |
| Entrada e saida | +R$25 e -R$5 = R$620, confirmado por leitura RPC independente. |
| Transferencia R$40 | Banco R$480, dinheiro R$140, total R$620. |
| Pagamento parcial R$30 | Total R$590; obrigacao R$80 ficou com R$50 pendentes. |
| Duas ativacoes DOM consecutivas de Salvar | Entrada R$10 produziu um unico movimento, total R$600. |
| Cancelamento de transferencia | Registro preservado/cancelado; banco R$500 + dinheiro R$100, total R$600. |
| Resposta perdida apos commit real | REST confirmou entrada R$7 antes de o harness abortar entrega ao navegador; UI manteve confirmacao pendente. |
| Reload e reenvio do UUID pendente | Estado veio novamente do banco; R$607 e apenas um recibo/movimento dessa entrada. |
| Cancelamento da parcial | Obrigacao voltou a R$80 pendentes; total R$637, sem custo novo. |
| Cancelamento de formulario | Nenhum movimento/recibo novo. |
| Dia do corte sem hora | UI impediu envio sem classificacao; escolha incluido_abertura preservou R$637. |
| Tarifa separada R$1 | Banco R$536 + dinheiro R$100 = R$636. |
| Rejeicao real da RPC | Pagamento R$81 sobre restante R$80 foi rejeitado pelo banco; contagens e saldo permaneceram iguais. |
| Reload final e mobile 390px | Estado persistido R$636, obrigacoes R$80; sem overflow horizontal. |

Custos, estoque, folha fechada e saldo manual foram comparados antes/depois e permaneceram iguais. Screenshots desktop/mobile foram inspecionados visualmente; ambos legiveis, com paleta EDR e obrigacoes separadas do disponivel.

## Reproducao local

Usar a mesma stack QA saudavel/isolada e caminhos privados definidos no [protocolo](2026-10-06-auth-local-protocolo.md). Este E2E cria um tenant sintetico novo; nao reseta ou sobrescreve os existentes.

```powershell
$env:EDR_PLAYWRIGHT_PATH = '<playwright-ja-instalado>'
$env:EDR_CHROMIUM_PATH = '<chromium-ja-instalado>/chrome.exe'
$env:EDR_UI_AUTH_EVIDENCE_DIR = '<task-3>/evidencias/caixa-ui-real'
# Sem DEBUG/PWDEBUG/NODE_DEBUG: nao capturar argumentos privados.
node --test tests/caixa-prospectivo-ui-auth-local.test.js
```

Artefatos brutos ficam fora do repositorio em `task-3/evidencias/caixa-ui-real`. O log foi examinado contra padroes de JWT/chaves antes desta evidencia; nenhum segredo foi registrado. Nenhuma requisicao saiu das rotas locais autorizadas. Nenhum produto, Docker, remoto ou dado real foi alterado por este E2E.

## SHA-256

| Artefato | SHA-256 |
| --- | --- |
| `tests/caixa-prospectivo-ui-auth-local.test.js` | `9a470b81e0111b41a3aeeb59c1949ff527a87eb10698571b159f08c24937805a` |
| `ensaio-ui-real.log` (externo) | `41aef298763e45d5c486ad2811c6a3b923955078d618e799997328460cf6f840` |
| `2026-10-06-ui-auth-real-desktop.png` (externo) | `15657d00cb50eec5a66dc898145bfed56e8c2708f2c6bbed7b7193962291b3ca` |
| `2026-10-06-ui-auth-real-mobile.png` (externo) | `5cedc487beb12bd9d6f523656b503b1df697aa057a89a65a53f799afd285b2d6` |
