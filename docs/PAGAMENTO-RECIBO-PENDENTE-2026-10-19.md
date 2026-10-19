# Confirmação e recibo em Contas a Pagar

Implementação local autorizada por Duam em 19/10/2026, às 09:18 de Recife. Branch `fix/pagamento-recibo-pendente-20261019`, derivada da versão publicada `5e77cba921e490accca13fa63f28c2f3af39eb79`. Não publicada; não houve acesso ao Console original nem escrita em dados reais.

Esta é uma melhoria preventiva. A investigação não comprovou que este comportamento causou o relato das duas contas.

## Comportamento

- Contas a Pagar e Caixa mostram a tentativa sem confirmação, com fornecedor/NF quando presentes no journal, valor, data e operação. O aviso independe dos filtros da lista e continua visível se a leitura geral do Caixa estiver indisponível.
- “Consultar resultado” faz somente leitura. O antigo botão de salvar passa a consultar quando o pagamento ficou incerto; o atalho de recuperação do Caixa segue a mesma regra para pagamentos.
- Se a operação foi localizada, a consulta confere empresa, operação, pedido completo, movimento, conta, valor, desconto, juros, origem e data/hora antes de mostrar sucesso. Dados divergentes ou consulta indisponível preservam a tentativa e não oferecem reenvio.
- Se não foi localizada, a interface informa que isso não prova falha/rollback. “Reenviar o mesmo registro” é uma ação explícita: consulta outra vez antes de chamar `caixa_registrar`, conservando UUID e pedido integral. Se a operação apareceu entre as consultas, apenas apresenta o recibo.
- É possível fechar o formulário incerto e voltar à lista sem apagar a tentativa. A proteção existente contra iniciar outra operação continua ativa.
- Depois da confirmação, o recibo mostra fornecedor, NF/parcela em `nota_ref` quando disponível, descrição, valor pago, data/hora efetiva em São Paulo e operação. Movimento e conta ficam nos detalhes. Pagamento parcial não é apresentado como quitação; movimento posteriormente cancelado aparece como cancelado.
- Observação continua opcional. Não há alteração do custo, da regra de abertura, dos ajustes de desconto/juros ou do fluxo de recebimento de reembolso.

## Acesso e persistência

Sem migração, alteração de permissões, RLS ou configuração. São usados `sbGet` e as tabelas já declaradas em `_TABELAS_TENANT`: `caixa_operacoes`, `caixa_movimentos` e `contas_pagar`. O SELECT administrativo por empresa já consta de `sql/caixa-prospectivo-DRAFT.sql`. As chamadas usam `throwOnError:true`, evitando converter erro HTTP em ausência de operação.

Cada resposta é novamente conferida contra empresa e identidade do administrador atual. Respostas atrasadas após troca de empresa, usuário ou perfil não geram sucesso nem limpam a tentativa de origem. Não há acesso anônimo, nova chave ou endpoint. A garantia de idempotência continua sendo a transação existente de `caixa_registrar`; o frontend não simula uma baixa.

Arquivos de produção: `js/edr-v2-caixa-prospectivo.js` e `js/edr-v2-financeiro.js`. Testes: `tests/pagamento-recibo-pendente.test.js` (novo) e atualização dos mocks/expectativas em `tests/caixa-prospectivo-ui.test.js` para refletir consulta separada de reenvio.

## Validação

79 testes aprovados, nenhum falhou ou foi pulado, nas três suítes abaixo. Incluem dois ensaios Chromium com DOM real; desktop 1280×900 e recibo mobile 390×844, sem overflow. O navegador usa perfil descartável e conteúdo servido pelo próprio teste; requisições externas da página são bloqueadas. Não há conexão com Supabase real ou com um banco local: os dados e respostas são fictícios em memória.

Cobertura: sucesso, recusa definitiva, perda antes/depois da persistência simulada, retorno à lista e recuperação em nova instância da mesma aba, operação já concluída, confirmação tardia antes do reenvio, identificação divergente, falha de leitura, clique duplo, isolamento de empresa/ator/perfil, parcial, cancelamento, escape de texto, ordem JSONB, journal antigo e observação vazia. As suítes existentes também verificam entradas, transferências, abertura, conciliação, alertas, reembolso e proteção contra alterações indevidas da obrigação.

Reprodução com runtimes já instalados (não instalar nem apontar para ambiente real):

```powershell
$env:EDR_PLAYWRIGHT_PATH = '<pasta do pacote playwright existente>'
$env:EDR_RECIBO_PLAYWRIGHT_PATH = $env:EDR_PLAYWRIGHT_PATH
$env:EDR_CHROMIUM_PATH = '<executável Chromium existente>'
$env:EDR_RECIBO_EVIDENCE_DIR = Join-Path (Get-Location) 'output\playwright\pagamento-recibo'
node --test --test-reporter=tap tests/pagamento-recibo-pendente.test.js tests/caixa-prospectivo-ui.test.js tests/alertas-caixa-prospectivo.test.js
```

Evidências locais em `output/playwright/pagamento-recibo/`: `validacao.tap`, `tentativa-pendente-desktop.png`, `recibo-desktop.png`, `recibo-mobile.png`. Verificação adicional: sintaxe dos dois módulos e `git diff --check`.

O teste legado `tests/caixa-contingencia-ui.test.js` aborta por divergência do hash de sua base/patch de contingência. A mesma falha foi reproduzida no checkout intacto `5e77cba`, antes desta mudança. O manifesto/patch histórico não foi regenerado nem aplicado. Essa suíte não integra os 79 aprovados.

## Limites e publicação

- O journal continua em `sessionStorage`, por empresa e aba. Não recupera uma tentativa cuja sessão foi perdida, nem coordena UUIDs diferentes em outras abas/dispositivos. Nenhuma nova garantia global de deduplicação foi criada.
- O recibo visível é o último conferido nesta instância da página e usa os dados cadastrais atuais. Não é um novo arquivo fiscal/bancário nem uma listagem permanente de recibos. Após recarga sem tentativa pendente, o histórico existente do Caixa continua sendo a referência.
- Leituras posteriores ao commit podem falhar. Nesse caso, mesmo uma resposta positiva da escrita não produz sucesso visual: o journal fica disponível para nova consulta. Isso não desfaz o commit.
- Os testes validam o contrato e o comportamento da interface com fixtures, não constituem um novo ensaio autenticado das policies instaladas em produção. Não houve alteração de SQL ou de segurança.
- Publicação depende de aprovação explícita de Duam e do fluxo de release/cache busting do projeto. Não foi executado deploy, push, merge, pagamento, baixa ou abertura real.
- O repositório original `C:\Users\Duam Rodrigues\edr-system` foi apenas consultado; suas alterações locais foram preservadas. A implementação está em worktree próprio dentro da área da tarefa.
