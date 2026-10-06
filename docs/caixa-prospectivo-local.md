# Controle prospectivo de banco e dinheiro

Implementação preparada em cópia isolada sobre `7ace6ac`. O [registro de implantação](caixa-prospectivo-implantacao.md) distingue homologação, migração, publicação e abertura. O ajuste de recebíveis por obra pertence a outra tarefa e não integra este pacote.

## Regra operacional

Declare uma única abertura com banco e dinheiro, data, horário e fuso. A abertura é saldo informado, não receita, custo ou conciliação. Não altera `companies.saldo_manual`, nem importa movimentos históricos. A interface mostra cada conta e o total. Não existe reabertura/ajuste compensatório nesta versão.

O saldo de cada conta é a abertura mais as entradas efetivas posteriores menos as saídas efetivas posteriores. Transferência é um único movimento vinculado: debita a origem e credita o destino na mesma transação; seu efeito total é zero. Tarifa é uma saída separada. Cancelamento mantém o registro auditado e retira seu efeito financeiro.

Prevalece a data efetiva, nunca a data de cadastro. Data anterior ao marco ou horário exatamente no marco já está incluído na abertura. No dia do marco sem horário, escolha explicitamente `Já incluído no saldo de abertura` ou `Ocorreu após o marco de abertura`. Movimento futuro não pode ser confirmado como efetivo. A interface usa `America/Sao_Paulo`.

Lançamentos de custo, consumo de estoque e fechamento de folha não alimentam o saldo. Fechar uma quinzena antiga já paga não desconta novamente a abertura. Pagamentos de obrigações antigas após o marco são registrados como pagamentos financeiros, sem duplicar custo.

## Pagamentos e limites da integração

O botão **Pago** de Contas a Pagar abre **Pagamento efetivo** no Caixa prospectivo para uma obrigação pendente. Escolha a conta de origem, o valor realmente pago, data/hora efetiva e referência do comprovante. Permite pagamento parcial e mostra o restante. Esse caminho já grava uma saída vinculada: **não crie também Saída simples nem Entrada para o mesmo pagamento**. Cada nova parcela efetivamente paga tem seu próprio registro; quitar o restante não autoriza repetir parcelas anteriores.

A RPC atualiza somente status/data de pagamento da obrigação ao quitar; não cria `lancamentos`. Cancelar pagamento retira seu efeito financeiro, recalcula o restante e restaura status/data anterior quando necessário. Pagamentos anteriores ou já incluídos na foto de abertura não podem ser registrados como saídas posteriores ao marco.

Se um pagamento efetivamente anterior à abertura ainda consta como obrigação pendente no legado, registre **Pagamento efetivo** vinculado com a data/hora real anterior ao marco, para baixar a obrigação sem baixar o saldo outra vez. No dia do corte sem horário conhecido, escolha explicitamente **Já incluído no saldo de abertura** quando for esse o fato. Se já consta pago no legado, não repetir a quitação; uma Saída simples só deve afetar o disponível quando representar desembolso efetivamente posterior e ainda não registrado. Nunca escolha uma data posterior só para encerrar conta antiga ou gerar ajuste compensatório.

Os outros módulos continuam com suas finalidades originais. Não identificam necessariamente a conta movimentada nem a posição temporal em relação à abertura; por isso seus registros não são importados automaticamente. A matriz se aplica a fatos efetivamente recebidos/pagos, respeitando o corte temporal e a consulta prévia aos movimentos persistidos.

