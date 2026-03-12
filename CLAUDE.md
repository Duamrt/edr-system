# EDR System — Sistema de Gestão

Sempre responda em português brasileiro.

## Projeto
- **Stack:** HTML + CSS + JS vanilla + Supabase (PostgreSQL)
- **Deploy:** GitHub Pages (branch main) → sistema.edreng.com.br
- **Branches:** `dev` (desenvolvimento) → merge para `main` (produção)
- **Servidor local:** `npx serve -s .`

## Estrutura
- `index.html` — HTML principal
- `css/styles.css` — CSS externo (inclui mobile completo)
- `js/` — 20 módulos JS (ver ordem de carregamento abaixo)

## Ordem de carregamento dos scripts (IMPORTANTE)
config → demo → api → utils → diarias → relatorio → estoque → obras → adicionais → notas → importar → fiscal → banco → catalogo → dashboard → custos → menu → ui → auth → app

**Cuidado:** funções chamadas no top-level de um módulo devem estar definidas em módulos carregados ANTES dele.

## Camada de API (js/api.js) — CENTRALIZADA
- Todo acesso ao Supabase passa por api.js — zero fetch direto nos módulos
- `sbGet`, `sbPost`, `sbPostMinimal`, `sbPatch`, `sbDelete`

## Centro de Custo / Etapas
- **Fonte única:** array `ETAPAS` em `obras.js` — 36 categorias numeradas (01-36)
- **Mapa de aliases:** `ETAPA_ALIAS` em `relatorio.js`
- Todos os selects são dinâmicos via JS, nenhum hardcoded no HTML

## Autenticação
- Login por usuário/senha (NÃO usa Supabase Auth)
- Perfis: admin, operacional, mestre, visitante
- Sessão via localStorage (admin=30d, operador=8h)

## Regras
- Não criar arquivos desnecessários
- Commitar com frequência em progresso significativo
- Testar sempre com `npx serve -s .`
- Salvar contexto na memória quando pedido
