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

## Contrato — Notas Fiscais / Estoque / Financeiro (2026-06-02)

- `contas_pagar` é tabela tenant: sempre acessar via `sbGet/sbPost/sbPatch` — `company_id` injetado automaticamente.
- `contas_pagar` NÃO entra em `_TABELAS_RASTREIO` enquanto não existir coluna `criado_por` na tabela.
- Exclusão de NF nunca deve depender de `contasPagar[]` local; deve consultar o banco antes de excluir.
- Exclusão de NF deve seguir ordem com guards: lançamentos → distribuições → nota. Se qualquer etapa falhar, parar e preservar a nota quando possível.
- Itens como ART, taxa, imposto, frete, documentação e mão de obra não movimentam estoque — não criam `distribuicoes`.
- `registro` isolado NÃO pode ser usado como palavra de bloqueio de estoque — existe registro hidráulico (REGISTRO SOLDAVEL, REGISTRO PVC etc.). Usar frases específicas: `registro de imovel`, `registro cartorio`.
- **Pendência planejada:** criar `contas_pagar.nota_id` e preencher nos inserts de NF para eliminar colisão por número de NF entre fornecedores.
- **Pendência planejada:** mover exclusão de NF para RPC/Edge Function transacional — única forma de garantir atomicidade real.

## Contrato de não regressão — Módulo Materiais/Estoque (2026-06-02)
Antes de qualquer edição neste módulo, confirmar que estas regras continuam válidas:

1. `materiais` está em `_TABELAS_TENANT` em `infra.js` — não remover
2. `loadMateriais()` usa `sbGetAll` sem `limit=1000` — não regredir para `sbGet`
3. Recarregar distribuições/ajustes via `loadDistribuicoes()` / `loadAjustesEstoque()` — nunca `window.distribuicoes = ...`
4. `if (!novo) return` antes de `ajustesEstoque.unshift(novo)` — null check obrigatório
5. `codigo_catalogo` presente nas inserções de entrada direta, saída manual, ajuste e distribuição de NF
6. Banco usa key técnica (`08_doc`, `23_impermeab`); UI usa `etapaLabel(key)` — nunca salvar label bonito no banco
7. Filtro de etapas: `value` = key oficial, texto = `etapaLabel(key)`, categorias legadas resolvidas via `_resolverCategoriaEstoque()`
8. `itemMovimentaEstoque()` — serviço/taxa/doc/ART/imposto/frete cria lançamento mas NÃO cria `distribuicoes`

Após editar, verificar com `rg`:
- `window\.distribuicoes\s*=` → deve retornar vazio
- `window\.ajustesEstoque\s*=` → deve retornar vazio
- `loadMateriais` → deve conter `sbGetAll`
- `ajustesEstoque\.unshift` → deve ter `if (!novo)` antes

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