| Fluxo | Registro no módulo de origem | Registro próprio no Caixa | O que não deve alterar ou duplicar o disponível |
| --- | --- | --- | --- |
| Repasse CEF | Custos registra recebimento em `repasses_cef`, com valor e data de crédito. | **Entrada** na conta que recebeu, com referência da obra/medição/comprovante. | Não somar novamente repasses ao saldo. Medição aprovada ou repasse previsto ainda não recebido não é Entrada. |
| Recebimento de adicional | Adicionais registra o pagamento do cliente em `adicional_pagamentos`. | **Entrada** na conta que recebeu, para cada parcela efetivamente recebida, com referência do adicional/comprovante. | Contratação/aprovação do adicional, seu custo ou saldo a receber não são dinheiro disponível. O pagamento cadastrado em Adicionais não importa Entrada automática. |
| Entrada do cliente | O recebimento é registrado em `repasses_cef` de tipo `entrada`; contrato e indicador de entrada paga permanecem no cadastro da obra. | **Entrada** na conta que recebeu, pelo valor efetivo, com referência da obra/comprovante. | Não usar contrato, indicador cadastral ou saldo de recebíveis como crédito no Caixa. Um recebimento de entrada do cliente visto também na lista de repasses exige somente uma Entrada no Caixa. |
| Reembolso de fornecedor/NF | Devolução fiscal cria direito de reembolso; **Confirmar recebimento** atualiza a conta como recebida no Financeiro. | Após receber de fato, **Entrada** na conta que recebeu, com referência da NF/reembolso/comprovante. | Reembolso pendente não é saldo. Confirmar recebimento no Financeiro não cria movimento prospectivo; depois da Entrada explícita, não repetir o reembolso. |
| NF à vista ou já marcada paga fora do Caixa | Notas pode criar `contas_pagar` com status pago ao escolher **À vista - já pago**; custos/itens da NF seguem os fluxos existentes. | **Saída** simples na conta que pagou, com data/hora efetiva e referência da NF/comprovante, se a baixa ainda não estiver no Caixa nem incluída na abertura. | Não repetir **Pagamento efetivo** para conta já paga no legado: a RPC rejeita a quitação repetida. Não criar custo/despesa para representar a mesma saída. |
| Conta avulsa ou NF a prazo ainda pendente | Financeiro mantém a obrigação; **Pago** abre o diálogo prospectivo. | **Pagamento efetivo** vinculado à conta, total ou parcial. Já registra a saída. | Não lançar Saída simples adicional. Cadastro/vencimento não muda saldo. Conta antiga paga após o marco baixa apenas o valor efetivamente pago, sem duplicar custo. |
| Conta avulsa com obra, sem vínculo de NF | O custo deve estar reconhecido em Custos antes do pagamento. | **Pagamento efetivo** vinculado, após confirmar expressamente que o custo foi registrado. | O pagamento não fabrica custo integral nem altera estoque. A confirmação auditada não cria nem comprova automaticamente vínculo com `lancamentos`. |
| Folha/diárias | Apontar, lançar FP e fechar quinzena registram competência/custo e fechamento. | No desembolso real, **Pagamento efetivo** de obrigação cadastrada; se o pagamento já foi concluído fora desse fluxo, **Saída** simples com referência da folha/comprovante. Escolher um só caminho. | Não deduzir novamente salários incluídos na abertura ao fechar quinzenas antigas. Valor da folha, custo `28_mao` e fechamento não confirmam pagamento. |
| Custo/consumo de material | Custos, NF, distribuição ou consumo seguem competência e regras de estoque/DRE. | Nenhum movimento só pelo lançamento/consumo. O desembolso segue **Pagamento efetivo** se há obrigação pendente ou **Saída** simples se já pago fora do fluxo. | Não usar `lancamentos.total`, consumo de estoque ou classificação de custo como saída automática. Não registrar as duas formas para o mesmo pagamento. |
| Transferência C6 PJ ↔ dinheiro | Retirada de uma conta e depósito na outra. | Um único movimento **Transferência**, com origem/destino vinculados na mesma transação. | Não cadastrar também Saída na origem e Entrada no destino. O efeito no total é zero. |
| Tarifa bancária | Tarifa efetivamente debitada. | **Saída** separada na conta cobrada, com referência do débito. | Não embutir como diferença de transferência nem fabricar ajuste compensatório. |
| Projeção/obrigação ainda não realizada | Projeções mostram entradas previstas; contas pendentes mostram restante a pagar. | Nenhum movimento efetivo até ocorrer recebimento/pagamento. | Não somar previsão nem subtrair obrigação pendente do saldo de conta. Obrigações ficam separadas do disponível. |

Antes de registrar Entrada, Saída ou Pagamento, consulte **Movimentos efetivos** e compare conta, valor, data/hora e **Descrição / referência do comprovante**. Inclua um identificador único reconhecível do comprovante na descrição, além da referência da obra/NF quando houver. O mesmo comprovante representa um só movimento financeiro no Caixa, mesmo quando também existe em outro módulo. A idempotência protege o reenvio do mesmo UUID/payload; não reconhece duas digitações novas do mesmo comprovante, pois elas recebem UUIDs diferentes. A descrição não tem restrição automática de unicidade: o identificador serve à conferência operacional.

Em resposta incerta, não inicie outro registro do mesmo fato: use **Conferir / reenviar mesmo pedido** no diálogo ou **Conferir pedido pendente** após recarregar a mesma aba. O reenvio usa o mesmo UUID/payload e devolve o recibo persistido, sem movimento adicional. Se perder a aba/storage, confira os movimentos e a referência do comprovante antes de registrar novamente. O journal de intenção está explicado na seção seguinte.

