# Base de leitura da previa financeira

Implementacao local revisavel da base e das telas financeiras. A referencia visual e o CSS/templates integrais da previa aprovada (commit a8d9c9f28b9dbaec09ffc176a74690c0a5ae9f10), recebidos em cinco partes CSS e quatro partes de templates. O shell, autenticacao e operacoes do Caixa existente permanecem integrados ao EDR.

## Modulos

- `edr-v2-visao-financeira-dados.js`: leituras paginadas com fontes e dominios explicitamente confirmados ou indisponiveis. Empresa, ator e perfil sao verificados antes e durante a consulta. Nao inicializa Diarias, arquiva quinzenas ou grava dados.
- `edr-v2-visao-financeira-modelo.js`: filtros de periodo, obra e situacao; valores monetarios em centavos; carteira, recebiveis e movimentos com escopos diferentes; saldo exclusivo da resposta confirmada do Caixa.
- `edr-v2-visao-financeira-estado.js`: estado compartilhado de filtros e consultas, descartando respostas antigas ou de outra identidade. A memoria e somente cache de leitura e filtro, sem persistencia operacional de saldo.
- `edr-v2-visao-financeira-folha.js`: avisos de fontes e vinculos por obra/quinzena, com competencia no fim da quinzena sem rateio. Nao soma custos, recalcula diarias ou comprova cobertura de todos os dias/pagamento.
- `DREModule.criarContextoLeitura(snapshot)`: contexto privado do motor DRE existente, sem depender de globais vivos ou do carregamento administrativo legado. Preserva classificacao, tratamento dos adicionais e estimativa tributaria vigente.

Os modulos estao conectados ao `index.html` e aos pontos de montagem administrativos de Dashboard, Relatorio/Analise, Raio X e DRE. `FinanceiroVisaoPonte` publica snapshot e visao juntos; `FinanceiroVisaoContexto` deriva o contexto imutavel para apresentacao; `FinanceiroVisaoPaginas`, `FinanceiroVisaoDetalhes` e `FinanceiroVisaoUI` apresentam os dados reais. O CSS inteiro fica sob `.edr-financial`, sem substituir a navegacao ou autenticacao. O ajuste canonico de recebiveis em Dashboard/Raio-X foi aplicado uma vez nesta copia; a tarefa original permanece preservada.

## Escopos dos indicadores

| Indicador | Regra |
| --- | --- |
| Recebido e custo do periodo | Datas financeiras efetivas existentes: repasse `data_credito`, pagamento adicional `data`, lancamento `data`. Custo nao representa pagamento. |
| Contratos, adicionais previstos e recebiveis | Acumulados das obras selecionadas. Sem cronograma financeiro, nao comparar o contrato inteiro apenas com recebimentos do mes. |
| Pendencias e excedentes | Calculados antes de somar, por contrato e por adicional; excedentes nao abatem pendencias de outro item ou obra. |
| Obras ativas/arquivadas | Selecao por ID e estado `arquivada`, excluindo obras estruturais pelo criterio vigente do DRE. |
| Resultado por obra | Margem de contribuicao do motor DRE no periodo. Nao inventar rateio de despesas da empresa. |
| DRE consolidado | Empresa no periodo, abrangendo obras reais ativas e arquivadas. Filtros Obra/Situacao nao rateiam esse resultado. |
| Banco, dinheiro e total disponivel | Saldo geral atual da empresa, exclusivamente `caixa_estado`. Nao filtrado ou rateado por obra/competencia. Sem contas: abertura pendente; falha: indisponivel. |
| Obrigacoes | Separadas do disponivel. Pagamento parcial confirmado usa restante persistido. Cadastro de custo ou fechamento de folha nao comprova pagamento. |
| Folha | Fontes de leitura explicitas. Quinzena fechada representa competencia lancada. Ausencia de dados nao comprova folha completa ou paga; nao somar novamente custos FP. |

## Erros e integracao

