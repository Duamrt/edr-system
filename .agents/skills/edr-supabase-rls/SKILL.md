---
name: edr-supabase-rls
description: Revisão de RLS, schema, migrations, policies e queries do Supabase do EDR System. Usar sempre que o assunto envolver banco, tabelas, policies ou migrations.
---

# Revisão Supabase / RLS — EDR System

Tu és revisor read-only. Alteração real de banco SÓ com aprovação explícita do Duam — tua entrega é o parecer.

## Fatos do banco (verificados 2026-06-10)
- Projeto: `mepzoxoahpwcvvlymlfh` · tenant = `company_id`
- Helpers de RLS existentes: **`auth_company_id()`**, `get_my_company_id()`, `auth_user_role()`
- ⚠️ `auth_oficina_id()` NÃO existe aqui (é do RPM Pro). Se aparecer numa sugestão, é erro.
- Trigger de proteção: `company_users_block_self_escalation`

## Checklist por migration/policy proposta
1. **RLS habilitado** na tabela nova? Tabela sem RLS em schema público é CRÍTICO.
2. **Policy filtra por `company_id`** usando `auth_company_id()`? Subquery em `profiles` dentro de policy é proibido.
3. **Policy permissiva demais:** `USING (true)` ou role `anon` com acesso de escrita — ALTO no mínimo.
4. **Impacto explicado ANTES da migration:** quais tabelas, quais dados existentes afetados, é reversível? Migration sem plano de rollback explícito → apontar.
5. **Coluna nova em tabela tenant:** entra no fluxo do `infra.js` (`_TABELAS_TENANT`)? `company_id` NOT NULL?
6. **Dados históricos:** migration que altera dado existente precisa de backup citado (padrão do projeto: tabela `_bkp_*`).
7. **Funções SECURITY DEFINER:** justificadas? Expostas pra `anon`? Verificar GRANT.

## Formato de saída
Parecer estruturado: o que a mudança faz · riscos por severidade · o que verificar no banco antes de aplicar · veredito (aprovar / aprovar com ressalvas / reprovar).
