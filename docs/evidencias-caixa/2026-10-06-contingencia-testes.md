# Contingência compatível: evidência local

Execução em 06/10/2026: **5/5 aprovados, zero falhas, cancelamentos ou skips**. Node 24.14.0; Chromium 154.0.8037.93; duração 1854,6919 ms. Resultado integral: [2026-10-06-contingencia-chromium.log](2026-10-06-contingencia-chromium.log).

O [teste](../../tests/caixa-contingencia-ui.test.js) aplica o [patch separado](../recuperacao-caixa/caixa-suspender-mutacoes.patch) apenas em pasta temporária. Exige hash de base/patch/resultado compatível com o [manifesto](../recuperacao-caixa/caixa-suspender-mutacoes.json), valida sintaxe e reversão, e confirma que o módulo normal não foi modificado. Os hashes de conteúdo do manifesto normalizam CRLF para LF; Git pode escolher CRLF no arquivo temporário do Windows.

| Verificação | Resultado |
| --- | --- |
| Aplicação e reversão em cópia; frontend normal conservado | Aprovada |
| Consultas, banco/dinheiro/total, restante parcial e auditoria; botões desativados e chamadas de entrada/saída/transferência/pagamento/abertura/gravação/cancelamento recusadas | Aprovada |
| Pago, edição e exclusão vinculados continuam bloqueados; alerta usa R$250,00 restantes da obrigação sintética de R$400,00 | Aprovada |
| Pedido incerto preserva UUID/journal; conferência e clique repetido não enviam escrita | Aprovada |
| Falha de leitura mantém saldo indisponível sem fallback legado; ausência de abertura mantém declaração suspensa | Aprovada |

Os callbacks usam o módulo de contingência, financeiro e helpers de alertas reais, com respostas sintéticas de RPC. Contextos headless são novos, sem perfil do usuário; o teste intercepta uma única página em origem `127.0.0.1` e aborta qualquer outro pedido de rede. Todos os cenários exigem zero chamadas de mutação RPC e zero escrita pelos helpers legados. Não há servidor, Authstack, credencial, banco remoto ou dados reais neste ensaio.

Capturas sintéticas verificadas em desktop e largura de 390 pixels, sem transbordamento horizontal:

- `output/playwright/caixa-contingencia/caixa-contingencia-desktop.png`
- `output/playwright/caixa-contingencia/caixa-contingencia-mobile.png`

| Artefato | SHA-256 |
| --- | --- |
| Teste executado | `8d46e6a5ab9365cb093f782042e84a9f1f5b0057d93f19a6b6b71141b871f937` |
| Helper executado | `e91499dc61055af7dd9c5f759f64484b904d831aabf83ca0ed4bfdfe5cb2b1c5` |
| Patch | `4f43eda77952e2fbd7c105e81c82370f40c848ff93bd9b19ee67d9cf9f1fb95e` |
| Manifesto | `ca4aca83c6211164b5339c5be10a9f6744d65e50b30237ee61d6b833932a4e25` |
| Log integral | `beb0e20ba13bf3a017df2842dc9287a5d7179436a7b0c1ba5df8c29922a81136` |

`node --check` nos dois arquivos JS de teste/helper e `git diff --check` também passaram. A revisão independente conferiu hashes/sintaxe e oito chamadas em memória, sem rota adicional de escrita do ledger. Sua observação baixa sobre texto amplo foi resolvida: o aviso delimita controle prospectivo e o roteiro explicita previsões/reembolsos preservados; o Chromium acima foi repetido após esse ajuste.

Este patch não foi aplicado no frontend normal nem publicado. A suspensão é uma contingência de interface compatível, depende da coordenação dos operadores e não bloqueia backend, builds/abas antigos ou clientes externos. Não comprova JWT/Auth real nem recuperação física dos backups de produção. Roteiro e limites: [contingencia-frontend-local.md](../recuperacao-caixa/contingencia-frontend-local.md).
