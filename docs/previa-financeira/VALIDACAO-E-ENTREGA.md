# Telas financeiras integradas: validacao e release

Copia de implementacao isolada `edr-system-previa-completa`, branch `local/previa-financeira-completa`, base `bb463bb51b938e55f789011593e56409a5e4a2ef`. Os checkouts protegidos permanecem preservados; o patch canonico de recebiveis foi aplicado apenas uma vez nesta copia. Duam autorizou explicitamente a leitura minima agregada e a publicacao do pacote completo apos testar. A release usa outra copia isolada, `edr-system-financeiro-release-20261006`, em `dev`; resultado operacional, SHAs e propagacao ficam no relatorio final fora do Git.

## Resultado implementado

Painel/Resumo, Painel/Financeiro, Analise de Obras, Raio X e DRE agora usam o loader, modelo e contexto de leitura reais. Banco, dinheiro e total vem exclusivamente do controle prospectivo confirmado. Carteira e recebiveis acumulados, custos/recebimentos mensais e DRE empresarial possuem escopos explicitamente separados. Detalhes e exportacao capturam os mesmos IDs, fontes e filtros da tela; contrato e custo por metro quadrado usam area e valores acumulados.

As mudancas preservam operacoes existentes do Caixa, regras do DRE, Estoque, Folha, autenticacao e seguranca. Nao ha nova persistencia, migracao ou saldo operacional em memoria/localStorage. Somente filtros e respostas de leitura ficam em memoria. Fonte indisponivel nao vira zero; falha de renderer retira dados anteriores. Nao foi declarada abertura real.

## Comparacao visual realizada

Referencia: CSS integral em cinco partes e templates em quatro partes do commit `a8d9c9f28b9dbaec09ffc176a74690c0a5ae9f10`. A comparacao inspecionou os renders locais e seus componentes/classes/cascata contra esse codigo, com revisao independente. Nao equivale a comparar diretamente os seis PNGs originais, que nao foram inspecionados neste ambiente.

| Tela | Correspondencia e adaptacao de dados |
| --- | --- |
| Resumo | Cabecalho/filtros/subtabs, quatro indicadores, grade principal, grafico, No radar, faixa explicativa, recebiveis e tabela por obra. Contribuicao real separada do saldo; carteira menos custo nao promete lucro futuro. |
| Financeiro | Recebiveis no topo, indicadores de banco/dinheiro/total/variacao, movimentos e compromissos. Saldo atual empresarial substitui o caixa ficticio/rateado da demonstracao. |
| Analise | Cards responsivos, estado ativa/arquivada, pares de indicadores, detalhes e tabela. Avanco fisico nao consultado fica explicito; nenhum percentual foi inventado. |
| Raio X | Recebiveis, indicadores, composicao e diagnostico de folha. Materiais e servicos permanecem juntos pelo engine; estoque/pagamento nao sao inferidos de custo ou fechamento. |
| DRE | Tabela de duas colunas, formula/contexto e resultado por obra. Empresa mantem tributos/despesas/terreno/overhead vigentes; nao adota a formula demonstrativa. |
| Detalhes | Dialog/drawer, escopo, valor/formula, notas e origens; recebiveis por contrato e por adicional, sem compensacao de excedentes. |

CSS isolado sob `.edr-financial`; shell/sidebar/autenticacao existentes mantidos. Validado em desktop, 390 px e 320 px. Valores negativos vermelhos, valores largos mantem todos os digitos/centavos; DRE usual exibe ambas as colunas no celular e tabelas amplas conservam rolagem interna. Somente ate 360 px, os indicadores usam uma coluna para manter moedas em uma linha; 390 px conserva duas colunas. Esse breakpoint e adaptacao aos dados, nao copia identica da referencia. O formatador usa quociente/resto BigInt e preserva centavos ate o limite inteiro seguro. Fontes Google ja existentes foram mantidas no app e exportacao; ficaram bloqueadas no ensaio offline. Os icones Material Symbols do shell aparecem como palavras nas capturas por essa restricao. Nao afirmar equivalencia tipografica ou de pixels.

## Testes e evidencias

O log da regressao congelada, contagens finais, hashes e imagens ficam fora do checkout, em `task-3/evidencias/previa-completa-preparo` e `task-3/evidencias/previa-completa-ui`. O manifesto `previa-financeira-telas-entrega.json` registra os hashes dos arquivos e patch. A entrega final informa a contagem efetivamente executada; logs anteriores sao marcos historicos.

Regressao integral final apos ajustes de 320 px e centavos: **581 testes, 579 aprovados, zero falhas, dois ignorados**, em 27,770 segundos. Log `regressao-final-320-20261006.log`. Inclui **16/16 testes Chromium** das telas novas, sem falhas/skips. **29 capturas** sinteticas finais foram regeneradas no codigo final e inspecionadas pelo executor e revisores independentes. Sintaxe dos JS e `git diff --check` aprovados. Os dois ignorados sao grupos de Auth local real, sem stack ativa nesta rodada.

