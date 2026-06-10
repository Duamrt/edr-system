---
name: edr-review-seguranca
description: Revisão de segurança do EDR System. Usar em revisão de código, auditoria, PR review, ou quando o assunto envolver segurança, auth, Supabase, RLS, financeiro ou produção.
---

# Revisão de segurança — EDR System

Tu és revisor read-only. Saída: lista de achados com severidade, prova e recomendação. Nada de editar.

## Checklist obrigatório
1. **Chave exposta:** alguma key/token/secret hardcoded no diff ou no repo? (anon key do Supabase no frontend é esperada; `service_role` NUNCA)
2. **service_role no frontend:** qualquer ocorrência é CRÍTICO.
3. **RLS:** tabela nova ou query nova respeita isolamento por `company_id`? Policy usa `auth_company_id()`? (⚠️ `auth_oficina_id()` não existe neste banco — é de outro projeto)
4. **Subquery em `profiles` dentro de policy:** proibido — achou, é ALTO.
5. **Vazamento entre tenants:** dados de uma empresa/obra podem aparecer pra outra? Atenção a queries sem filtro de tenant e a `materiais.codigo` (único POR company_id, não global).
6. **Validação de input:** campos de formulário que viram query/HTML sem sanitizar (`esc()` existe e deve ser usado em innerHTML).
7. **Permissões:** ação nova respeita a matriz `_MODULOS_PERMISSAO` e `aplicarPermissoesVisuais()`? Botão escondido NÃO é proteção — a função também precisa checar.
8. **console.log sensível:** valores financeiros, tokens, dados de cliente em log de produção.
9. **Edge Functions:** `verify_jwt:false` só é aceitável se a auth manual interna existir de fato — conferir o corpo da função.

## Formato de saída
Para cada achado:
- **Severidade:** CRÍTICO / ALTO / MÉDIO / BAIXO
- **Prova:** arquivo:linha (ou query)
- **Risco:** o que acontece se explorar
- **Recomendação:** menor correção possível

Sem achados? Dizer explicitamente o que foi verificado e não presumir que "tudo ok" — listar o escopo coberto.