Para conta avulsa com obra, sem vínculo de nota, confirme que o custo foi registrado na obra antes de pagar. Se falta reconhecer custo, use Custos primeiro. Fórmulas e fontes da DRE não foram modificadas; o pagamento prospectivo deixou de fabricar custo integral automaticamente. Esta entrega não altera cálculos, cadastros ou cobranças de recebíveis por obra e não publica o ajuste preparado em outra tarefa.

Avisos existentes na interface, transcritos do código desta cópia:

| Onde aparece | Texto exato |
| --- | --- |
| Página Caixa, aviso geral | “Registre aqui os recebimentos e pagamentos por conta, inclusive os cadastrados como pagos em outros módulos. Esses cadastros não são importados automaticamente.” |
| Notas, após escolher à vista/já pago e persistir a conta | “Conta marcada paga. Registre a saída efetiva por conta no Caixa.” |
| Financeiro, após confirmar reembolso recebido | “Reembolso confirmado. Registre a entrada efetiva por conta no Caixa.” |
| Checkbox no pagamento de conta avulsa com obra, sem vínculo de NF | “Confirmo que o custo desta conta já foi registrado na obra. Se ainda falta, registre-o em Custos antes de pagar. Este pagamento não lança custo.” |
| Diálogo de movimento | “Registre cada movimento uma vez. Custo, consumo e fechamento da folha não confirmam pagamento. Movimentos anteriores ou já incluídos na abertura não mudam o saldo.” |
| Diálogo de transferência | “Transferência mantém o total. Registre tarifa como saída separada.” |
| Página Caixa, com journal pendente | "Há um pedido pendente de confirmação. Confira antes de registrar outro movimento." |

Custos e Adicionais conservam suas mensagens de salvamento existentes; não receberam aviso próprio de Caixa após cada recebimento. Nesses fluxos, a orientação está no aviso geral da página Caixa e nesta matriz. Os avisos específicos após pagamento de NF e recebimento de reembolso estão listados acima.

Referências locais: `js/edr-v2-caixa-prospectivo.js` (diálogos, avisos, journal e envio à RPC), `js/edr-v2-financeiro.js` (botão Pago e reembolso), `js/edr-v2-notas.js` (`_notasPromptPagamento`), `js/edr-v2-custos.js` (`custosSalvarRepasse`), `js/edr-v2-adicionais.js` (`salvarPgto`), `js/edr-v2-entrada-cliente.js` (origem da entrada recebida) e `sql/caixa-prospectivo-DRAFT.sql` (validação/idempotência/baixa financeira). Nenhuma dessas fontes é modificada nesta atualização documental.

Contas com movimentos auditados são preservadas contra edição/exclusão pelos caminhos normais desta interface. Escritas legadas por outras versões/ferramentas não foram bloqueadas por novas policies: a RPC detecta mudança de valor/status/data ou obrigação removida e interrompe a operação. Esse conflito exige análise específica; não fabrica reposição.

## Persistência e recuperação

Quatro tabelas novas (`caixa_contas`, `caixa_movimentos`, `caixa_obrigacoes`, `caixa_operacoes`) e duas RPCs (`caixa_estado`, `caixa_registrar`) mantêm o controle no PostgreSQL. Sem migração/leitura confirmada, a interface mostra indisponibilidade e não usa saldo legado ou localStorage como fallback.

Cada pedido tem UUID. Reenvio do mesmo UUID/payload devolve o recibo original; payload diferente é rejeitado. Há serialização transacional por empresa para abertura, transferência, parciais e cancelamentos. O frontend impede clique duplo e conserva o pedido enquanto a resposta é incerta.

`sessionStorage` guarda somente a intenção pendente (UUID/payload/empresa), antes da chamada, para recuperar resposta perdida após recarregar a mesma aba. Não guarda saldo operacional e não substitui PostgreSQL. Se a chave de recuperação não pode ser guardada, a interface não envia a operação. Use **Conferir pedido pendente** para reenviar exatamente o pedido anterior. Se perder a aba/storage, consulte os movimentos persistidos antes de registrar novamente.

As tabelas novas têm RLS por empresa e vínculo administrativo ativo; escrita direta de cliente é revogada. Os dois RPCs validam `auth.uid()`, empresa, papel e `company_users.active IS TRUE` antes de qualquer leitura, escrita ou recuperação de recibo. Têm `search_path` fixo, sem execução por `PUBLIC`/`anon`. Nenhuma policy, permissão ou estrutura legada foi alterada.

## Verificação e visualização locais

Os ensaios usam dados sintéticos, PGlite PostgreSQL 17.5, PostgreSQL nativo 17.11 e Chromium headless sem sessão do usuário. A suíte UI unitária simula RPCs. Ensaios separados usam GoTrue/PostgREST reais na stack Supabase local e a interface do módulo Caixa com JWT e RPCs reais. O teste de folha executa o fechamento real com persistência simulada; o saldo permanece baseado no ledger. Nenhum fluxo de teste financeiro escreve em produção.

