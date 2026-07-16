# EDR — Execução Ativa

> Fonte de verdade da **execução**. Substitui a fila em `Downloads`.
> Matriz (`~/Downloads/AUDITORIA-MOBILE-EDR-matriz-mestra.md`) fica **congelada** — só evidência de origem, não é relida nem alterada durante implementação.

## Regras
- Uma tarefa ativa por vez.
- Matriz não é relida nem alterada durante implementação.
- `status de código` e `resultado runtime` permanecem separados.
- Todo deploy fecha antes de abrir a próxima tarefa.
- Claude recebe **só o card ativo**, nunca a matriz inteira. Retorna: arquivos lidos · micro-diff · validação · novo status.
- O documento não narra histórico — guarda estado atual + evidência curta. Card fechado = arquivado em 3 linhas.

## Gates
| ID | Bloqueio | Próxima ação | Estado |
|---|---|---|---|
| GATE-DEPLOY-01 | Contrato de cache do `deploy.sh` | **Este DRE: PROVADO** (ref `index.html:3110` coberta pelo `sed` + SW bumpado pelo script). Contradição GLOBAL = tarefa doc separada | 🟢 não bloqueia este deploy |
| GATE-DRE-DEPLOY | Aceite geometria (6vp×2modos) + não-regressão | **aceite verde + não-regressão empírica**; suíte baseline-red c/ **exceção documentada do Duam** | 🟢 falta SÓ o "vai" |

**Evidência GATE-DEPLOY-01 (aguarda confirmação do Duam p/ FECHAR):** `deploy.sh:18-23` (`sed` bumpa `?v=` JS/CSS em `*.html` raiz) · `deploy.sh:35` (`sed` bumpa `CACHE_NAME` em `sw.js`) · `sw.js:3 = edr-system-v20260714112840` · ref real `index.html:3070 = js/edr-v2-infra.js?v=07141128"` · `AGENTS.md:34` **concorda** (sem contradição) · `?v=07141128` e `CACHE_NAME v20260714112840` são do MESMO deploy (14/07 11:28) → automação rodou. **Exceção:** `sed` só pega `.js"`/`.css"` (aspas duplas) em `*.html` da raiz; aspas simples/subpasta/injetado escapam.

## Fila
| ID | Prio | Achado | Estado | Evidência |
|---|---|---|---|---|
| SEC-01 | P0 | RPC `get_obra_publica` executável por `anon` **e** `authenticated`, sem autz/tenant no corpo | ⏸ aguarda "vai" (DDL prod) | ACL `{=X, anon=X, authenticated=X, service_role=X}` + corpo só casa `slug_entrega` |
| MOB-01A | P1 | DRE `.dre-obra` reflow | ✅ **validado** (bateria DRE 6vp × Obras/Cascata) | pageOverflow=false em todos; sem clip; desktop ok |
| MOB-01B | P1 | DRE KPI `.dre-kpis` single-col <380 | ✅ **validado** (bateria DRE 6vp × Obras/Cascata) | 360/380 1-col limpo; 381/390 2-col (kpisOverflow pré-existente, sem page overflow) |
| MOB-02 | P1 | Orçamento overflow de página em 390 | 🟢 pronto (gate fechado) | `docScrollW=424 > 390` |
| MOB-03 | P1 | Adicionais overflow em 390 (faixa `.stat-mini`) | 🟢 pronto (gate fechado) | `docScrollW=429 > 390` |
| SUITE-FIX-01 | P2 | Atualizar 5 testes stale (cronograma CR2-4 Gantt desativado; raiox RX1-2 pós-`RX5a`) | 🔵 tarefa separada — NÃO bloqueia DRE | baseline `4e3647a` = mesmos 5 falham |

