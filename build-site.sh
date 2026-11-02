#!/bin/bash
# EDR System — monta a pasta dist/ só com os arquivos que o site precisa.
# Usado pelo Cloudflare Pages (build command: bash build-site.sh, output: dist)
# e pelo deploy.sh como checagem antes de publicar.
# Lista explícita (allowlist): arquivo novo do site precisa entrar aqui.

set -euo pipefail
cd "$(dirname "$0")"

OUT=dist

# Páginas públicas e do sistema
PAGINAS=(
  index.html
  landing.html
  produto.html
  novo-cliente.html
  meu-plano.html
  relatorio-obra.html
  termo-entrega.html
  tracker.html
  agenda.html
  agenda-iannaline.html
)

# Arquivos soltos da raiz
ARQUIVOS=(
  sw.js
  manifest.json
  favicon.svg
  _headers
)

# Pastas copiadas inteiras
PASTAS=(
  js
  css
  img
  landing-v2
)

rm -rf "$OUT"
mkdir -p "$OUT"

for f in "${PAGINAS[@]}" "${ARQUIVOS[@]}"; do
  if [ ! -f "$f" ]; then
    echo "[ERRO] Arquivo do site ausente: $f"
    exit 1
  fi
  cp "$f" "$OUT/$f"
done

for d in "${PASTAS[@]}"; do
  if [ ! -d "$d" ]; then
    echo "[ERRO] Pasta do site ausente: $d"
    exit 1
  fi
  cp -R "$d" "$OUT/$d"
done

# Trava de segurança: nada interno pode ir para o site.
PROIBIDOS=$(find "$OUT" \( -name '*.sql' -o -name '*.md' -o -name '*.sh' -o -name '*.ts' -o -name '*.test.js' -o -name '.env*' -o -name '*.pem' -o -name '*.key' \) -print)
if [ -n "$PROIBIDOS" ]; then
  echo "[ERRO] Arquivo interno dentro de $OUT:"
  echo "$PROIBIDOS"
  exit 1
fi

echo "Site montado em $OUT/: $(find "$OUT" -type f | wc -l) arquivos"
