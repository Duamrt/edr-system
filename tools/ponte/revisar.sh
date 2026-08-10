#!/usr/bin/env bash
# revisar.sh — sentido Claude -> Codex.
#
# Monta um pedido de revisão a partir do diff e roda o Codex em modo headless
# (read-only, sem aprovação interativa). O parecer sai em .ponte/pareceres/.
#
# Uso:
#   tools/ponte/revisar.sh                          # revisa o working tree
#   tools/ponte/revisar.sh --escopo main..HEAD      # revisa um range de commits
#   tools/ponte/revisar.sh --foco "RLS de notas"    # direciona a atenção do revisor
#   tools/ponte/revisar.sh --so-pedido              # só gera o pedido, não chama o Codex
#
# Saída: caminho do parecer no stdout (última linha), para o chamador ler.

set -uo pipefail
# shellcheck source=_comum.sh
source "$(dirname "${BASH_SOURCE[0]}")/_comum.sh"

ESCOPO=""
FOCO=""
SO_PEDIDO=0

while [ $# -gt 0 ]; do
  case "$1" in
    --escopo)    ESCOPO="${2:-}"; shift 2 ;;
    --foco)      FOCO="${2:-}";   shift 2 ;;
    --so-pedido) SO_PEDIDO=1;     shift ;;
    -h|--help)   sed -n '2,15p' "$0"; exit 0 ;;
    *)           _erro "argumento desconhecido: $1"; exit 2 ;;
  esac
done

TS="$(_ts)"
PEDIDO="$PONTE_PEDIDOS/$TS-pedido.md"
PARECER="$PONTE_PARECERES/$TS-parecer.md"

PONTE_ESCOPO_DESC="$(ponte_descrever_escopo "$ESCOPO")"
DIFF="$(ponte_montar_diff "$ESCOPO")"

if [ -z "${DIFF//[$'\t\r\n ']/}" ]; then
  _erro "Nada para revisar — o escopo ($PONTE_ESCOPO_DESC) está vazio."
  exit 3
fi

LINHAS_DIFF="$(printf '%s\n' "$DIFF" | wc -l | tr -d ' ')"
ARQUIVOS="$(printf '%s\n' "$DIFF" | grep -E '^\+\+\+ b/' | sed 's|^+++ b/||' | sort -u)"

{
  echo "# Pedido de revisão — EDR System"
  echo
  echo "- **Gerado em:** $TS"
  echo "- **Branch:** $(git -C "$PONTE_RAIZ" rev-parse --abbrev-ref HEAD)"
  echo "- **Escopo:** $PONTE_ESCOPO_DESC"
  echo "- **Tamanho:** $LINHAS_DIFF linhas de diff"
  [ -n "$FOCO" ] && { echo "- **Foco pedido pelo implementador:** $FOCO"; }
  echo
  echo "## Arquivos tocados"
  printf '%s\n' "$ARQUIVOS" | sed 's/^/- `/;s/$/`/'
  echo
  echo "## Diff"
  echo '```diff'
  printf '%s\n' "$DIFF"
  echo '```'
} > "$PEDIDO"

_ok "pedido gravado: ${PEDIDO#"$PONTE_RAIZ"/}"

if [ "$SO_PEDIDO" -eq 1 ]; then
  echo "$PEDIDO"
  exit 0
fi

CODEX="$(ponte_bin_codex)" || {
  _erro "Codex CLI não encontrado no PATH — o pedido ficou gravado mesmo assim."
  _erro "Instale (npm i -g @openai/codex) ou rode com --so-pedido e use o modo assíncrono."
  echo "$PEDIDO"
  exit 127
}

PROMPT="Você é o REVISOR read-only deste repositório (papel definido em AGENTS.md — leia antes de responder).

Revise o pedido em \`${PEDIDO#"$PONTE_RAIZ"/}\`. Você pode ler qualquer arquivo do repo para conferir o contexto ao redor do diff. NÃO edite nada, NÃO rode deploy, NÃO altere banco.

Responda em português brasileiro, em markdown, exatamente nesta estrutura:

## Veredito
APROVADO | APROVADO COM RESSALVAS | REPROVADO — em uma linha, com o motivo.

## Achados
Um item por achado, do mais grave ao menos grave, cada um com:
- **[CRÍTICO|ALTO|MÉDIO|BAIXO]** título curto
  - **Prova:** arquivo:linha (ou query). Sem prova, não é achado — é suspeita, e deve ir para a seção Suspeitas.
  - **Risco:** o que quebra na prática.
  - **Correção sugerida:** menor diff possível.

## Suspeitas (sem prova)
O que você não conseguiu confirmar e o que precisaria ler para confirmar. Vazio é resposta válida.

## Contratos do repo
Confirme explicitamente se o diff respeita os gotchas de AGENTS.md e CLAUDE.md que tocam nos arquivos alterados (RLS/company_id, populateSelects, sbPost, modal V2, movimenta_estoque, deploy.sh/cache, datas financeiras). Cite só os que se aplicam.

## Validação esperada
Como o implementador prova que funcionou, já que o repo não tem suíte cobrindo tudo."

_info "chamando o Codex (read-only)… isso pode levar alguns minutos."

"$CODEX" exec \
  --cd "$PONTE_RAIZ" \
  --sandbox read-only \
  --ask-for-approval never \
  "$PROMPT" 2>"$PARECER.log" | tee "$PARECER.raw" >/dev/null
STATUS="${PIPESTATUS[0]}"

if [ $STATUS -ne 0 ] || [ ! -s "$PARECER.raw" ]; then
  _erro "Codex retornou status $STATUS. Log: ${PARECER#"$PONTE_RAIZ"/}.log"
  # Versões antigas usam --approval-mode; tenta uma vez sem as flags novas.
  _info "tentando novamente sem as flags de aprovação…"
  "$CODEX" exec --cd "$PONTE_RAIZ" "$PROMPT" 2>>"$PARECER.log" | tee "$PARECER.raw" >/dev/null
  STATUS="${PIPESTATUS[0]}"
  if [ "$STATUS" -ne 0 ] || [ ! -s "$PARECER.raw" ]; then
    _erro "falhou de novo — veja ${PARECER#"$PONTE_RAIZ"/}.log"
    echo "$PEDIDO"
    exit 4
  fi
fi

{
  echo "# Parecer do Codex — $TS"
  echo
  echo "> Pedido: \`${PEDIDO#"$PONTE_RAIZ"/}\` · escopo: $PONTE_ESCOPO_DESC"
  echo
  cat "$PARECER.raw"
} > "$PARECER"
rm -f "$PARECER.raw"

_ok "parecer: ${PARECER#"$PONTE_RAIZ"/}"
echo "$PARECER"
