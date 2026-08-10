#!/usr/bin/env bash
# implementar.sh — sentido Codex -> Claude.
#
# Manda uma tarefa para o Claude Code em modo headless. Duas formas de uso:
#
#   tools/ponte/implementar.sh "corrigir o filtro de fornecedor em 390px"
#   tools/ponte/implementar.sh --do-parecer            # aplica o último parecer do Codex
#   tools/ponte/implementar.sh --do-parecer .ponte/pareceres/2026...-parecer.md
#
# Por padrão o Claude só edita arquivo (acceptEdits) — não commita, não deploya.
# Use --commit para permitir commit local (deploy continua fora, sempre manual).

set -uo pipefail
# shellcheck source=_comum.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

TAREFA=""
PARECER=""
PERMITIR_COMMIT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --do-parecer)
      if [ -n "${2:-}" ] && [ "${2:0:2}" != "--" ]; then
        PARECER="$2"; shift 2
      else
        PARECER="$(ls -1t "$PONTE_PARECERES"/*-parecer.md 2>/dev/null | head -1)"
        shift
      fi
      ;;
    --commit)  PERMITIR_COMMIT=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *)         TAREFA="${TAREFA:+$TAREFA }$1"; shift ;;
  esac
done

CLAUDE="$(ponte_bin_claude)" || {
  _erro "Claude Code não encontrado no PATH. Instale: npm i -g @anthropic-ai/claude-code"
  exit 127
}

if [ -n "$PARECER" ]; then
  [ -f "$PARECER" ] || { _erro "parecer não encontrado: $PARECER"; exit 3; }
  _info "aplicando parecer: ${PARECER#"$PONTE_RAIZ"/}"
  PROMPT="Leia \`${PARECER#"$PONTE_RAIZ"/}\` — é o parecer do Codex (revisor read-only) sobre o código que você acabou de escrever.

Trate cada achado assim:
- CRÍTICO e ALTO: corrigir, com o menor diff possível. Não misturar refactor com bugfix.
- MÉDIO e BAIXO: corrigir se for barato e seguro; caso contrário, listar como pendência com justificativa.
- Suspeitas sem prova: investigar e responder com prova (arquivo:linha), não corrigir no escuro.
- Discordância legítima: não obedeça no automático. Se o revisor errou, explique com prova por que o código está certo.

Respeite os contratos de CLAUDE.md e AGENTS.md. Ao final, resuma: o que corrigiu, o que recusou e por quê, o que ficou pendente."
elif [ -n "$TAREFA" ]; then
  PROMPT="$TAREFA"
else
  _erro "informe uma tarefa ou use --do-parecer."
  exit 2
fi

MODO="acceptEdits"
FERRAMENTAS="Read,Edit,Write,Glob,Grep,Bash(git diff:*),Bash(git status:*),Bash(git log:*),Bash(npx serve:*),Bash(rg:*)"
if [ "$PERMITIR_COMMIT" -eq 1 ]; then
  FERRAMENTAS="$FERRAMENTAS,Bash(git add:*),Bash(git commit:*)"
fi

_info "chamando o Claude Code (modo $MODO, sem deploy)…"
cd "$PONTE_RAIZ" || exit 1
exec "$CLAUDE" -p "$PROMPT" \
  --permission-mode "$MODO" \
  --allowedTools "$FERRAMENTAS"
