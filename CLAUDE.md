# EDR System V2 — Sistema de Gestão SaaS

Sempre responda em português brasileiro.

## Projeto
- **Stack:** HTML + CSS + JS vanilla + Supabase (PostgreSQL)
- **Deploy:** `./deploy.sh "mensagem"` → sistema.edreng.com.br (GitHub Pages, branch main)
- **Rollback:** `./rollback.sh`
- **Branches:** dev → main (merge automático via deploy.sh)
- **Servidor local:** `npx serve -s .`
- **Supabase:** projeto EDR (mepzoxoahpwcvvlymlfh)

## Arquitetura V2
- É um **SaaS multi-tenant** — EDR Engenharia é apenas um cliente/tenant
- Tenant = `company_id` na tabela `companies`
- Usuários em `company_users` (não Supabase Auth direto)
- Auth: `edr-v2-auth.js` + `infra.js` como core
- Permissões granulares: `company_users.permissions` (JSONB) + role

## Módulos principais
obras · estoque · notas · diarias · leads · caixa · garantias · catalogo · equipe · relatorio · fiscal

## Gotchas CRÍTICOS
- **populateSelects() APAGA valores de select:** NUNCA setar `obras-filtro-obra.value` ANTES de chamar `populateSelects()` — ela reconstrói o innerHTML e zera qualquer valor setado. Em `obrasAbrirDetalhe()` o `populateSelects()` DEVE vir primeiro, só depois setar o `.value`. Já quebrou e foi corrigido — não reverter.
- **Modal V2:** SEMPRE `classList.remove('hidden'); classList.add('active')` pra abrir — NUNCA só um dos dois
- **sbPost:** retorna objeto direto (não array) — NUNCA `const [x] = await sbPost(...)`
- **RLS:** NUNCA subquery em `profiles` dentro de policy
- **Multitenancy:** sbGet filtra company_id automaticamente via infra.js — não duplicar filtro
- **fmt(v):** formata como R$ (currency) — para quantidade usar `Number(v).toLocaleString('pt-BR',...)`
- **DOM:** NUNCA appendChild/reparent de elemento existente — só inserir novos
- **Deploy:** SEMPRE via ./deploy.sh — push manual não faz cache busting
- **Autocomplete:** listas grandes SEMPRE usar autocomplete, nunca select com scroll
- **Diárias mão de obra:** NUNCA reativar `_diarAutoLancarPL` — cria duplicatas. Lançamento 28_mao SÓ via botão "Lançar FP". Banco tem índice único (obra_id, obs) WHERE etapa='28_mao' que rejeita duplicata.

## Clientes ativos
- EDR Engenharia (construtora, plano ilimitado)
- Jackson Alcantara (essencial, 3 obras)

## RLS
- Policies usam `auth_oficina_id()` — NUNCA subquery em profiles
- Anon key: nunca expor service_role no frontend

## Permissões por perfil
- Matriz em `edr-v2-auth.js/_MODULOS_PERMISSAO`
- 21 módulos — admin configura via modal Editar Usuário
- `aplicarPermissoesVisuais()` controla o que aparece no menu

## Deploy / Cache
- Cache buster automático no deploy.sh
- Service Worker: CACHE_NAME atualizado automaticamente pelo deploy.sh

## Início de sessão
Ao iniciar qualquer sessão neste repo, leia primeiro:
`G:/DUAM - ECOSISTEMA/DUAM - ECOSISTEMA/03_EDR SYSTEM/_CONTEXTO_MESTRE.md`
Esse arquivo tem: estado atual, pendências priorizadas, bugs abertos, próxima task.