Array vazio confirmado e erro de leitura sao estados distintos. Fonte indisponivel retorna `null` nos valores dependentes, sem converter falha em total zero. Respostas malformadas, pagina incompleta, limite de paginacao ou identidade alterada nao podem ser apresentadas como consulta confirmada. Leituras de tabelas separadas nao constituem um snapshot transacional de banco.

A UI usa uma instancia compartilhada da ponte e filtro de periodo/obra/situacao. Cada navegacao consulta novamente as fontes; mudancas de filtro derivam dados do mesmo contexto confirmado. Identidade alterada invalida resultados. O loader recebe `criarDre(snapshot)` ligado a `DREModule.criarContextoLeitura`; o Caixa continua usando `caixaProspectivoCarregar()`, com as permissoes existentes. Uma falha de apresentacao retira valores anteriores em vez de deixa-los sob um novo filtro.

Nao chamar `initDiarias` para preencher relatorios. Seu carregamento legado pode arquivar quinzenas duplicadas. Nao usar `garantirContasAdmin()` como prova de leitura confirmada: seu caminho legado pode mascarar falhas com array vazio.

## Verificacao local

```powershell
node --test tests/financeiro-falta-receber.test.js tests/visao-financeira-modelo.test.js tests/visao-financeira-dados.test.js tests/visao-financeira-estado.test.js tests/visao-financeira-integracao.test.js tests/dre-contexto-leitura.test.js
node --test tests/visao-financeira-folha.test.js
```

Com `EDR_PGLITE_PATH` apontando ao runtime local ja instalado, executar `node --test tests/visao-financeira-caixa-db.test.js` verifica o JSON canonicamente produzido pela RPC em banco sintetico descartavel. Sem esse runtime, o teste registra SKIP explicitamente.

Os testes distribuiveis usam exclusivamente fixtures sinteticas. Os ensaios Chromium carregam HTML, CSS, navegacao e modulos reais da copia isolada; apenas o transporte de leitura e sintetico. Todos os acessos externos e transportes de escrita sao bloqueados. Isso nao valida uma sessao Auth real, nem a visibilidade RLS de um usuario real.

## Limites de apresentacao

- Material e servicos continuam juntos conforme a classificacao vigente do DRE. Nao ha parcela artificial de servicos nem soma adicional de distribuicoes de estoque.
- Avanco fisico, estoque inicial/final e custo futuro nao foram consultados por estas fontes. A tela informa isso; a posicao carteira menos custo acumulado nao e apresentada como lucro futuro.
- Folha exibe diagnostico de fontes/vinculos e marcador FP. Quinzena fechada ou FP identificado nao comprova pagamento nem todos os dias trabalhados.
- Saldo geral atual permanece visivel no Painel mesmo quando a selecao de obras esta vazia. Mes anterior ao marco nao produz saldo/fluxo historico; mes do marco informa cobertura parcial.
- Exportar PDF abre uma janela de impressao com o mesmo conteudo, periodo, IDs e situacao da tela. DRE empresarial conserva alcance empresarial declarado. As referencias de fontes Google sao as ja existentes no shell; no ensaio offline elas ficam bloqueadas, portanto a comparacao local nao comprova equivalencia tipografica pixel a pixel.
- As leituras separadas nao sao uma transacao unica. Use Atualizar para uma nova consulta; nao considerar `consultadoEm` uma conciliacao bancaria.

## Banco e publicacao

Nao ha migracao nova, alteracao de seguranca ou escrita em dados reais neste pacote. As colunas utilizadas foram conferidas por leitura do esquema existente. A coleta de snapshot amplo de dados financeiros reais para validacao local foi rejeitada pela revisao automatica de aprovacao; nao foi retornado nem gravado snapshot financeiro. Essa validacao permanece pendente, sem tentativa por outra rota.

A abertura real do Caixa exige saldos atuais e marco confirmado pelo operador. Nenhum valor privado da declaracao antiga foi inserido no codigo ou presumido como saldo atual. A publicacao permanece uma etapa separada, condicionada aos testes/revisao e as autorizacoes aplicaveis; este documento nao afirma que o pacote foi publicado.
