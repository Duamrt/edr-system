# Ponte Claude ↔ Codex

> Fim do copiar e colar entre as duas janelas.
> Papéis continuam os de sempre: **Claude implementa** (`CLAUDE.md`), **Codex revisa read-only** (`AGENTS.md`).
> A ponte é só o transporte — ela não muda quem manda em quê.

## Instalação (uma vez por clone)

```bash
bash tools/ponte/instalar.sh
```

O script confere os dois CLIs, cria o `.mcp.json` local e faz um handshake de teste com o
servidor MCP do Codex. Depois disso, **reinicie o Claude Code** para ele carregar o MCP.

Pré-requisitos:

```bash
npm i -g @openai/codex          # Codex CLI
npm i -g @anthropic-ai/claude-code
```

## Os três caminhos

| Caminho | Quando usar | Como |
|---|---|---|
| **MCP** (Claude chama o Codex como ferramenta) | Uso normal, os dois na sua máquina | eu chamo a tool `codex` direto na conversa |
| **Script** (headless, gera arquivo de parecer) | Quando quer o parecer gravado como evidência, ou quando o MCP não subiu | `tools/ponte/revisar.sh` |
| **Repo** (assíncrono) | Claude rodando na web + Codex local | `--so-pedido` + commit |

Não precisa escolher na instalação — os três ficam disponíveis.

---

## Claude → Codex (revisão)

Dentro do Claude Code:

```
/revisar
/revisar RLS de notas fiscais
/revisar --escopo main..HEAD
```

O que acontece: monto o diff, empacoto com o contexto em `.ponte/pedidos/`, chamo o Codex em
`--sandbox read-only --ask-for-approval never`, e trago o parecer para dentro da conversa já
classificado por severidade. Sem trocar de janela.

Direto no terminal, se preferir:

```bash
tools/ponte/revisar.sh --foco "exclusão de NF"
```

Escopo, quando você não especifica: working tree se houver mudança não commitada; senão, o
último commit.

O parecer sai no formato fixo que o `revisar.sh` exige do Codex — veredito, achados **com prova
`arquivo:linha`**, suspeitas separadas dos achados, checagem dos contratos de `CLAUDE.md`/`AGENTS.md`,
e validação esperada. Achado sem prova é rebaixado para suspeita de propósito: sem isso a revisão
vira chute com cara de laudo.

## Codex → Claude (implementação)

```bash
tools/ponte/implementar.sh "corrigir o overflow do filtro-fornecedor em 390px"
```

Roda o Claude Code headless em `acceptEdits`: ele edita arquivo, mas **não commita e não deploya**.
Com `--commit` você libera commit local. Deploy fica sempre fora da ponte — `./deploy.sh` é seu, na mão.

## Ciclo fechado

```bash
tools/ponte/revisar.sh                      # Codex revisa
tools/ponte/implementar.sh --do-parecer     # Claude corrige o que o Codex achou
tools/ponte/revisar.sh                      # Codex confere a correção
```

`--do-parecer` sem argumento pega o parecer mais recente. Com argumento, pega o que você indicar.

O prompt do `--do-parecer` manda o Claude **discordar com prova** quando o revisor errar, em vez de
obedecer no automático. Revisor que não pode ser contestado transforma falso-positivo em regressão.

## Modo assíncrono (Claude na web)

Quando o Claude roda em container na nuvem, ele não enxerga o Codex da sua máquina. O transporte
vira o próprio repo:

```bash
# 1. Claude (web) gera e versiona o pedido
tools/ponte/revisar.sh --so-pedido
git add -f .ponte/pedidos/<ts>-pedido.md && git commit -m "revisão: pedido <ts>" && git push

# 2. Você, no Codex local
git pull
codex exec --sandbox read-only "revise .ponte/pedidos/<ts>-pedido.md conforme AGENTS.md"
# salve a saída em .ponte/pareceres/<ts>-parecer.md
git add -f .ponte/pareceres/<ts>-parecer.md && git commit -m "revisão: parecer <ts>" && git push

# 3. Claude (web)
git pull   # e me peça para aplicar o parecer
```

Mais lento, mas ainda é zero copy/paste — o texto viaja por commit, não pelo Ctrl+C.

---

## Segurança da ponte

- Codex roda **sempre** com `--sandbox read-only`: não edita, não deploya, não toca banco. O papel de
  `AGENTS.md` é reforçado pelo sandbox, não só pelo prompt.
- Claude roda com allowlist de ferramentas — `git add`/`git commit` só com `--commit` explícito, e
  `deploy.sh` fora da lista em qualquer caso.
- `.ponte/` é ignorado pelo git: diff de trabalho não vaza para o repo sem você mandar.
- `.mcp.json` continua no `.gitignore` (decisão antiga do projeto). O modelo versionado é
  `tools/ponte/mcp.exemplo.json`; o `instalar.sh` faz a cópia local.

## Quando algo falha

| Sintoma | Causa provável | Saída |
|---|---|---|
| `exit 127` no `revisar.sh` | Codex fora do PATH | `npm i -g @openai/codex`. O pedido fica gravado do mesmo jeito. |
| `exit 3` | diff vazio no escopo | passe `--escopo` |
| `exit 4` | Codex rodou e falhou | leia o `.log` ao lado do parecer em `.ponte/pareceres/` |
| Tool `codex` não aparece no Claude | `.mcp.json` não carregado | reinicie o Claude Code; confira com `/mcp` |
| Handshake falha no instalar | subcomando MCP diferente nesta versão do Codex | use o caminho por script; o `revisar.sh` não depende de MCP |
| `codex.cmd not found` no Git Bash | resolução de binário do Windows | os scripts já tentam `codex`, `codex.cmd` e `codex.exe` — se falhou, o CLI não está instalado para este shell |

## Limites conhecidos

- **Não testado ponta a ponta.** Foi escrito num container remoto sem Codex nem Claude CLI instalados;
  a validação aqui foi de sintaxe e do caminho `--so-pedido`. O primeiro `instalar.sh` na sua máquina é
  o teste real.
- O subcomando de servidor MCP do Codex já mudou de nome entre versões (`mcp-server` → `mcp`); o
  wrapper detecta, mas uma versão futura pode quebrar isso. O caminho por script é o plano B.
- Diff muito grande (milhares de linhas) estoura o contexto do revisor. Fatie com `--escopo`.
