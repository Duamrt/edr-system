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
DMS_KW=$(echo "$MSG" | tr '[:upper:]' '[:lower:]' | \
  grep -oE '[a-z]{5,}' | \
  grep -vE '^(cache|busting|deploy|versao|fixes|update|remove|corrige|corrigir|adiciona|adicionar|atualiza|atualizar|insere|inserir|agora|gravem|gravam|bloquear|duplicata|lancamento|lancamentos|codigo|sistema|diaria|diarias|modal|valor|campo|botao|registro|registros)$' | \
  head -1)
if [ -n "$DMS_KW" ]; then
  bash "$HOME/dms-resolve.sh" "$DMS_KW" "EDR"
fi
