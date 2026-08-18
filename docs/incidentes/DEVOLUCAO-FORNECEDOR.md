# Devolução ao fornecedor — contrato e validação local

**Status:** regra de banco aplicada em 17/08/2026 e operação real registrada. A devolução abaixo ficou vinculada à compra de origem e gerou um único reembolso pendente; a confirmação do dinheiro segue sendo uma ação financeira posterior.

## Caso que originou a correção

| Documento | Data | Item | Quantidade | Valor |
|---|---:|---|---:|---:|
| NF 861318/1 — compra FEMAC | 04/08/2026 | Caixa-d'água Fortlev 1.000 L | 2 UN | R$ 792,90 |
| NF 147051/2 — devolução FEMAC | 07/08/2026 | Caixa-d'água Fortlev 1.000 L | 1 UN | R$ 396,45 |

Resultado esperado: **1 UN no Estoque EDR, avaliada em R$ 396,45**, e um reembolso de **R$ 396,45** pendente de confirmação no Financeiro. O caixa só recebe esse valor após a confirmação de que o fornecedor devolveu o dinheiro. Os XMLs continuam fora do repositório, em `Downloads`.

## Regra implementada localmente

1. A devolução deve vir de XML e ter natureza `DEVOLUCAO`.
2. O usuário seleciona a NF de compra de origem e informa o motivo.
3. A primeira versão aceita somente compra que entrou no **Estoque EDR**.
4. Fornecedor/CNPJ, código fiscal do item, quantidade e valor proporcional precisam conferir com a compra.
5. A devolução é recusada se exceder o saldo já comprado ou se a NF de origem já teve saída para obra.
6. A devolução reduz estoque e custo médio; ela não cria um lote novo para FIFO.
7. A data efetiva da devolução reduz o saldo mesmo se houver uma contagem física entre compra e retorno.
8. A devolução cria um **reembolso pendente**, auditável e ligado à NF. Quando o dinheiro entrar, o usuário confirma o recebimento; só então ele vira entrada de caixa. Não é crédito de fornecedor nem despesa a pagar.

## Reconhecimento fiscal da devolução

O XML real da NF 147051/2 informou `natOp = DEV. DE MERCADORIA SUJEITAS AO REGIME DE S.T.` e `finNFe = 4`.
O texto de `natOp` é livre e pode trazer a abreviação `DEV.`, por isso não pode ser a única fonte de classificação. O importador passa a usar `finNFe = 4` como critério autoritativo e aceita `DEV.` como compatibilidade para XMLs legados.

O primeiro teste visual revelou a falha anterior: o item e o valor eram importados corretamente, mas a natureza ficou como `VENDA`. A correção foi testada no motor local; a nova confirmação visual no navegador permanece pendente.

## Arquivos da implementação

- `js/edr-v2-devolucao.js`: validador puro de vínculo, quantidade, valor e bloqueios.
- `js/edr-v2-notas.js`: campos da origem/motivo, validação antes de salvar e bloqueio do prompt comum de pagamento para devolução.
- `js/edr-v2-importar.js`: abre o bloco de devolução ao reconhecer a natureza no XML.
- `js/edr-v2-estoque.js`: aplica a devolução como redução de entrada, inclusive após contagem física.
- `js/edr-v2-financeiro.js`: reconhece reembolso de fornecedor como entrada de caixa.
- `index.html`: campos da compra de origem e motivo.

## Estrutura aplicada no banco

A migração de produção criou e valida:

- `notas_fiscais.nota_origem_id` com FK para a NF de compra, mesmo `company_id` e bloqueio contra origem de outra devolução;
- `notas_fiscais.motivo_devolucao` obrigatório quando natureza for `DEVOLUCAO`;
- `contas_pagar.nota_id`, `tipo` e `data_recebimento`, para o registro auditável de `reembolso_fornecedor`;
- trigger no banco que repete as validações do navegador e cria **um único reembolso pendente**. O frontend não é autoridade de integridade;
- RLS das novas colunas/registros preservando `company_id = auth_company_id()`.

O trigger recusa devolução acima da quantidade de origem e origem já distribuída. O arquivo DRAFT termina em `ROLLBACK` de propósito: ele é roteiro de regressão e não pode deixar alterações no banco por engano.

## Evidência local

- `tests/devolucao-fornecedor.test.js`: 17 asserções — usa os dados conferidos nos XMLs da FEMAC; aprova 2 → 1 e bloqueia excesso, fornecedor divergente e compra já distribuída.
- `tests/estoque-devolucao.test.js`: 7 asserções — confirma saldo e valor líquido, inclusive com contagem física entre compra e devolução.
- `tests/xml-conversao-unidade.test.js`: 28 asserções — inclui NF com `finNFe = 4` e natureza abreviada como `DEV.`, que deve classificar como `DEVOLUCAO`.
- Acionador de XML: a tela usa botão nativo que chama `abrirImportXML()` e um único campo de arquivo oculto `#input-xml-nfe`. Em 17/08/2026, o teste automatizado no navegador local confirmou que o clique abre o seletor nativo. Nenhuma NF foi salva nesse teste.

