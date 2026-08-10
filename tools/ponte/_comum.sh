#!/usr/bin/env bash
# _comum.sh — helpers compartilhados da ponte Claude <-> Codex.
# Não executar direto; é feito para `source`.

set -uo pipefail

PONTE_RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PONTE_DIR="$PONTE_RAIZ/.ponte"
PONTE_PEDIDOS="$PONTE_DIR/pedidos"
PONTE_PARECERES="$PONTE_DIR/pareceres"

mkdir -p "$PONTE_PEDIDOS" "$PONTE_PARECERES"

_ts()   { date +%Y%m%d-%H%M%S; }
_erro() { printf '\033[31m[ponte] %s\033[0m\n' "$*" >&2; }
_info() { printf '\033[36m[ponte] %s\033[0m\n' "$*" >&2; }
_ok()   { printf '\033[32m[ponte] %s\033[0m\n' "$*" >&2; }

# Resolve o binário do Codex. No Git Bash o executável costuma ser codex.cmd.
ponte_bin_codex() {
  local c
  for c in codex codex.cmd codex.exe; do
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return 0
    fi
  done
  return 1
}

# Resolve o binário do Claude Code.
ponte_bin_claude() {
  local c
  for c in claude claude.cmd claude.exe; do
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return 0
    fi
  done
  return 1
}

# O subcomando de servidor MCP mudou de nome entre versões do Codex CLI.
# Descobre qual existe nesta instalação em vez de chutar.
ponte_subcomando_mcp() {
  local bin="$1" ajuda
  ajuda="$("$bin" --help 2>&1 || true)"
  if printf '%s' "$ajuda" | grep -qE '^\s*mcp-server\b'; then
    echo "mcp-server"
  elif printf '%s' "$ajuda" | grep -qE '^\s*mcp\b'; then
    echo "mcp"
  else
    echo "mcp"   # padrão das versões atuais
  fi
}

# Diff dos arquivos novos ainda não rastreados. `git diff HEAD` não os enxerga,
# e um patch inteiro em arquivo novo sairia como diff vazio. Ignorados ficam de fora.
ponte_diff_novos() {
  local arq
  git -C "$PONTE_RAIZ" ls-files --others --exclude-standard -z \
  | while IFS= read -r -d '' arq; do
      # --no-index sai com 1 quando há diferença; isso é o esperado aqui.
      git -C "$PONTE_RAIZ" diff --no-index --binary -- /dev/null "$arq" 2>/dev/null || true
    done
}

# Descrição legível do escopo. Função à parte de propósito: `ponte_montar_diff`
# roda dentro de $(...) — subshell — e variável setada lá dentro não voltaria.
ponte_descrever_escopo() {
  local alvo="${1:-}"
  if [ -n "$alvo" ]; then
    echo "diff de \`$alvo\`"
  elif [ -n "$(git -C "$PONTE_RAIZ" status --porcelain)" ]; then
    echo "working tree (não commitado: staged + não staged + arquivos novos)"
  else
    echo "último commit ($(git -C "$PONTE_RAIZ" log -1 --format='%h %s'))"
  fi
}

# Escopo do diff a revisar. Ordem: argumento explícito > working tree > último commit.
ponte_montar_diff() {
  local alvo="${1:-}"
  if [ -n "$alvo" ]; then
    git -C "$PONTE_RAIZ" diff "$alvo"
    return
  fi

  if [ -n "$(git -C "$PONTE_RAIZ" status --porcelain)" ]; then
    git -C "$PONTE_RAIZ" diff HEAD
    ponte_diff_novos
    return
  fi

  git -C "$PONTE_RAIZ" diff HEAD~1..HEAD
}
