#!/usr/bin/env bash
# instalar.sh — prepara a ponte Claude <-> Codex nesta máquina.
#
# Roda uma vez por clone. Idempotente: pode rodar de novo sem estragar nada.
#
#   bash tools/ponte/instalar.sh

set -uo pipefail
# shellcheck source=_comum.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

FALHAS=0

echo
_info "1/4 — checando os dois CLIs"

if CODEX="$(ponte_bin_codex)"; then
  _ok "Codex: $CODEX ($("$CODEX" --version 2>/dev/null | head -1))"
else
  _erro "Codex CLI ausente. Instale: npm i -g @openai/codex"
  FALHAS=$((FALHAS + 1))
fi

if CLAUDE="$(ponte_bin_claude)"; then
  _ok "Claude Code: $CLAUDE ($("$CLAUDE" --version 2>/dev/null | head -1))"
else
  _erro "Claude Code ausente. Instale: npm i -g @anthropic-ai/claude-code"
  FALHAS=$((FALHAS + 1))
fi

echo
_info "2/4 — permissão de execução dos scripts"
chmod +x "$PONTE_RAIZ"/tools/ponte/*.sh 2>/dev/null
_ok "scripts executáveis"

echo
_info "3/4 — registrando o Codex como MCP server do projeto"
DESTINO="$PONTE_RAIZ/.mcp.json"
MODELO="$PONTE_RAIZ/tools/ponte/mcp.exemplo.json"

if [ ! -f "$DESTINO" ]; then
  cp "$MODELO" "$DESTINO"
  _ok ".mcp.json criado (fica local — está no .gitignore de propósito)"
elif grep -q '"codex"' "$DESTINO"; then
  _ok ".mcp.json já tem o servidor codex — nada a fazer"
elif command -v jq >/dev/null 2>&1; then
  TMP="$(mktemp)"
  jq -s '.[0] * .[1]' "$DESTINO" "$MODELO" > "$TMP" && mv "$TMP" "$DESTINO"
  _ok "servidor codex mesclado no .mcp.json existente"
else
  _erro ".mcp.json já existe e o jq não está disponível para mesclar."
  _erro "Adicione à mão o bloco de tools/ponte/mcp.exemplo.json"
  FALHAS=$((FALHAS + 1))
fi

echo
_info "4/4 — smoke test do servidor MCP"
if [ -n "${CODEX:-}" ]; then
  SUB="$(ponte_subcomando_mcp "$CODEX")"
  _info "subcomando MCP detectado: \`codex $SUB\`"
  # Sobe o servidor, manda um handshake e derruba. Sem timeout externo: nem
  # todo Git Bash tem `timeout`.
  RESP="$(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"ponte","version":"1"}}}' \
    | "$CODEX" "$SUB" 2>/dev/null | head -c 2000)"
  if printf '%s' "$RESP" | grep -q '"result"'; then
    _ok "servidor MCP respondeu ao handshake"
  else
    _erro "sem resposta válida do \`codex $SUB\` — a ponte por MCP pode não funcionar."
    _erro "O caminho por script (tools/ponte/revisar.sh) continua valendo."
    FALHAS=$((FALHAS + 1))
  fi
else
  _erro "pulado — Codex ausente."
fi

echo
if [ "$FALHAS" -eq 0 ]; then
  _ok "ponte pronta. Reinicie o Claude Code para ele carregar o .mcp.json."
  echo
  echo "  Claude -> Codex :  /revisar   (ou tools/ponte/revisar.sh)"
  echo "  Codex  -> Claude :  tools/ponte/implementar.sh \"tarefa\""
  echo "  Ciclo fechado    :  tools/ponte/implementar.sh --do-parecer"
  echo
else
  _erro "$FALHAS pendência(s) acima. Veja docs/PONTE-CLAUDE-CODEX.md"
  exit 1
fi
