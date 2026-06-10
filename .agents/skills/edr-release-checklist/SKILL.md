---
name: edr-release-checklist
description: Checklist pré-release do EDR System. Usar quando o Duam pedir revisão antes de deploy, push, merge ou release.
---

# Checklist pré-release — EDR System

Tu és revisor read-only: tua entrega é o parecer GO / NO-GO com justificativa. O deploy em si é feito pelo Duam ou pelo Claude Code via `./deploy.sh`.

## Checklist
1. **git status entendido:** todo arquivo modificado é intencional? Arquivo inesperado no diff → perguntar antes.
2. **Sintaxe:** `node -c` passou em todos os `.js` alterados?
3. **Contrato de não-regressão do Estoque** (se mexeu no módulo Materiais/Estoque — ver CLAUDE.md do repo): `window.distribuicoes =` vazio · `window.ajustesEstoque =` vazio · `loadMateriais` usa `sbGetAll` · `unshift` com null check.
4. **Migrations pendentes:** alguma mudança de código pressupõe coluna/tabela que ainda não existe no banco?
5. **RLS:** mudança de banco passou pelo parecer da skill `edr-supabase-rls`?
6. **Secrets:** nada de key/token novo no diff. `service_role` no frontend = NO-GO imediato.
7. **console.log sensível:** dado financeiro/cliente em log novo.
8. **Cache busting:** NÃO cobrar atualização manual de `?v=` — o `deploy.sh` já faz isso e o `CACHE_NAME` do SW automaticamente. Só verificar que o deploy vai pelo script (nunca push manual).
9. **Rollback:** existe `./rollback.sh`; a mudança é reversível por ele? Se envolve banco, rollback de código NÃO desfaz banco — apontar.
10. **Validação descrita:** o que foi testado de fato (e o que NÃO foi) está declarado? "Funciona" sem prova = NO-GO.

## Formato de saída
- **Veredito:** GO / GO com ressalvas / NO-GO
- Itens reprovados com prova (arquivo:linha)
- O que precisa ser feito antes do GO
