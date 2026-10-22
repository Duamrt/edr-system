# NF e contas a pagar: parcelas independentes

Estado: correção local em revisão, **não publicada e sem SQL aplicado ao servidor**.

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

## Arquivos

- `js/edr-v2-importar.js`: leitura da cobrança e transporte no contexto.
- `js/edr-v2-parcelas.js`: editor compartilhado, validação em centavos, recuperação local e RPC.
- `js/edr-v2-notas.js`: integração pós-importação e consulta financeira antes da exclusão.
- `js/edr-v2-financeiro.js`: desdobramento, revisão, indicador de histórico e proteções.
- `index.html`: carregamento do módulo.
- `sql/contas-parcelamento-DRAFT.sql`: proposta de coluna/histórico, RPC atômica e proteção de integridade. `SECURITY INVOKER`, sem GRANT/REVOKE ou mudança de RLS.
- Testes novos de cobrança XML, interface, banco e exclusão; regressões de integridade/NF atualizadas para o novo contrato.

## Limites e publicação condicionada à aprovação

O banco de produção não foi consultado. A compatibilidade com as definições efetivamente instaladas, as permissões existentes de execução e os triggers do Caixa deve ser conferida em leitura antes da aplicação. O contrato local restringe a RPC ao administrador sem elevar privilégios. A coluna `parcelamento` não substitui o sistema de auditoria existente.

Contas/NFs que já estejam duplicadas ou órfãs não foram saneadas. Essa correção previne novos problemas no fluxo e protege o histórico; não autoriza remoção retroativa. O usuário deve conferir os valores e vencimentos nos dois boletos reais.

Após aprovação explícita:

1. Conferir em leitura schema/RLS existentes e a compatibilidade do contrato: `contas_pagar`, `notas_fiscais`, `obras`, `lancamentos`, `caixa_movimentos`, `caixa_obrigacoes`, `auth_company_id()`, `auth_user_role()`, `auth.uid()`, RPC de exclusão e lock do Caixa. Não alterar permissões para contornar incompatibilidade.
2. Validar a migration em ambiente de homologação com schema equivalente, repetir testes e ensaiar resposta perdida, edição concorrente e exclusão/reimportação com dados sintéticos.
3. Aplicar **somente** `sql/contas-parcelamento-DRAFT.sql` revisado como migration. A proposta não inclui backfill ou saneamento de registros financeiros reais. Confirmar a disponibilização da RPC antes do frontend.
4. Separar este diff das alterações locais preexistentes. Preparar checkout/worktree limpo na branch `dev`, revisar e commitar apenas os arquivos da correção. O checkout original já estava sujo; `deploy.sh` deliberadamente recusa essa condição.
5. Publicar exclusivamente por `./deploy.sh "fix: parcelas independentes de NF e contas a pagar"`. O script atualiza os parâmetros de cache e Service Worker automaticamente, faz push de `dev` e avanço de `main`; essas ações exigem aprovação. Não fazer push manual como substituição.
6. Conferir carregamento/build em leitura. Uma validação com registro financeiro real só pode ocorrer com autorização específica e com os valores/vencimentos reais em mãos. Não excluir/reimportar a NF em uso como teste.

Rollback do frontend, se necessário, deve preservar a coluna e o histórico já gravado. Não apagar parcelas ou recibos para desfazer publicação; o frontend antigo não conhece os novos guards e a proteção de banco deve permanecer.