- Banco sintetico PGlite e PostgreSQL 17 local: abertura, corte com/sem horario, entrada/saida, transferencias/tarifas, pagamentos parciais concorrentes, idempotencia/reenvio, cancelamento, rollback e falhas atomicas.
- Chromium isolado: HTML/CSS/shell e modulos reais com transporte sintetico; filtros compartilhados, navegacao, recarga, loading, modal, PDF/print, FP e metro quadrado, nomes nulos, renderer com erro, fontes faltantes, saldo sem abertura e valores largos.
- Regressao de regras existentes incluindo DRE, recebiveis, estoque e folha; fechamento ja pago nao cria pagamento nem desconta saldo novamente.
- Dois grupos opcionais de Auth local real ficam explicitamente ignorados nesta rodada, pois a stack esta parada. Nao prova sessao/RLS de producao. Agenda operacional nao foi aberta nem testada.

## Como visualizar

As capturas PNG sinteticas estao em `task-3/evidencias/previa-completa-ui`. Para uma navegacao local sintetica opcional, a partir de `task-3`:

```powershell
node .tooling/visualizar-financeiro-sintetico.cjs
```

O comando imprime uma URL aleatoria em `127.0.0.1`; abra manualmente em nova aba. Nao abre nem controla uma janela existente. A faixa informa ENSAIO SINTETICO; CSP bloqueia conexoes externas, o transporte recusa escritas e POST e arquivos fora do escopo retornam erro. Ctrl+C encerra. Isso nao e persistencia operacional nem autenticacao real. O helper foi verificado em processo descartavel e encerrado.

## Pendencias e implantacao

A coleta ampla de snapshot financeiro real foi negada pela revisao automatica; uma unica tentativa, sem dados retornados/arquivo criado e sem repeticao/rota alternativa. Campos, consulta e erro literal foram registrados fora do Git. A alternativa minima foi posteriormente autorizada por Duam e executada somente em memoria: agregados por obra/mes/classe e contagens de Caixa, sem dados de funcionarios, nomes, contatos ou documentos na resposta. Nenhum valor/linha financeira foi salvo; somente conformidade e contagens de verificacoes foram registradas fora do Git. Modelo, engine e filtros concordaram com os oraculos SQL, sem divergencias. O mesmo SELECT minimo foi repetido uma vez apos erro local no parser do envelope; a primeira resposta foi descartada em memoria.

Limite dessa leitura: nomes sao reconstruidos de flags SQL e administracao chega previamente filtrada pelo SQL; o resultado nao comprova independentemente esses predicados originais. Nao valida folha, estoque, saldos/pagamentos de Caixa nem Auth/RLS. SQL e comparador passaram ensaios sinteticos privados independentes antes da leitura. Valores brutos DRE e centavos arredondados por origem do modelo foram preservados separadamente.

A negativa anterior de deploy foi registrada e nao contornada. A nova autorizacao humana explicita permite uma nova tentativa da mesma acao, somente apos este pacote estar testado e revisado. A skill local `edr-release-checklist` descreve deploy pelo operador via `./deploy.sh`; a instrucao explicita atual de Duam autoriza o executor a publicar. O script real exige branch `dev`, checkout limpo, referencias remotas atualizadas e fast-forward para `main`; faz cache busting e push. Nenhum push manual, troca de rota ou `SKIP_CHECK` deve substituir esse fluxo. Se a revisao automatica negar novamente, parar e entregar handoff concreto ao operador.

Antes de implantar: revisar/aplicar o patch integral uma vez em copia de release limpa e atualizada, conferir arquivos explicitos e repetir verificacoes se houver reconciliacao; comitar localmente em `dev` e executar o `deploy.sh` autorizado. Nao aplicar conjuntamente o patch anterior de dados ou o patch original de recebiveis, pois o pacote integral ja inclui ambos. Nenhuma migracao nova e necessaria. Confirmar refs `dev/main`, CI/Pages, hashes publicados de HTML/JS/CSS e cache apos publicacao. Nao declarar interface autenticada validada pela mera propagacao dos arquivos.

## Rollback do pacote

Esta release tem um commit funcional seguido do commit de cache produzido por `deploy.sh`. O `rollback.sh` existente reverte somente HEAD; sozinho ele desfaz o cache, nao a funcionalidade. Para retirar o pacote, usar o SHA do commit funcional registrado no relatorio final, em copia limpa `dev` atualizada: `git revert <SHA_FUNCIONAL> --no-edit`, revisar o diff e executar `./deploy.sh "rollback: telas financeiras"` pelo operador autorizado. Nao reverter somente o commit de cache e nao forcar/resetar refs remotas. O procedimento e descrito, nao executado nesta entrega.

A reversao integral do patch foi ensaiada em copia local descartavel contra a base, sem push. Ela restaura as telas anteriores e preserva o Caixa prospectivo ja existente na base. Nao remove schema nem dados, pois este pacote nao aplica migracao. Conferir novamente propagacao/cache apos qualquer rollback; o commit de recuperacao deve incluir exatamente a reversao funcional revisada.

Abertura de Caixa exige saldos atuais e marco confirmado separadamente pelo operador; nao usar a fotografia privada antiga como saldo atual. Historico anterior continua sem conciliacao. Nao registrar pagamentos reais, cobrancas ou abertura durante a homologacao.
