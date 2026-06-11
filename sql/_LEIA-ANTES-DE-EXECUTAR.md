# ⛔ Avisos antes de executar qualquer .sql desta pasta

O **estado real e seguro do RLS vive nas migrations do Supabase** (painel → Database → Migrations),
não nestes arquivos. Vários scripts aqui são **legados** e, se reexecutados em seed/ambiente novo,
**ressuscitam buracos de segurança já corrigidos em produção**.

## Arquivos legados NEUTRALIZADOS (2026-06-11) — não reexecutar os blocos comentados

| Arquivo | O que recriava (perigoso) | Estado seguro em produção |
|---|---|---|
| `multi-tenant.sql` | policies `*_company` FOR ALL (anulam controle de papel) + `leads_insert_anon` WITH CHECK(true) (escrita anônima) | migrations `consolidate_drop_legacy_company_and_crosstenant_policies` + `drop_leads_insert_anon_dead_policy` |
| `leads-v2.sql` | `lead_hist_auth` FOR ALL `authenticated` (cross-tenant) | policies granulares `lh_*` por `company_id` |
| `seguranca-rls.sql` | `*_auth` FOR ALL `authenticated` em 16 tabelas (cross-tenant) + funções admin com `user_metadata` manipulável | policies granulares por papel/company + `admin_*` com `raw_app_meta_data` |

Os blocos perigosos foram **comentados** (`/* ... */`) nesses arquivos, mantidos só como histórico.
As partes idempotentes e seguras (ex.: `ADD COLUMN company_id`, índices, `get_my_company_id()` em
`multi-tenant.sql`) foram preservadas.

## Regra
Mudança de RLS/policy → **fazer via migration do Supabase** (`apply_migration`), nunca colando script
legado no SQL Editor. Antes de qualquer policy, rodar `get_advisors` e conferir `pg_policies`.
