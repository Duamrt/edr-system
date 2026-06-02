# EDR System V2 — Inventário Técnico
> Gerado 2026-06-02 | Read-only | Base para auditorias futuras
> Módulos JÁ AUDITADOS nesta sessão: Estoque, Notas Fiscais, DRE, Financeiro/Painel, P&L/Relatório, Raio-X

---

## MÓDULOS

### 1. Obras
- **Arquivo:** `js/edr-v2-obras.js`
- **Tabelas:** `obras`, `lancamentos`, `distribuicoes`, `centros_custo`, `cronograma_tarefas`
- **Funções principais:** `renderObrasCards`, `obrasAbrirDetalhe`, `filtrarLanc`, `editarLancamento`, `deletarLancamento`, `abrirModalConclusao`
- **Fluxos críticos:** Detalhe da obra → lançamentos em lista → editar/excluir lançamento; conclusão de obra com geração de termo
- **Dependências:** EstoqueModule (distribuições vinculadas ao lancamento_id), CronogramaModule
- **Riscos prováveis:**
  - `deletarLancamento` deleta distribuições em cascata via `distribuicoes?lancamento_id=eq.X` — se um lancamento tiver múltiplas distribuições, todas somem silenciosamente
  - `editarLancamento` atualiza campos do lançamento mas não revalida distribuição (qtd/preco podem ficar dessincronizados)
  - `filtrarLanc` opera em memória — sem reload do banco antes de exibir

---

### 2. Custos (Repasses CEF + Contrato)
- **Arquivo:** `js/edr-v2-custos.js`
- **Tabelas:** `repasses_cef`, `obras`, `lancamentos`
- **Funções principais:** `_custosRenderCards`, `custosAbrirDetalhe`, `custosAbrirModalRepasse`, `custosAbrirModalContrato`, `_custosRenderResumoFinanceiro`
- **Fluxos críticos:** Repasse CEF → recebimento da obra; Contrato → valor de venda; histórico mensal por obra
- **Dependências:** Raio-X (recebContrato), Relatório (pgtosMes/repassesMes), DRE
- **Riscos prováveis:**
  - `new Date(r.data_credito + 'T12:00:00')` — safe (tem sufixo T12)
  - `new Date(mes + '-15')` — safe (dia 15, sem timezone shift)
  - Sem paginação em `repasses_cef` — pode truncar obras com muitos repasses

---

### 3. Adicionais
- **Arquivo:** `js/edr-v2-adicionais.js`
- **Tabelas:** `obra_adicionais`, `adicional_pagamentos`
- **Funções principais:** `AdicionaisModule` (load, render), `salvarAdicional`, `salvarPagamentoAdicional`
- **Fluxos críticos:** Adicional aprovado → pagamentos parciais → status concluido automático
- **Dependências:** Raio-X (recebExtras, extrasReceber), Relatório (entradas)
- **Riscos prováveis:**
  - Status 'concluido' calculado por threshold de valor pago — se valor pago > valor do adicional (desconto manual?), pode travar status
  - `sbGet('obra_adicionais')` sem paginação — limite 1000 implícito do PostgREST

---

### 4. Leads / CRM
- **Arquivo:** `js/edr-v2-leads.js`
- **Tabelas:** `leads`, `lead_historico`
- **Funções principais:** `LeadsModule`, `_leadsAbrirModal`, `_leadsBuildKanban`, `_leadsSalvar`, `_leadsConverter`
- **Fluxos críticos:** Lead criado → histórico de interações → conversão em obra
- **Dependências:** ObrasModule (ao converter lead em obra)
- **Riscos prováveis:**
  - `new Date(h.criado_em)` apenas para display — sem impacto financeiro
  - Conversão de lead em obra: cria a obra mas não arquiva o lead automaticamente (pode ficar duplicado no kanban)

---

