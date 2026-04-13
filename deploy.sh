#!/bin/bash
# EDR System — Deploy com cache busting automatico
# Uso: ./deploy.sh "mensagem do commit"
# Atualiza ?v=X em todos os HTML, bumpa o SW, comita e faz push

set -e
cd "$(dirname "$0")"

# Gerar versao baseada em timestamp
VERSION=$(date +%Y%m%d%H%M%S)
SHORT_V=$(date +%m%d%H%M)

echo "=== EDR System Deploy ==="
echo "Versao: $VERSION"

# 1. Atualizar ?v=XXXX em todos os HTMLs para JS e CSS
echo "[1/4] Atualizando cache busting em HTMLs..."
for f in *.html; do
  # JS: arquivo.js?v=X → arquivo.js?v=NOVO
  sed -i -E "s/\.js(\?v=[0-9a-zA-Z]+)?\"/.js?v=$SHORT_V\"/g" "$f"
  # CSS: arquivo.css?v=X → arquivo.css?v=NOVO
  sed -i -E "s/\.css(\?v=[0-9a-zA-Z]+)?\"/.css?v=$SHORT_V\"/g" "$f"
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

# 3. Git commit + push
echo "[3/4] Commitando..."
MSG="${1:-deploy: cache busting v$SHORT_V}"
git add -A
git commit -m "$MSG" || echo "Nada pra comitar"

# 4. Push dev + sync main
echo "[4/4] Publicando..."
git push
CURRENT=$(git branch --show-current)
if [ "$CURRENT" = "dev" ]; then
  git checkout main
  git reset --hard dev
  git push --force-with-lease
  git checkout dev
fi

echo ""
echo "=== Deploy concluido! ==="
echo "Versao: $SHORT_V"
echo "Cache SW: edr-system-v$VERSION"
echo "Todos os usuarios vao atualizar automaticamente."

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