O ensaio nativo inicia um cluster descartável em `127.0.0.1`, com autenticação de teste e sem conexão remota. Oito casos usam conexões com PIDs distintos e verificam em `pg_stat_activity`/`pg_blocking_pids` o bloqueio da segunda pela primeira antes do commit/rollback. Cobrem UUID simultâneo, payload divergente, parciais concorrentes, transferência/cancelamento, rollback e cancelamento repetido. Conferem saldos, obrigações, recibos e sentinelas de custo/folha/estoque/saldo manual. O cluster é encerrado ao final.

```powershell
# Regressões sem banco remoto; runtimes opcionais não são dependências da aplicação.
Remove-Item Env:EDR_PGLITE_PATH,Env:EDR_POSTGRES_BIN,Env:EDR_PLAYWRIGHT_PATH,Env:EDR_CHROMIUM_PATH -ErrorAction SilentlyContinue
$arquivos = Get-ChildItem tests -Filter '*.test.js' | Select-Object -ExpandProperty FullName
node --test $arquivos

# Ensaios novos completos; forneça caminhos de pacotes locais já instalados.
$env:EDR_PGLITE_PATH = '<pasta de @electric-sql/pglite>'
$env:EDR_PLAYWRIGHT_PATH = '<pasta de playwright>'
$env:EDR_CHROMIUM_PATH = '<chrome.exe de Chromium instalado, se não corresponder ao padrão do Playwright>'
node --test tests/caixa-prospectivo-db.test.js tests/caixa-prospectivo-ui.test.js tests/alertas-caixa-prospectivo.test.js

# Concorrência real, somente em cluster local novo; não usa URL de banco existente.
$env:EDR_POSTGRES_BIN = '<pasta bin do PostgreSQL local já instalado>'
$env:EDR_PG_TEST_ROOT = '<pasta gravável para clusters descartáveis do ensaio>'
node --test tests/caixa-prospectivo-concorrencia-pg.test.js
```

O preview HTML e a captura sintéticos são entregues fora do repositório, em `../evidencias/`. O preview é estático e não opera banco. Não abra `index.html` conectado à produção para experimentar. Para validar operacionalmente, use apenas ambiente de homologação local/descartável configurado com a migração DRAFT e autenticação de teste.

A foto privada de saldo aprovada é configuração revisável em arquivo fora do repositório (`../abertura-edr-PRIVADO.json`). Não é carregada pela aplicação nem acompanha o patch. O ensaio privado aplica essa configuração somente em PostgreSQL descartável.

## Antes de implantação

1. Revisar pacote, migração `sql/caixa-prospectivo-DRAFT.sql` e evidências. Duam autorizou homologação e condicionou migração/publicação à validação real isolada. A autorização específica às 08:58:37 UTC permitiu preparar a stack local e aplicar a proteção de admin ativo. Auth real passou em 15/15 e a interface com RPC real foi validada separadamente. Consulte [runbook e status atuais](caixa-prospectivo-implantacao.md).
2. Conferir schema/helper de autenticação, ownership/grants e acesso administrativo com sessão real em homologação isolada. A migração verifica pré-requisitos e aborta se incompatíveis.
3. Conservar os ensaios de schema/Auth/RLS/owner e auditoria na QA local oficial. Os helpers e o trigger de auditoria foram reproduzidos a partir dos metadados reais; os limites das dependências auxiliares e da configuração gerenciada estão documentados. Não criar usuários ou pagamentos de teste em produção.
4. Aplicar migração somente ao alvo expressamente autorizado, antes de publicar o código; revisar backup e declaração privada do marco. Abertura não tem seed nesta migração.
5. A publicação autorizada usa o processo existente `deploy.sh`, que gerencia cache, em `dev` limpa e isolada. Confirmar SHAs, build servido e smoke de leitura. Não juntar o ajuste de recebíveis de outra tarefa nem gravar abertura real sem sua autorização específica.

O rollback DRAFT remove os objetos novos somente se as quatro tabelas estão totalmente vazias, sob locks exclusivos na mesma transação. Depois de abertura, recibo, snapshot ou movimento, exige plano e backup próprios que preservem todos os registros: rollback de código não desfaz obrigações nem apaga auditoria. Oito testes nativos e vinte PGlite passaram. Recuperação sintética passou em 10/10 e a contingência compatível em 5/5 Chromium; isso não executa ou autoriza rollback de banco real. Preserve ledger/recibos e siga o [roteiro de recuperação](recuperacao-caixa/backup-restore-local.md).