### 5. Diárias
- **Arquivo:** `js/edr-v2-diarias.js`
- **Tabelas:** `diarias`, `diarias_funcionarios`, `diarias_quinzenas`, `diarias_extras`, `lancamentos`
- **Funções principais:** `DiariasModule`, `diarInterpretar`, `diarParseMensagem`, `adicionarDiariaManual`, `_diarAutoLancarPL` (DESATIVADO)
- **Fluxos críticos:** Voz/manual → `diarParseMensagem` → registro de diária → botão "Lançar FP" → `lancamentos` (etapa 28_mao)
- **Dependências:** lancamentos (custo mão de obra), P&L/Relatório
- **Riscos prováveis:**
  - `_diarAutoLancarPL` DESATIVADO por gotcha (duplicata), mas código ainda existe — se alguém "reativar" por engano, cria duplicatas silenciosas (índice único rejeita no banco, mas pode gerar erros ocultos)
  - Parse de texto livre pode interpretar mal nomes de funcionário ou obra → lançamento no lugar errado
  - Quinzena bloqueada por período: validação de duplicata antes de inserir — checar se está ok
  - `new Date(dia + 'T12:00:00')` em vários lugares — safe (T12)

---

### 6. Garantias
- **Arquivo:** `js/edr-v2-garantias.js`
- **Tabelas:** `garantia_chamados`
- **Funções principais:** `GarantiasModule`, `_garantiasAbrirModal`, `_garantiasSLA`, `_garantiasBindFotos`
- **Fluxos críticos:** Chamado aberto → atualização status → fotos → SLA calculado
- **Dependências:** obras (obraMap para nome)
- **Riscos prováveis:**
  - Upload de fotos sem validação de tamanho (pode estourar storage)
  - SLA calculado em runtime, não armazenado — se fórmula mudar, histórico antigo muda retroativamente
  - Baixo risco financeiro

---

### 7. Orçamento
- **Arquivo:** `js/edr-v2-orcamento.js`
- **Tabelas:** não mapeadas (módulo compacto, `OrcamentoModule` com poucas funções identificadas)
- **Fluxos críticos:** desconhecido — precisa auditoria
- **Riscos prováveis:** se gerar lançamentos de custo planejado, pode cruzar com P&L real

---

### 8. PCI Medições
- **Arquivo:** `js/edr-v2-pci.js`
- **Tabelas:** `pci_medicao`, `pci_itens`, `pci_historico`, `pci_categorias_template`, `pci_sub_servicos_template`, `pci_template_padrao`, `cronograma_tarefas`
- **Funções principais:** `PciModule` (render, salvarItem, gerarMedicao, sincronizarCronograma)
- **Fluxos críticos:** Medição → itens com pesos → snapshot histórico → sincroniza % do cronograma
- **Dependências:** CronogramaModule (atualiza progresso das tarefas)
- **Riscos prováveis:**
  - `pci_sub_servicos_template` foi truncada 2026-05-11 — seed antigo NÃO rodar
  - Snapshot histórico via `sbPost('pci_historico', snap)` pode duplicar se botão clicado 2x (sem idempotência)
  - 62 etapas `_DUAM_SUBS` em CronogramaModule — alterar é alterar PCI também

---

### 9. Dashboard
- **Arquivo:** `js/edr-v2-dashboard.js`
- **Tabelas:** `agenda_notas` (própria); demais dados lidos de memória (lancamentos, obras, repasses_cef, adicionais)
- **Funções principais:** `DashboardModule`, `_dashCalcMetricas`, `_dashBuildKPIs`, `_dashBuildResumoFinanceiro`, `dashFinSetFiltro`
- **Fluxos críticos:** KPIs financeiros calculados de arrays em memória; agenda de notas; resumo financeiro por obra
- **Dependências:** todos os módulos carregados no boot
- **Riscos prováveis:**
  - `_dashCalcMetricas` depende de `lancamentos[]`, `repassesCef[]`, `adicionaisPgtos[]` em memória — se boot incompleto ou race condition, KPIs ficam errados silenciosamente
  - Sem indicador visual de "dados carregando" — usuário vê zero como se fosse real
  - `_dashFinCalcObra` — cálculo complexo, pode divergir do P&L/DRE se fórmulas diferirem

---

### 10. Diário de Obra
- **Arquivo:** `js/edr-v2-diario.js`
- **Tabelas:** `diario_registros`
- **Funções principais:** `DiarioModule`, salvar/editar/listar relatos + fotos
- **Dependências:** obras (seleção de obra)
- **Riscos prováveis:** baixo (não financeiro); paginação de fotos pode ser lenta em obras com muitos registros

