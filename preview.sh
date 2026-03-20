#!/bin/bash
# EDR System — Preview local antes de publicar
# Uso: ./preview.sh
# Sobe servidor local e mostra link pro celular testar

cd "$(dirname "$0")"

IP=$(ip addr show 2>/dev/null | grep -oP 'inet \K192\.168\.\d+\.\d+' | head -1)
if [ -z "$IP" ]; then
  IP=$(ipconfig 2>/dev/null | grep -oP 'IPv4.*: \K[\d.]+' | grep '192\.' | head -1)
fi
if [ -z "$IP" ]; then
  IP="localhost"
fi

PORT=3001

echo ""
echo "=== EDR System Preview ==="
echo ""
echo "  PC:      http://localhost:$PORT"
echo "  Celular: http://$IP:$PORT"
echo ""
echo "  Abre no celular pra testar antes de publicar."
echo "  Ctrl+C pra parar."
echo ""

npx serve -s . -l $PORT
