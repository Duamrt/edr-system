#!/usr/bin/env bash
# codex-mcp.sh — sobe o Codex CLI como servidor MCP (stdio) para o Claude Code.
# Referenciado por .mcp.json. O wrapper existe porque o nome do subcomando
# ("mcp" vs "mcp-server") varia entre versões do Codex CLI.

set -uo pipefail
# shellcheck source=_comum.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

CODEX="$(ponte_bin_codex)" || {
  _erro "Codex CLI não encontrado no PATH."
  _erro "Instale com: npm i -g @openai/codex   (ou brew install codex)"
  exit 127
}

SUB="$(ponte_subcomando_mcp "$CODEX")"
exec "$CODEX" "$SUB"