---

### 11. Financeiro / Contas a Pagar *(parcialmente auditado)*
- **Arquivo:** `js/edr-v2-financeiro.js`
- **Tabelas:** `contas_pagar`, `projecoes_caixa`, `companies` (saldo_manual)
- **Fluxos críticos:** Conta paga → cria lançamento em `lancamentos`; projeções de caixa; saldo manual
- **Riscos já cobertos:** deduplicação por obs (P0 da auditoria desta sessão)

---

### 12. Importar NF (parser XML)
- **Arquivo:** `js/edr-v2-importar.js`
- **Tabelas:** `notas_fiscais`, `material_depara`, `lancamentos`, `distribuicoes`
- **Funções principais:** `ImportModule`, vinculação de material via de-para, frete rateado
- **Fluxos críticos:** XML → parse → de-para → lançamento + distribuição (se movimenta_estoque=true)
- **Riscos:** auditado nesta sessão

---

## RANKING POR RISCO

### P0 — pode distorcer dinheiro, estoque ou obra
| # | Módulo/Fluxo | Motivo |
|---|---|---|
| 1 | **Obras › deletarLancamento** | Deleta distribuições em cascata sem confirmação de impacto no estoque |
| 2 | **Diárias › _diarAutoLancarPL** | Código morto mas presente — reativação acidental duplica custos de mão de obra |
| 3 | **Financeiro › conta paga → lançamento** | Deduplicação por obs pode falhar em edge cases (obs genérica) |
| 4 | **Orçamento** | Totalmente não auditado — risco desconhecido |

### P1 — pode quebrar operação
| # | Módulo/Fluxo | Motivo |
|---|---|---|
| 5 | **PCI › snapshot duplicado** | Sem idempotência no sbPost do histórico |
| 6 | **Dashboard › boot incompleto** | KPIs calculados de memória sem fallback |
| 7 | **Adicionais › sem paginação** | Pode truncar silenciosamente empresas com muitos adicionais |

### P2 — melhoria / UX / organização
| # | Módulo/Fluxo | Motivo |
|---|---|---|
| 8 | **Leads › conversão** | Lead convertido não é arquivado automaticamente |
| 9 | **Garantias › fotos** | Sem validação de tamanho |
| 10 | **Dashboard › divergência** | `_dashFinCalcObra` pode divergir do DRE se fórmulas saírem de sync |

---

## FLUXOS TRANSVERSAIS MAIS PERIGOSOS

1. **NF → Importar → Lançamento + Distribuição → Estoque → DRE/P&L** *(auditado)*
2. **Diária → Parse → Lançamento mão de obra → P&L/DRE** *(não auditado)*
3. **Conta paga → Lançamento admin → Caixa → DRE** *(parcialmente auditado)*
4. **Obra: excluir lançamento → distribuições em cascata** *(não auditado)*
5. **Repasse CEF → recebimento → Raio-X/P&L** *(auditado)*

---

## SUGESTÃO DE AUDITORIA — PRÓXIMAS SESSÕES

| Sessão | Foco | Por quê |
|---|---|---|
| S1 | Obras › deletarLancamento + editarLancamento | P0, exclusão com cascata sem guard |
| S2 | Diárias › parse + _diarAutoLancarPL | P0, bomba relógio de código desativado |
| S3 | Orçamento (módulo desconhecido) | Completamente não mapeado |
| S4 | Dashboard › divergência _dashFinCalcObra vs DRE | P2 mas pode confundir Elyda |
| S5 | PCI › snapshot idempotência | P1 operacional |

---

## PONTOS JÁ COBERTOS (não repriorizar)
- Estoque: paginação, tipo_item, movimenta_estoque, zeragem negativos ✅
- Notas Fiscais: exclusão transacional, processamento distribuições ✅
- DRE: custo duplicado CT-e, frete rateado ✅
- Financeiro/Painel: duplicidade histórica, contas a pagar ✅
- P&L/Relatório: toggle obras, gráfico mensal, acumulado anual ✅
- Raio-X: recebContrato vs recebExtras, status ALMOX ✅
- Alertas: obra nova sem lançamento (falso positivo) ✅
- Catálogo: tipo_item, movimenta_estoque, badges, seed 17 itens ✅
