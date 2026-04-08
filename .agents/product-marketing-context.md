# Product Marketing Context — EDR System

*Last updated: 2026-04-08*

## Product Overview
**One-liner:** ERP completo para construtoras — do lançamento de custos ao repasse da Caixa, tudo em um sistema.
**What it does:** Controla obras do início ao fim: etapas, lançamentos, fluxo de caixa, folha quinzenal, cronograma Gantt, PCI/MCMV, notas fiscais, CRM de leads, garantias pós-entrega e relatório de P&L. Multi-tenant, com perfis de acesso por função.
**Product category:** ERP para construção civil / Software de gestão de obras
**Product type:** SaaS
**Business model:** Assinatura mensal por construtora (multi-tenant)

## Target Audience
**Target companies:** Construtoras de pequeno e médio porte, com foco em obras MCMV (Minha Casa Minha Vida), casas térreas, conjuntos habitacionais — regiões do interior nordeste e similares.
**Decision-makers:** Sócio/dono da construtora, engenheiro responsável, administrador financeiro.
**Primary use case:** Controlar custos e etapas de múltiplas obras simultaneamente, integrado com repasses CEF/MCMV.
**Jobs to be done:**
- "Quero saber se essa obra está dando lucro antes de terminar"
- "Quero gerar a folha dos peões sem precisar de planilha"
- "Quero saber quando chega o próximo repasse da Caixa e quanto já gastei"
**Use cases:**
- Registrar diárias de mão de obra e fechar quinzena com PDF
- Acompanhar medições e repasses CEF (PLS, entrada, FGTS, subsídio)
- Gerar cronograma Gantt a partir da PCI automaticamente
- Lançar nota fiscal XML e classificar automaticamente por etapa
- Ver P&L por obra com margem bruta/líquida

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Dono da construtora | Lucro, controle financeiro, visão geral | Não sabe o custo real de cada obra | Dashboard + P&L por obra |
| Engenheiro/gestor | Cronograma, etapas, PCI, medições | Controle manual em planilhas fragmentadas | Gantt + PCI + lançamentos integrados |
| Mestre de obras | Presença, diárias, materiais usados | Anotar tudo no caderno | Diário de obra + folha quinzenal |
| Administrativo/financeiro | Notas fiscais, contas a pagar, caixa | Conciliar NF com gastos da obra | Importação XML + classificação automática |

## Problems & Pain Points
**Core problem:** Construtoras do segmento MCMV gerenciam obras complexas com planilhas Excel, cadernos e WhatsApp — sem visibilidade de custo real, sem integração com os repasses da Caixa, sem controle de mão de obra.
**Why alternatives fall short:**
- Excel: não tem multi-obra, não calcula quinzena, não gera PDF, não integra com CEF
- Sistemas genéricos (ERPs): caros, complexos, sem entendimento de MCMV/PCI
- Sienge/similares: voltados para médias/grandes construtoras, preços de R$1.500+/mês
**What it costs them:** Erro em medição CEF = repasse atrasado = obra parada. Sem controle de custo = margem negativa sem saber.
**Emotional tension:** "Não sei se estou ganhando ou perdendo nessa obra." / "Meu mestre não anota nada direito."

## Competitive Landscape
**Direct:** Sienge, Obra Fácil, BuilderBox — caros, complexos, não falam MCMV
**Secondary:** Excel + Google Sheets — gratuito mas sem automação, sem PDF, sem integração
**Indirect:** Contador externo + planilha — lento, caro, sem visibilidade em tempo real

## Differentiation
**Key differentiators:**
- Único com PCI/MCMV integrado nativamente (20 categorias, 70+ serviços, pesos percentuais)
- Folha quinzenal integrada ao sistema (não é módulo separado)
- Importação XML de NF-e com classificação automática por etapa
- Geração de Termo de Entrega conforme NBR 15575 (garantias pós-venda)
- Cronograma Gantt com import automático da PCI
- Multi-tenant com isolamento por construtora

**Why customers choose us:** Feito por quem entende MCMV, no idioma do construtor brasileiro.

## Objections
| Objection | Response |
|-----------|----------|
| "É caro" | Quanto você perde por obra sem controle de custo? R$399/mês é 1 diária de pedreiro. |
| "Vou ter que aprender tudo" | Sistema foi feito pra funcionar no dia a dia da obra. Mestre usa, engenheiro usa. |
| "Tenho planilha que funciona" | Planilha não fecha quinzena, não importa XML, não gera Gantt, não calcula P&L. |

**Anti-persona:** Construtoras grandes (acima de 20 obras simultâneas) que precisam de ERP corporativo com SAP/integração fiscal avançada.

## Switching Dynamics
**Push:** Planilha perdida, erro de medição, repasse atrasado, folha errada, margem negativa sem saber.
**Pull:** Ver P&L em tempo real, fechar quinzena em minutos, cronograma automático.
**Habit:** "Sempre fiz no Excel, funciona."
**Anxiety:** "E se eu perder dados?" / "Minha equipe vai usar?"

## Customer Language
**How they describe the problem:**
- "Não sei quanto essa obra tá me custando de verdade"
- "Meu mestre perde a anotação das diárias"
- "Fico no WhatsApp tentando controlar tudo"
- "A Caixa pediu a planilha de medição e não tinha"
**Words to use:** obra, etapa, medição, repasse, quinzena, diária, mestre, PCI, MCMV, margem
**Words to avoid:** sprint, pipeline, milestone, deploy, KPI (muito tech)
**Glossary:**
| Term | Meaning |
|------|---------|
| PCI | Planilha de Custos Indiretos (exigida pela Caixa no MCMV) |
| Medição | Etapa de vistoria da Caixa para liberar repasse |
| Quinzena | Período de pagamento de mão de obra (15 dias) |
| Repasse | Desembolso da Caixa conforme medição aprovada |
| Diária | Pagamento por dia trabalhado |

## Brand Voice
**Tone:** Direto, prático, sem frescura — fala o idioma da obra.
**Style:** Simples, concreto, sem jargão de startup.
**Personality:** Confiável, competente, feito pra quem constrói de verdade.

## Proof Points
**Metrics:** Sistema rodando em produção com obras reais desde 2025. Multi-tenant ativo.
**Customers:** EDR Engenharia (Jupi-PE) — construtora com obras MCMV ativas.
**Value themes:**
| Theme | Proof |
|-------|-------|
| Controle de custo real | P&L por obra com 38 centros de custo |
| Integração MCMV/CEF | 20 categorias PCI + rastreamento de repasses |
| Folha integrada | Quinzena com PDF gerado automaticamente |
| Cronograma automático | Gantt importa PCI com 1 clique |

## Goals
**Business goal:** Captar construtoras MCMV do nordeste e interior do Brasil como clientes SaaS.
**Conversion action:** Cadastro no formulário de novo cliente (novo-cliente.html) ou contato via WhatsApp.
**Current metrics:** Em lançamento.
