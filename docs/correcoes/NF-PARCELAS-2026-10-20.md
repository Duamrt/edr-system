# NF e contas a pagar: parcelas independentes

Estado em 22/10/2026: correção validada, com publicação funcional autorizada pelo usuário. A evidência de implantação registra separadamente o build efetivamente disponível.

## Resultado e diagnóstico

O modal anterior gravava uma única conta, com valor fixo recebido da NF e apenas um vencimento. O parser não extraía cobrança. A edição do Financeiro também só representava uma conta, sem desdobramento.

Foi localizado em Downloads o XML da NF 211923/1. Inspeção restrita à cobrança:

| Campo | Valor |
|---|---|
| Total da NF (`vNF`) | R$ 1.854,17 |
| Fatura original (`cobr/fat/vOrig`) | R$ 1.854,17 |
| Fatura líquida (`cobr/fat/vLiq`) | R$ 1.854,17 |
| Desconto da fatura (`vDesc`) | Ausente |
| Duplicatas (`cobr/dup`) | Ausentes |

Esse XML não informa valores/vencimentos dos dois boletos. Nenhuma divisão igual, desconto ou data foi inferida. O nome do arquivo contém chave fiscal e foi omitido. Nenhuma conta/NF real, tela aberta, credencial, policy ou permissão foi alterada.

## Comportamento preparado

- Na importação, captura `cobr/fat` e todas as `cobr/dup`, inclusive `nDup`, `dVenc` e `vDup`. Valores ausentes continuam ausentes. Prefixos XML são aceitos.
- O modal de pagamento tem linhas adicionáveis/removíveis, cada uma com identificador opcional, valor e vencimento próprios. Sem duplicatas no XML, começa vazio. Novas linhas não recebem valor ou data presumidos.
- Total da NF, fatura original, desconto da fatura, fatura líquida e soma das parcelas aparecem separados. Divergências pedem conferência explícita, mas não impõem igualdade. Campos financeiros obrigatórios inválidos não são enviados.
- Pagamento à vista continua disponível, com uma parcela e confirmação da data real de pagamento. Continua não criando movimento de caixa automaticamente.
- O Financeiro permite desdobrar uma conta pendente. A primeira parcela reutiliza o ID original, as demais recebem novos IDs; a conta inteira antiga não é conservada em duplicidade. Alteração da soma exige confirmação e motivo.
- Contas pagas, com baixa, vinculadas ao Caixa, reembolsos e despesas operacionais automáticas não são desdobradas. Parcelas já registradas voltam ao mesmo editor para revisão com histórico.
- Despesas operacionais que o fluxo existente já marcou como pagas são mostradas como alerta. O sistema não desconta esses valores dos boletos nem redistribui automaticamente; é necessária conferência para evitar duplicação.
- Gravação de todas as parcelas em uma transação. O mesmo UUID de operação recupera a confirmação sem duplicar, inclusive após perda de resposta e recarga do navegador. Divergência do pedido original é rejeitada.
- Histórico durável registra pedido, autor, instante, estado anterior, totais e IDs. Exclusão de contas com esse histórico é impedida; mudanças financeiras precisam acrescentar um novo registro de revisão. Pagamentos pelo Caixa continuam sujeitos às regras existentes.
- A exclusão de NF agora exige consulta financeira bem-sucedida. Erro de rede/leitura não é tratado como ausência de contas. O vínculo usa UUID e conserva o fallback legado por número e fornecedor.
- O banco também impede que uma aba antiga insira outra obrigação integral depois do parcelamento. INSERT legado e RPC usam a mesma ordem de locks: Caixa, NF e conta. Ambas as ordens da disputa foram testadas com conexões independentes.

## Arquivos

- `js/edr-v2-importar.js`: leitura da cobrança e transporte no contexto.
- `js/edr-v2-parcelas.js`: editor compartilhado, validação em centavos, recuperação local e RPC.
- `js/edr-v2-notas.js`: integração pós-importação e consulta financeira antes da exclusão.
- `js/edr-v2-financeiro.js`: desdobramento, revisão, indicador de histórico e proteções.
- `index.html`: carregamento do módulo.
- `sql/contas-parcelamento-DRAFT.sql`: proposta de coluna/histórico, RPC atômica e proteção de integridade. `SECURITY INVOKER`, sem GRANT/REVOKE ou mudança de RLS.
- Testes novos de cobrança XML, interface, banco e exclusão; regressões de integridade/NF atualizadas para o novo contrato.

## Validação em 22/10/2026

188 testes passaram, sem falhas ou testes ignorados: 88 de XML/interface/integração e regressões de NF/estoque/financeiro, 20 de banco PGlite, 8 de concorrência em PostgreSQL 17.11 nativo e 72 de regressão do pagamento/recibo/Caixa já publicados. Houve revisão visual desktop e mobile e revisão independente do SQL e dos locks.

Os cenários sintéticos incluem R$ 927,08 em 28/10/2026 e R$ 927,09 em 04/11/2026 (soma R$ 1.854,17), além de R$ 413,75 em 05/11/2026 e R$ 413,76 em 12/11/2026 (soma R$ 827,51). Os créditos informativos de R$ 162,97 e R$ 340,46 não foram abatidos automaticamente.

Schema, políticas, privilégios, auditoria e funções do Caixa/exclusão instalados em produção foram conferidos somente em leitura. O contrato restringe a RPC ao administrador ativo da mesma empresa, sem elevar privilégios. O pagamento existente modifica status/data de pagamento, compatíveis com a proteção do histórico. A coluna `parcelamento` não substitui a auditoria existente. Não é necessária mudança de permissões, RLS, credenciais ou configuração de segurança.

## Limites e publicação

Contas/NFs que já estejam duplicadas ou órfãs não foram saneadas. Essa correção previne novos problemas no fluxo e protege o histórico; não autoriza remoção retroativa. O usuário deve conferir os valores e vencimentos nos dois boletos reais.

A publicação funcional abaixo foi autorizada em 22/10. Alteração de registros financeiros reais continua fora do escopo:

1. Aplicar somente `sql/contas-parcelamento-DRAFT.sql` revisado como migration; o nome DRAFT foi conservado para preservar as referências dos testes. Não há backfill nem saneamento de dados financeiros. Confirmar RPC, coluna e triggers antes do frontend, comparando contagens/hashes dos registros e das permissões/políticas.
2. Usar o checkout isolado `edr-release`, em `dev`, integrado com os commits efetivamente publicados até 19/10. O checkout original e suas alterações preexistentes foram preservados.
3. Publicar exclusivamente por `./deploy.sh "fix: parcelas independentes de NF e contas a pagar"`. O script atualiza cache/Service Worker, publica `dev` e avança `main`. Não fazer push manual como substituição.
4. Conferir build, conteúdo dos módulos e interface servidos pelo domínio público. O smoke usa navegador novo sem sessão, bloqueia APIs e toda requisição não GET, abre os dois exemplos sintéticos somente em memória e cancela sem salvar. A persistência foi ensaiada exclusivamente nos bancos locais descartáveis.

Rollback do frontend, se necessário, deve preservar a coluna e o histórico já gravado. Não apagar parcelas ou recibos para desfazer publicação; o frontend antigo não conhece os novos guards e a proteção de banco deve permanecer.
