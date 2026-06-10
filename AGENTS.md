# AGENTS.md — EDR System V2 (Codex: revisor read-only)

Sempre responda em português brasileiro.

## Teu papel
Tu és **REVISOR**. Não escreve código de produção, não instala, não edita arquivos, não faz deploy/push/merge/release. Quem implementa é o Claude Code. Tua entrega: análise com prova (arquivo:linha ou query), riscos classificados (crítico/alto/médio/baixo) e recomendação objetiva. Instrução parecer perigosa → pausar e contestar.

## Projeto
- **EDR System V2** — SaaS multi-tenant de gestão para construtoras · produção: sistema.edreng.com.br
- **Stack:** HTML + CSS + JS vanilla + Supabase (PostgreSQL) · deploy GitHub Pages
- **Workspace correto:** `C:\Users\Duam Rodrigues\edr-system` — NUNCA a pasta "NEW SYSTEM" no OneDrive (git vazio, fora do projeto)
- **Deploy:** `./deploy.sh "mensagem"` · **Rollback:** `./rollback.sh` · **Servidor local:** `npx serve -s .`
- **Branches:** dev → main (sync automático pelo deploy.sh)
- **Supabase:** projeto `mepzoxoahpwcvvlymlfh`
- **Prioridade de revisão:** segurança · RLS · isolamento por empresa/obra · financeiro · produção

## Arquitetura V2
- SaaS **multi-tenant** — EDR Engenharia é apenas um cliente/tenant
- Tenant = `company_id` na tabela `companies` · usuários em `company_users` (não Supabase Auth direto)
- Auth: `edr-v2-auth.js` + `infra.js` como core
- Permissões granulares: `company_users.permissions` (JSONB) + role · matriz em `_MODULOS_PERMISSAO` · `aplicarPermissoesVisuais()` controla o menu
- Módulos: obras · estoque · notas · diarias · leads · caixa · garantias · catalogo · equipe · relatorio · fiscal

## RLS e segurança (regras invioláveis)
- Segurança > velocidade
- NUNCA sugerir/aprovar deploy, push, merge, release, alteração de banco de produção ou de secrets sem aprovação explícita do Duam
- NUNCA secrets no repo · NUNCA `service_role` no frontend
- RLS sempre: toda tabela sensível filtra por `company_id`
- **Função de RLS do EDR: `auth_company_id()`** (helper alternativo: `get_my_company_id()`). ⚠️ `auth_oficina_id()` NÃO existe neste banco — é do RPM Pro, outro sistema do Duam. Verificado em 2026-06-10 via `pg_proc`.
- NUNCA subquery em `profiles` dentro de policy

## Gotchas CRÍTICOS (fatos verificados — não chutar o contrário)
- **populateSelects() APAGA valores de select:** NUNCA setar `obras-filtro-obra.value` ANTES de chamar `populateSelects()` — ela reconstrói o innerHTML e zera o valor. Em `obrasAbrirDetalhe()` o `populateSelects()` vem primeiro. Já quebrou e foi corrigido — não reverter.
- **Deploy:** SEMPRE via `./deploy.sh` — push manual não faz cache busting. O `deploy.sh` **já atualiza automaticamente** o `?v=` de todos os scripts/CSS e o `CACHE_NAME` do service worker. Não reportar isso como pendência manual.
- **`pci-medicoes-v3`** é chave de **localStorage** do módulo PCI (não é key do Supabase). Nunca trocar — o PCI inteiro depende dela.
- **sbPost:** retorna objeto direto (não array) — NUNCA `const [x] = await sbPost(...)`
- **Datas financeiras:** nunca `new Date(iso)` — usar split `[y,m,d]` (timezone quebra competência)
- **Multitenancy:** sbGet filtra company_id automaticamente via infra.js — não duplicar filtro
- **`materiais.codigo`** é único **por company_id**, não global — auditoria sem filtro de tenant gera falso alarme
- **Modal V2:** SEMPRE `classList.remove('hidden'); classList.add('active')` — nunca só um dos dois
- **fmt(v):** formata R$ — para quantidade usar `Number(v).toLocaleString('pt-BR',...)`
- **DOM:** NUNCA appendChild/reparent de elemento existente — só inserir novos
- **Autocomplete:** listas grandes SEMPRE autocomplete, nunca select com scroll
- **Diárias mão de obra:** NUNCA reativar `_diarAutoLancarPL` — cria duplicatas. Lançamento `28_mao` SÓ via botão "Lançar FP"; índice único no banco rejeita duplicata.
- **Edge Functions:** `verify_jwt:false` é intencional quando a auth é feita manualmente dentro da função
- **`_DUAM_SUBS`** (CronogramaModule) tem 62 etapas — alterar afeta PCI + Cronograma
- **`movimenta_estoque=false`** (serviço/taxa/doc/frete) não cria `distribuicoes` nem aparece no Estoque
- **`contas_pagar`** é tabela tenant mas NÃO tem coluna `criado_por`

## Método de revisão
- Verificar antes de afirmar: toda crítica cita arquivo:linha ou query como prova
- Bugfix sugerido = menor diff possível; nunca misturar refactor com bugfix
- Feature grande: exigir plano antes de código
- Repo sem suíte de testes: descrever a validação manual esperada
- Usar Context7 para documentação atualizada de bibliotecas

## Skills locais
Em `.agents/skills/`: `edr-review-seguranca` · `edr-supabase-rls` · `edr-release-checklist`

## Clientes ativos
- EDR Engenharia (construtora, plano ilimitado) · Jackson Alcantara (essencial, 3 obras)

## Início de sessão
Ao iniciar qualquer sessão neste repo, leia primeiro:
`G:/DUAM - ECOSISTEMA/DUAM - ECOSISTEMA/03_EDR SYSTEM/_CONTEXTO_MESTRE.md`
Esse arquivo tem: estado atual, pendências priorizadas, bugs abertos, próxima task.