## Tarefa Ativa
**Módulo DRE — VALIDADO localmente (MOB-01A + MOB-01B). Aguarda go de deploy do Duam.**
- **Bateria `360·380·381·390·430·1200` × Obras+Cascata:** `pageOverflow=false` nos **12 combos**; `.dre-obra` e Cascata sem clip (`casClipByCard=false`, `cellsBeyondCard=0`); KPIs/header/nome/`.vv`/`.mg` visíveis; maior KPI "R$ 1.095.966,01" cabe em todos. Desktop 1200 sem regressão (grid `1fr 310px`, `.dre-obra` cols originais, KPI 4-col).
- **Fronteira 380/381:** 380 KPI 1-col limpo; 381 volta a 2-col com `kpisOverflow` (folga no container ~13px, **sem page overflow**) — idêntico ao 390 pré-existente; **não quebra o aceite**.
- **Console:** só `_checkResponsive` (RISK-RESIZE-01) + `_entrarNoApp` (auth init, pré-existente). **Zero** erro de `edr-v2-dre.js`. Patch é CSS+classe → não adiciona runtime error.
- **Deploy:** cache do arquivo OK (`index.html:3110 = edr-v2-dre.js?v=…"` → `sed` do deploy pega). Falta: **go do Duam** + reconciliar GATE-DEPLOY-01. Reauditoria matriz `dre.1/2/8` ao fechar.

## Registro de Validação
| rota | vp | caso | status código | geometria/runtime | pendente físico | evidência | decisão |
|---|---|---|---|---|---|---|---|
| DRE/Obras | 390/360/430 | reflow `.dre-obra` (patch local) | T! | passou geometria (dre-obra); rota bloqueada por KPI 360 | toque/legibilidade físico | medições localhost | reflow de Obras validado; aceite da rota bloqueado por KPI independente |
| DRE/Obras+Cascata | 360·380·381·390·430·1200 | módulo DRE (MOB-01A+B, patch local) | T!/novo | passou: pageOverflow=false 12/12; sem clip; console sem erro do patch | toque/legibilidade físico | medições localhost | módulo DRE validado; deploy aguarda go do Duam |

## Riscos abertos
- **RISK-RESIZE-01:** rastrear SÓ onde `_checkResponsive` é registrado e qual alvo pode ser `null`. Classificar após ler a cadeia. **NÃO** atribuir ao patch DRE, **NÃO** corrigir junto. (erros `null.style` vistos em resize de medição; `resize` real ocorre também em rotação/mudança de viewport — cedo pra chamar de "sintético/não-bug".)
- **RISK-AUTH-INIT-01:** `_entrarNoApp` (`edr-v2-auth.js:75`) `null.style` no init do app — **pré-existente, NÃO do patch DRE**. Rastrear separado; não corrigir junto.
- **SUITE-EDR (2026-07-16):** `npm run test:edr` vs localhost:5050 patchado = **74/79 passou**. 5 falhas **pré-existentes, NÃO do patch DRE**: cronograma CR2/CR3/CR4 (`#cron-vm-lista`/`#cron-vm-gantt` — Gantt desativado `8b3f09b`, teste desatualizado) · raiox RX1/RX2 (título/popup — drift teste×app). Prova: **DRE1/DRE2 passaram** + `git diff` só `.dre-*`. **Baseline (worktree limpo, HEAD `4e3647a`) CONFIRMOU empiricamente: os mesmos 5 caem sem o patch (4 passed / 5 failed, 1.4m) → não-regressão.** Mas gate de suíte = **baseline-red, NÃO verde**. **EXCEÇÃO CONCEDIDA pelo Duam (2026-07-16):** deploy do DRE liberado apesar da suíte baseline-red — `CR2/CR3/CR4` (cronograma, Gantt desativado) + `RX1/RX2` (raiox, pós-`RX5a`) provados **pré-existentes no baseline `4e3647a`** (não-regressão). Atualizar os 5 = **SUITE-FIX-01** (tarefa separada, não bloqueia).

## Decisões Pendentes
- **DRE-DEPLOY:** (1) exceção de suíte **CONCEDIDA** (SUITE-FIX-01 separado); (2) doc em **commit separado** (deploy pega só `edr-v2-dre.js`); (3) GATE-DEPLOY-01 **provado p/ este deploy**; (4) **FALTA SÓ o "vai" explícito** → `./deploy.sh "fix(dre): reflow .dre-obra + KPIs 1-col <380 no mobile"`. **Nenhum deploy automático.**
- **SEC-01:** aprovar ou não a contenção `REVOKE EXECUTE ON FUNCTION public.get_obra_publica(text) FROM PUBLIC, anon, authenticated;` (mantém `service_role`/`postgres`). Validação: `has_function_privilege` (anon=false, authenticated=false, service_role=true) + 2× HTTP `/rpc/` com UUID aleatório (anon sem `Authorization`; auth JWT `role=authenticated`) → não-2xx + sem dado + priv. insuficiente.
- **Destino de `acompanhar.html`** após a contenção: remover × reconstruir com token aleatório + colunas mínimas.
