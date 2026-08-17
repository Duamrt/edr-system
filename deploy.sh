#!/bin/bash
# EDR System — Deploy com cache busting automatico
# Uso: ./deploy.sh "mensagem do commit"
# Atualiza ?v=X em todos os HTML, bumpa o SW, comita e faz push

set -euo pipefail
cd "$(dirname "$0")"

CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "dev" ]; then
  echo "[BLOQUEADO] Execute o deploy a partir da branch dev. Branch atual: $CURRENT_BRANCH"
  exit 1
fi

# Aborta antes de alterar arquivos: o deploy nunca pode incluir trabalho alheio.
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
  echo "[BLOQUEADO] Checkout sujo. Use um worktree limpo ou guarde as alteracoes pendentes antes do deploy."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "[BLOQUEADO] Remote origin nao configurado."
  exit 1
fi

echo "[PRE-FLIGHT] Atualizando referencias remotas..."
git fetch --prune origin

for REF in origin/dev origin/main; do
  if ! git show-ref --verify --quiet "refs/remotes/$REF"; then
    echo "[BLOQUEADO] Referencia remota ausente: $REF"
    exit 1
  fi
done

if ! git merge-base --is-ancestor origin/dev dev; then
  echo "[BLOQUEADO] dev local esta atras ou divergiu de origin/dev. Reconcilie antes do deploy."
  exit 1
fi

if ! git merge-base --is-ancestor origin/main dev; then
  echo "[BLOQUEADO] main nao pode avancar por fast-forward a partir de dev. Reconcilie as branches antes do deploy."
  exit 1
fi

# Se uma etapa posterior falhar, devolve o operador para a branch de origem.
restore_branch() {
  STATUS=$?
  if [ "$(git branch --show-current)" != "$CURRENT_BRANCH" ]; then
    git switch "$CURRENT_BRANCH" || true
  fi
  exit "$STATUS"
}
trap restore_branch EXIT

# Gerar versao baseada em timestamp somente apos todos os bloqueios.
VERSION=$(date +%Y%m%d%H%M%S)
SHORT_V=$(date +%m%d%H%M)
MSG="${1:-deploy: cache busting v$SHORT_V}"

echo "=== EDR System Deploy ==="
echo "Versao: $VERSION"

# 1. Atualizar ?v=XXXX apenas em HTMLs rastreados na raiz.
echo "[1/4] Atualizando cache busting em HTMLs..."
HTML_FILES=()
while IFS= read -r FILE; do
  HTML_FILES+=("$FILE")
done < <(git ls-files -- '*.html' | awk 'index($0, "/") == 0')

if [ "${#HTML_FILES[@]}" -eq 0 ]; then
  echo "[BLOQUEADO] Nenhum HTML rastreado encontrado para cache busting."
  exit 1
fi

for FILE in "${HTML_FILES[@]}"; do
  # JS: arquivo.js?v=X → arquivo.js?v=NOVO
  sed -i -E "s/\.js(\?v=[0-9a-zA-Z]+)?\"/.js?v=$SHORT_V\"/g" "$FILE"
  # CSS: arquivo.css?v=X → arquivo.css?v=NOVO
  sed -i -E "s/\.css(\?v=[0-9a-zA-Z]+)?\"/.css?v=$SHORT_V\"/g" "$FILE"
done

# Atualizar _VER em novo-cliente.html
node -e "
const fs=require('fs');
let c=fs.readFileSync('novo-cliente.html','utf8');
c=c.replace(/const _VER = 'edr-[0-9]+';/, \"const _VER = 'edr-$SHORT_V';\");
fs.writeFileSync('novo-cliente.html',c);
"

# 2. Atualizar CACHE_NAME no service worker
echo "[2/4] Atualizando Service Worker..."
sed -i -E "s/const CACHE_NAME = 'edr-system-v[0-9]+';/const CACHE_NAME = 'edr-system-v$VERSION';/" sw.js

# 3. Git commit + push explicitos
echo "[3/4] Commitando..."
git add -- "${HTML_FILES[@]}" sw.js

# Pre-deploy check — varre diff staged contra secrets/SQL destrutivo/RLS aberta
if [ "${SKIP_CHECK:-0}" -ne 1 ] && [ -f "$HOME/.claude/scripts/pre-deploy-check.sh" ]; then
  bash "$HOME/.claude/scripts/pre-deploy-check.sh" || exit 1
fi

git commit -m "$MSG" || echo "Nada pra comitar"

# 4. Push dev + sync main
echo "[4/4] Publicando..."
git push origin dev
git switch main
git merge --ff-only dev
git push origin main
git switch dev

echo ""
echo "=== Deploy concluido! ==="
echo "Versao: $SHORT_V"
echo "Cache SW: edr-system-v$VERSION"
echo "Todos os usuarios vao atualizar automaticamente."

# DM Stack tracking DESABILITADO — projeto DM STACK deletado em 2026-05-25 (corte de custos).
# As etapas abaixo (dms-resolve + registro de deploy) apontam pro host do DM STACK, que nao
# existe mais (getaddrinfo ENOTFOUND). exit 0 encerra o deploy limpo e pula o codigo morto.
exit 0

# Fechar itens no DM Stack — extrai keyword do commit message (NUNCA usar $2 como keyword,
# pois $2 é o sistema e não uma keyword específica — isso fecharia TODOS os bugs do sistema)
DMS_SHORTID=$(echo "$MSG" | grep -oE '#[0-9a-fA-F]{8}' | head -1)
DMS_KWS=$(echo "$MSG" | \
  sed 's/[áàâã]/a/g; s/[éêè]/e/g; s/[íî]/i/g; s/[óôõ]/o/g; s/[úû]/u/g; s/ç/c/g' | \
  tr '[:upper:]' '[:lower:]' | \
  grep -oE '[a-z]{4,}' | \
  grep -vE '^(cache|busting|deploy|versao|fixes|update|remove|corrige|corrigir|adiciona|adicionar|atualiza|atualizar|insere|inserir|agora|gravem|gravam|bloquear|duplicata|lancamento|lancamentos|codigo|sistema|diaria|diarias|modal|valor|campo|botao|registro|registros|dividida|melhoria|melhorias|historico|feature|features|titulo|status|dados|texto|abrir|fechar|criar|salvar|editar|deletar|listar|exibir|mostrar|usando|agente|agentes|commit|antes|depois|quando|entre|sobre|todos|todas|telas|tela|lista|novo|nova|item|itens)$' | \
  tr '\n' ' ' | sed 's/[[:space:]]*$//')
DMS_ARGS="${DMS_SHORTID} ${DMS_KWS}"
DMS_ARGS="${DMS_ARGS## }"
if [ -n "$DMS_ARGS" ]; then
  bash "$HOME/dms-resolve.sh" "$DMS_ARGS" "EDR"
fi

# Registrar deploy no DM Stack
source "$HOME/.dms-config" 2>/dev/null
if [ -n "$DMS_SERVICE_KEY" ]; then
  DEPLOY_JSON="{\"sistema\":\"EDR\",\"versao\":\"edr-$SHORT_V\",\"mensagem\":$(echo "$MSG" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))')}"
  curl -s -X POST "$DMS_URL/rest/v1/deploys" \
    -H "apikey: $DMS_SERVICE_KEY" \
    -H "Authorization: Bearer $DMS_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "$DEPLOY_JSON" > /dev/null && echo "deploy registrado no DM Stack"
fi
