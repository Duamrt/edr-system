# EDR System V2 — Test Spec

> Gerado em 2026-04-16. Base para testes Playwright no maestro-qa-tests.
> Usuários de teste: admin@edreng.com.br (admin), elyda@edreng.com.br (operacional)

---

## Stack
- HTML + CSS + JS vanilla + Supabase
- SPA: tudo em `index.html` — navegação via `data-view`
- Auth: Supabase Auth → token salvo em `localStorage.edr_auth`
- Deploy: `sistema.edreng.com.br` (GitHub Pages)

---

## Páginas separadas (fora do SPA)

| Página | URL | O que faz |
|--------|-----|-----------|
| `index.html` | `/` | App principal (SPA) — login + todos os módulos |
| `landing.html` | `/landing.html` | Landing pública de vendas |
| `novo-cliente.html` | `/novo-cliente.html` | Onboarding de novo tenant |
| `acompanhar.html` | `/acompanhar.html` | Portal público de acompanhamento de obra |
| `relatorio-obra.html` | `/relatorio-obra.html` | PDF de relatório de obra |
| `termo-entrega.html` | `/termo-entrega.html` | Termo de entrega |
| `agenda.html` | `/agenda.html` | Agenda (módulo separado) |
| `tracker.html` | `/tracker.html` | Tracker interno |

---

## Módulos do SPA (data-view)

### 🔴 CRÍTICOS — não podem quebrar

| View | Módulo | O que deve funcionar |
|------|--------|---------------------|
| `dashboard` | Dashboard | Carrega cards de resumo (obras, caixa, equipe), sem erro JS |
| `obras` | Obras | Lista obras, abre modal de nova obra, salva, aparece na lista |
| `caixa` | Caixa/Financeiro | Lista lançamentos, novo lançamento aparece, saldo atualiza |
| `estoque` | Estoque | Lista itens, entrada/saída registra, saldo atualiza |
| `diarias` | Diárias | Lista diárias por quinzena, nova diária salva sem duplicata |
| `pci` | PCI Medições | Abre só com cronograma vinculado, itens marcam/desmarcam |

### 🟡 IMPORTANTES

| View | Módulo | O que deve funcionar |
|------|--------|---------------------|
| `custos` | Custos | Lista custos por obra, novo custo salva |
| `cronograma` | Cronograma | Carrega Gantt, tarefas visíveis |
| `notas` | Notas Fiscais | Lista NFs, nova NF registra entrada no estoque |
| `contas-pagar` | Contas a Pagar | Lista contas, marcar como pago atualiza |
| `relatorio` | Relatório | Gera sem erro, PDF abre |
| `leads` | Leads | Lista leads, novo lead salva |

### 🟢 OPERACIONAIS

| View | Módulo |
|------|--------|
| `orcamento` | Orçamento de obra |
| `adicionais` | Itens adicionais |
| `garantias` | Garantias |
| `diario` | Diário de obra |
| `catalogo` | Catálogo de materiais |
| `creditos` | Créditos fiscais |
| `banco` | Usuários e configurações |
| `permissoes` | Permissões por usuário |
| `setup` | Configurações da empresa |
| `termo` | Termo de entrega |
| `manual` | Manual do sistema |

---

## Fluxos Críticos (não podem quebrar)

### F1 — Login com credencial válida
1. Acessar `sistema.edreng.com.br`
2. Preencher email + senha
3. Clicar ENTRAR
4. **Esperado:** login-screen some, app-shell aparece, dashboard carrega

### F2 — Login com credencial inválida
1. Preencher email errado
2. **Esperado:** mensagem de erro visível, não entra no app

### F3 — Criar nova obra
1. Estar logado como admin
2. Ir para view `obras`
3. Clicar em nova obra, preencher nome + tipo
4. Salvar
5. **Esperado:** obra aparece na lista sem recarregar página

### F4 — Lançar custo em obra
1. Abrir obra existente
2. Ir para view `custos`
3. Novo custo → categoria + valor + data
4. **Esperado:** custo aparece na lista, saldo da obra atualiza

### F5 — Entrada de estoque
1. Ir para view `estoque`
2. Nova entrada → item + quantidade + valor
3. **Esperado:** item aparece com saldo atualizado

### F6 — Registrar diária
1. Ir para view `diarias`
2. Selecionar quinzena ativa + funcionário + valor
3. Salvar
4. **Esperado:** diária aparece, sem duplicata

### F7 — Logout
1. Clicar em sair
2. **Esperado:** volta para login-screen, `localStorage.edr_auth` limpo

---

## Regras de Negócio Críticas

- RLS por `company_id` — EDR só vê dados da EDR, Jackson só vê os dele
- `get_my_company_id()` — função RLS central, nunca subquery em profiles
- PCI só abre se obra tiver cronograma vinculado
- Diárias: bloqueio de duplicata por quinzena — mesmo funcionário na mesma quinzena = erro
- Permissões: `company_users.permissions` JSONB — usuário sem permissão não vê o módulo
- Deploy: versão no rodapé E no console (`console.log` estilizado)

---

## Credenciais de Teste

> Usar conta admin — tem acesso completo a todos os módulos

```
EMAIL=admin@edreng.com.br
PASSWORD=(ver .env do maestro-qa-tests)
URL=https://sistema.edreng.com.br
```

---

## Notas de Implementação para Playwright

- Auth usa `localStorage.edr_auth` (não cookie) — pode setar direto no teste para pular tela de login
- Navegação entre módulos: `document.querySelector('[data-view="obras"]').click()`
- Modais: `classList.remove('hidden'); classList.add('active')` — testar abertura e fechamento
- Aguardar dados: esperar `.list-item` ou elemento específico do módulo após clicar no nav
