# EDR System V2 — Tracker de Correcoes

**Status:** V2 em manutencao. V1 ativa em producao (redirect ativo).
**Regra:** Cada fase so libera a proxima. Nao pular.
**Financeiro:** Testar LEITURA primeiro, validar com V1, so depois liberar ESCRITA.

---

## FASE 0 — Infraestrutura (base de tudo)
> Login, navegacao, visual base. Se isso nao funciona, nada funciona.

- [ ] 0.1 Login/Logout funciona sem erro
- [ ] 0.2 Navegacao sidebar troca de tela corretamente
- [ ] 0.3 CSS variables V2 aplicadas (sem texto invisivel, sem fundo branco em fundo branco)
- [ ] 0.4 Toast de notificacao funciona
- [ ] 0.5 Modais abrem e fecham
- [ ] 0.6 Mobile responsivo basico (sidebar colapsa)

**Validacao:** Navegar por todas as telas sem erro no console.

---

## FASE 1 — Obras (fundacao de tudo)
> Sem obras funcionando, nenhum outro modulo tem pra onde apontar.

- [ ] 1.1 Lista de obras carrega com dados corretos
- [ ] 1.2 Cards de obra mostram nome, cidade, valor, status
- [ ] 1.3 Criar nova obra funciona
- [ ] 1.4 Editar obra funciona
- [ ] 1.5 Arquivar/desarquivar obra funciona
- [ ] 1.6 Detalhe da obra abre (tabs: lancamentos, materiais, adicionais, CEF)
- [ ] 1.7 Filtro de obras funciona
- [ ] 1.8 Centro de custo (etapas) aparece nos selects

**Validacao:** Criar obra teste, editar, verificar que aparece na V1 tambem.
**Libera:** Fase 2

---

## FASE 2 — Catalogo de Materiais
> Sem catalogo, nao tem como lancar nota fiscal com materiais.

- [ ] 2.1 Lista de materiais carrega
- [ ] 2.2 Busca/filtro funciona
- [ ] 2.3 Cadastro de novo material funciona
- [ ] 2.4 Edicao de material funciona
- [ ] 2.5 Codigo sequencial auto-gerado

**Validacao:** Cadastrar material teste, verificar que aparece na V1.
**Libera:** Fase 3

---

## FASE 3 — Notas Fiscais + Lancamento (FINANCEIRO CRITICO)
> Aqui entra dinheiro no sistema. MAXIMO CUIDADO.

### Leitura primeiro:
- [ ] 3.1 Lista de notas carrega com dados corretos
- [ ] 3.2 Filtro por obra funciona
- [ ] 3.3 Detalhe da nota abre (itens, valores, credito)
- [ ] 3.4 Valores batem com a V1 (comparar 5 notas)

### Escrita (so apos leitura validada):
- [ ] 3.5 Formulario de nova nota abre corretamente
- [ ] 3.6 Autocomplete de materiais funciona
- [ ] 3.7 Cadastro rapido de material pelo formulario
- [ ] 3.8 Adicionar itens na nota (qtd, preco, credito)
- [ ] 3.9 Salvar nota — verificar que gera lancamento correto
- [ ] 3.10 Distribuicao de itens para obras funciona
- [ ] 3.11 Valores de lancamento batem (total = qtd x preco)
- [ ] 3.12 Credito fiscal calculado corretamente

**Validacao:** Lancar nota teste, verificar na V1 que valores estao identicos.
**RISCO:** Erro aqui corrompe dados financeiros. Testar com nota pequena primeiro.
**Libera:** Fase 4

---

## FASE 4 — Importacao XML
> Alternativa ao lancamento manual. Depende de Notas funcionando.

- [ ] 4.1 Upload de XML abre o parser
- [ ] 4.2 Preview dos itens funciona
- [ ] 4.3 Matching com catalogo funciona
- [ ] 4.4 Importar gera nota + lancamentos corretos

**Validacao:** Importar XML real, comparar com V1.
**Libera:** Fase 5

---

## FASE 5 — Estoque
> Controla saldo de materiais. Depende de Notas + Distribuicoes.

### Leitura primeiro:
- [ ] 5.1 Consolidado de estoque carrega
- [ ] 5.2 Saldos batem com a V1
- [ ] 5.3 Filtro por obra/categoria funciona

### Escrita:
- [ ] 5.4 Entrada direta (sem nota) funciona
- [ ] 5.5 Distribuicao do estoque para obra funciona
- [ ] 5.6 Ajuste de estoque (inventario) funciona
- [ ] 5.7 Saldo atualiza corretamente apos movimentacao

**Validacao:** Comparar saldo de 3 materiais com V1.
**Libera:** Fase 6

---

## FASE 6 — Diarias
> Controle de mao de obra. Depende so de Obras.

- [ ] 6.1 Quinzenas carregam
- [ ] 6.2 Lista de funcionarios carrega
- [ ] 6.3 Lancamento de diaria funciona
- [ ] 6.4 Extras/bonificacoes funciona
- [ ] 6.5 Fechamento de quinzena funciona
- [ ] 6.6 Bloqueio de quinzena fechada funciona
- [ ] 6.7 Totais de diarias batem com V1

