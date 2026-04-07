#!/bin/bash
# EDR System — Rollback de emergencia
# Uso: ./rollback.sh
# Desfaz o ultimo deploy e sobe a versao anterior automaticamente

set -e
cd "$(dirname "$0")"

echo "=== EDR System Rollback ==="
echo "Ultimo deploy:"
git log --oneline -3

echo ""
echo "Desfazendo ultimo commit..."
git revert HEAD --no-edit

echo "Subindo versao anterior..."
./deploy.sh "Rollback: revertendo ultimo deploy"