## Validação da migration em produção com rollback — 17/08/2026

Executada no projeto Supabase `EDR SYSTEM` por conexão oficial, sempre dentro de uma única transação encerrada em `ROLLBACK`:

1. Os pré-requisitos reais de schema passaram: `notas_fiscais` possui `id`, `company_id` e `itens`; `contas_pagar` possui `company_id`; `auth_company_id()` e `distribuicoes` existem.
2. Todo o DDL foi aceito pelo PostgreSQL 17: colunas, FK, índices, funções e triggers foram criados temporariamente sem erro.
3. Com uma sessão de empresa simulada somente na transação, uma compra temporária de 2 UN e uma devolução de 1 UN criaram exatamente um reembolso **pendente** de R$ 396,45.
4. Foram rejeitados como esperado: devolução que excede a quantidade já devolvida; CNPJ de fornecedor divergente; e devolução de uma compra que já teve saída para obra.
5. Após o `ROLLBACK`, uma consulta independente confirmou `false` para: colunas novas, triggers novos, NFs de teste e reembolsos de teste. Nenhum dado de produção foi criado, atualizado ou excluído.

Limite da evidência: isto prova o DDL e as regras no banco, não a gravação final pela interface nem o efeito do estoque renderizado no navegador.

## Aplicação permanente e endurecimento — 17/08/2026

1. A migration `20260817112045_devolucao_fornecedor` foi registrada e aplicada com sucesso no projeto Supabase `EDR SYSTEM`.
2. A verificação posterior confirmou as duas colunas novas, os dois triggers e o registro da migration.
3. O Advisor do Supabase revelou que os dois `SECURITY DEFINER` de trigger ainda apareciam executáveis via RPC. A migration corretiva `20260817112156_harden_devolucao_trigger_execute` revogou explicitamente `EXECUTE` de `public`, `anon` e `authenticated`.
4. A verificação posterior retornou `false` para as quatro permissões de execução direta. Um novo teste transacional confirmou que os triggers continuam criando o reembolso pendente automaticamente.

O alerta de permissões foi corrigido antes de qualquer lançamento real. Os demais avisos do Advisor são anteriores e abrangem outros módulos/tabelas; não foram alterados nesta entrega.

## Operação real conferida no banco — 18/08/2026

Consulta somente leitura no projeto de produção confirmou:

1. A compra `861318/1` (R$ 792,90) existe como `VENDA`, recebida em 10/08/2026.
2. A devolução parcial `147051/2` (R$ 396,45), recebida em 17/08/2026, existe como `DEVOLUCAO`, aponta por UUID para a compra `861318/1` e registra o motivo `CAIXA DAGUA`.
3. Há exatamente um `reembolso_fornecedor` pendente de R$ 396,45, vinculado por `contas_pagar.nota_id` à NF de devolução.
4. A conta da compra original está paga e também vinculada por UUID à sua NF.

Limite: esta conferência prova os vínculos e o reembolso persistidos; não substitui uma nova conferência física do saldo nem confirma o recebimento do dinheiro.

## Validação integrada controlada — 14/08/2026

Executada no servidor local autenticado, usando o XML real da compra e sem criar conta a pagar:

1. Importação da NF `861318/1` confirmou **1 item**, com **2 UN** a **R$ 396,45** e total de **R$ 792,90**.
2. A NF foi salva no destino **Estoque EDR** e apareceu na lista como `VENDA · 1 item · ESTOQUE GERAL`.
3. O saldo visível de `CAIXA DAGUA FORTLEV 1000L POLIETILENO` passou de **1 UN** para **3 UN**, comprovando a entrada das 2 unidades.
4. A NF de teste foi excluída pela própria interface. A lista voltou a **133 notas**, a NF não permaneceu visível e o saldo retornou a **1 UN**.

Correção adicional comprovada nessa validação: campos específicos de devolução não podem ser enviados em uma compra comum. Antes do ajuste, eles faziam o banco recusar qualquer NF normal com HTTP 400. Agora eles são enviados apenas quando a natureza é `DEVOLUCAO`.

## Não testado nesta etapa

- Fluxo completo pela interface publicada: o código da tela continua local e não foi submetido a deploy.
- Persistência de uma devolução fiscal real e confirmação de recebimento do reembolso pelo usuário: deliberadamente não executadas nesta validação.
- Efeito visual do saldo e do caixa após a devolução real: depende do deploy e do teste de ponta a ponta.
- Devolução de compra que foi direto para obra, compra já parcialmente distribuída, crédito com fornecedor ou substituição sem reembolso. Esses casos seguem bloqueados deliberadamente.