**Validacao:** Comparar totais da ultima quinzena com V1.
**Libera:** Fase 7

---

## FASE 7 — Adicionais
> Custos extras por obra. Depende de Obras.

- [ ] 7.1 Lista de adicionais por obra carrega
- [ ] 7.2 Criar adicional funciona
- [ ] 7.3 Registrar pagamento de adicional funciona
- [ ] 7.4 Saldo (valor - pago) calcula correto
- [ ] 7.5 Status (pendente/aprovado/concluido) funciona

**Validacao:** Comparar saldos de adicionais com V1.
**Libera:** Fase 8

---

## FASE 8 — Custos + Repasses CEF (FINANCEIRO CRITICO)
> Visao consolidada de custos por obra. Depende de Lancamentos + Repasses.

### Leitura primeiro:
- [ ] 8.1 Painel de custos carrega por obra
- [ ] 8.2 Totais de lancamentos batem com V1
- [ ] 8.3 Repasses CEF listam corretamente
- [ ] 8.4 Saldo (repasse - custo) calcula correto

### Escrita:
- [ ] 8.5 Cadastrar novo repasse CEF funciona
- [ ] 8.6 Editar repasse funciona

**Validacao:** Comparar painel de custos de 2 obras com V1. Valores TEM que ser identicos.
**Libera:** Fase 9

---

## FASE 9 — Financeiro (Contas a Pagar + Creditos)
> Fluxo de caixa. Depende de Notas + Custos.

- [ ] 9.1 Contas a pagar listam corretamente
- [ ] 9.2 Filtro por status/vencimento funciona
- [ ] 9.3 Criar conta a pagar funciona
- [ ] 9.4 Baixar pagamento funciona
- [ ] 9.5 Creditos fiscais listam corretamente

**Validacao:** Comparar contas pendentes com V1.
**Libera:** Fase 10

---

## FASE 10 — Dashboard (LEITURA — depende de TUDO)
> So faz sentido depois que todos os dados estao corretos.

- [ ] 10.1 Cards de resumo carregam (obras ativas, total custos, estoque)
- [ ] 10.2 Valores financeiros batem com V1
- [ ] 10.3 Alertas e vencimentos aparecem
- [ ] 10.4 Saude das obras mostra dados corretos
- [ ] 10.5 Agenda de notas funciona
- [ ] 10.6 Perfil admin vs operacional mostra conteudo correto

**Validacao:** Screenshot V1 vs V2 lado a lado — numeros identicos.
**Libera:** Fase 11

---

## FASE 11 — Relatorio
> Relatorio mensal/por obra. Depende de tudo.

- [ ] 11.1 Relatorio mensal geral carrega
- [ ] 11.2 Relatorio por obra carrega
- [ ] 11.3 Categorias de custo agrupam corretamente
- [ ] 11.4 Valores batem com V1
- [ ] 11.5 Exportar/imprimir funciona

**Validacao:** Gerar relatorio do mes atual, comparar com V1.
**Libera:** Fase 12

---

## FASE 12 — Planejamento (Cronograma + Orcamento + PCI)
> Modulos de planejamento. Menos criticos que financeiro.

- [ ] 12.1 Cronograma carrega tarefas
- [ ] 12.2 Criar/editar tarefa funciona
- [ ] 12.3 Orcamento carrega dados
- [ ] 12.4 PCI carrega medicoes
- [ ] 12.5 PCI cards de resumo funcionam

**Libera:** Fase 13

---

## FASE 13 — Operacional (Diario + Garantias + Leads)
> Modulos do dia a dia. Independentes entre si.

- [ ] 13.1 Diario de obra carrega
- [ ] 13.2 Criar registro no diario funciona
- [ ] 13.3 Garantias lista chamados
- [ ] 13.4 Criar chamado de garantia funciona
- [ ] 13.5 Leads lista e cadastra

**Libera:** Fase 14

---

## FASE 14 — Config + Documentos
> Ultimos modulos. Menor impacto no dia a dia.

- [ ] 14.1 Banco — informacoes da empresa
- [ ] 14.2 Permissoes — perfis de usuario
- [ ] 14.3 Setup — configuracoes gerais
- [ ] 14.4 Termo de entrega gera documento
- [ ] 14.5 Manual carrega

---

## FASE 15 — Go-Live V2
> So apos TODAS as fases acima passarem.

- [ ] 15.1 Remover redirect do index.html
- [ ] 15.2 Deploy final
- [ ] 15.3 Testar login em producao
- [ ] 15.4 Navegar por todos os modulos
- [ ] 15.5 Manter /v1/ como fallback por 48h
- [ ] 15.6 Remover /v1/ apos confirmacao

---

## Legenda
- [ ] Pendente
- [x] Concluido
- [!] Com problema (descrever abaixo)

## Problemas encontrados
<!-- Anotar aqui problemas especificos por fase -->
