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

## Contrato — Catálogo / material vs serviço (2026-06-02)

- `materiais.tipo_item` (text, default 'material') + `materiais.movimenta_estoque` (boolean, default true) — campos adicionados 2026-06-02.
- `movimenta_estoque=false` é a fonte de verdade. Regex em `itemMovimentaEstoque()` é apenas fallback para itens sem catálogo.
- `buildConsolidado` filtra `movimenta_estoque=false` — serviço/taxa/doc/frete nunca aparece no Estoque.
- NF com `movimenta_estoque=false` gera custo/lançamento, mas NÃO cria `distribuicoes`.
- Seed inicial: 17 itens marcados (5 serviços, 1 mão obra, 5 taxas, 5 documentos, 1 frete).
- **Pendência de dados:** distribuição histórica `id=f7c4cc4e...` com `item_desc='SIFÃO SANFONADO'` vinculada ao código 000564 (FRETE). Anomalia — código errado ou matching antigo incorreto. NÃO corrigir automaticamente. Auditar origem em nota/lançamento antes de alterar código ou deletar distribuição.
- **Saneamento pendente:** 13 distribuições históricas de itens `movimenta_estoque=false` ainda existem no banco. Invisíveis no Estoque pelo filtro, mas são distribuições indevidas históricas. Saneamento separado com auditoria de `lancamento_id` antes de deletar.

## Pendência planejada — Botão CUSTO no Estoque (2026-06-02)

**Contexto:** serviços de fornecedores locais (gesso, esquadria, instalação, pintura) não têm NF.
Hoje o usuário usa "Entrada" no Estoque para registrar esses custos → contamina o estoque físico com itens não-materiais → gera saldos negativos e inconsistências.

**Solução acordada:** adicionar 4º botão "CUSTO" na faixa ENTRADA / SAÍDA / AJUSTE do Estoque.

**Comportamento do botão:**
- Abre modal com: Obra · Serviço/Taxa (autocomplete `movimenta_estoque=false`) · Etapa · Valor R$ · Data
- Cria apenas um `lancamentos` — sem `distribuicoes`, sem `ajustes_estoque`
- Custo aparece no P&L da obra normalmente
- Items disponíveis: catálogo filtrado por `movimenta_estoque=false` + campo livre para fornecedor não cadastrado

**O que resolve:**
- Serviços somem do estoque físico de vez
- Cimento para de ter saldo negativo por "INSTALAÇÃO DE PORTA" lançada errada
- Cada botão tem responsabilidade clara

**Pendência aberta:** definir nome final ("CUSTO" vs "SERVIÇO") e se permite digitar item livre.

## Clientes ativos
- EDR Engenharia (construtora, plano ilimitado)
- Jackson Alcantara (essencial, 3 obras)

## RLS
- Policies usam `auth_company_id()` (helper alternativo: `get_my_company_id()`) — NUNCA subquery em profiles
- ⚠️ `auth_oficina_id()` NÃO existe no EDR — é do RPM Pro (verificado no banco 2026-06-10)
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
