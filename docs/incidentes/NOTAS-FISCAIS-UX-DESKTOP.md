# Notas Fiscais — compactação do fluxo desktop

## Objetivo

Reduzir a altura e a navegação necessária no lançamento e na consulta de notas fiscais em desktop, preservando regras fiscais, importação, salvamento e banco.

## Mudança aplicada

### Novo lançamento

1. A natureza e as ações **Importar XML** / **Colar texto** foram para o primeiro bloco do fluxo.
2. Os dados do cabeçalho foram distribuídos em grade compacta.
3. Frete, outras despesas, desconto e observação ficaram recolhidos em **Frete, descontos e observações**.
4. O formulário manual de item continua recolhido e só abre quando necessário.
5. Os itens importados permanecem numa tabela com busca e área de rolagem própria; a lista não cresce indefinidamente com NFs grandes.

### Histórico

1. Filtros, busca e mês foram concentrados em uma linha no desktop.
2. Os cartões altos foram substituídos por linhas compactas com fornecedor, NF/CNPJ, recebimento, natureza, destino, itens, valor e situação.
3. A busca cobre número da NF, fornecedor e CNPJ.

## Arquivos

- `index.html` — estrutura e estilos da tela.
- `js/edr-v2-notas.js` — renderização compacta do histórico e filtro visual da lista de itens.

## Garantias de escopo

- Nenhuma chamada de banco, regra de crédito, cálculo, payload de salvamento ou regra de devolução foi alterada.
- Não houve alteração de schema, dados, RLS, deploy ou produção.
- O filtro dos itens é somente visual e é limpo ao reiniciar o formulário.

## Evidência local — 17/08/2026

- Aprovação visual desktop recebida do Duam.
- `node --check js/edr-v2-notas.js` passou.
- `git diff --check` passou.
- Todas as suítes `tests/*.test.js` passaram na rodada local.
- Navegador local: o formulário abriu com uma única entrada de arquivo XML; o acionamento do seletor foi confirmado sem importar arquivo; o histórico renderizou 137 notas e a busca por NF retornou uma única linha, restaurando 137 ao limpar.

## Não validado nesta rodada

- Importação de um XML real após esta mudança visual.
- Salvamento de uma NF real.
- Produção, banco e deploy.
- Mobile: deliberadamente fora desta rodada, que priorizou desktop.

## Próxima etapa

Após commit e deploy autorizados, repetir o fluxo real de importação de XML em produção sem salvar uma NF de teste; em seguida validar uma NF operacional sob decisão do Duam.
