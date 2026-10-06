# Cartões por obra: resultado sobre recebimentos e mão de obra por m²

A Análise Financeira apresenta recebido menos todos os custos e despesas lançados da mesma obra e período. O cartão e a tabela inferior usam o mesmo resultado; o percentual é esse resultado dividido pelo recebido, quando positivo. O indicador não representa saldo em conta nem lucro final da obra.

O detalhe usa a mesma composição em centavos por origem: recebimentos do contrato e adicionais elegíveis; mão de obra, materiais e serviços, impostos, expediente, alimentação, combustível, limpeza, tecnologia e terreno. Cada lançamento aparece uma vez, inclusive estornos e valores negativos. Subtotais, origens assinadas e resultado usam a mesma regra de arredondamento. Fonte parcial, inválida ou indisponível permanece desconhecida; zero depende de leitura confirmada.

A contribuição da construção fica no detalhe, com as exclusões efetivamente presentes enumeradas no rótulo e na ponte de cálculo. Recebimento de terreno e pagamentos de adicionais fora da carteira elegível são explicados separadamente. A referência do engine DRE, quando difere pelo uso de decimais brutos, aparece em nota; nenhuma diferença cria crédito ou ajuste compensatório. A DRE gerencial e fiscal mantém suas fórmulas.

Mão de obra lançada / m² divide o custo acumulado da etapa `28_mao` pela mesma área cadastrada usada nos outros indicadores por m². O mês do cartão de recebimentos/custos não reduz essa base acumulada. A divisão por área decimal usa aritmética racional e arredonda ao centavo, também para estornos. Área ausente, inválida, zero ou negativa e resultado inseguro ficam indisponíveis.

O indicador é parcial conforme o avanço da obra e os custos já lançados. Pendências de folha só são afirmadas quando identificadas no diagnóstico agregado existente. O diagnóstico mensal não confirma cobertura acumulada; ausência de pendência identificada não comprova cobertura de todos os dias nem pagamento. Os novos cartões/detalhes não consultam registros individuais de funcionários nem lançam FP automaticamente.

## Escopo e visualização

O novo módulo `js/edr-v2-visao-financeira-composicao.js` é puro, sem rede, DOM ou persistência. Ele valida empresa, fonte, obra, situação e período contra o snapshot confirmado. Páginas e detalhes consomem a mesma composição. A ordem de scripts do `index.html` carrega a composição antes de páginas e detalhes. A paleta e os componentes EDR existentes são preservados.

Na tela Análise Financeira, selecionar obra/situação/período, clicar em **Resultado sobre recebimentos** e abrir **Por que difere da margem da construção**. Clicar em **Mão de obra lançada / m² (acumulado)** para ver custo lançado, área e limites de cobertura.

Não há migração, mudança de RLS, auth, estoque, folha, abertura ou gravação de dados operacionais nesta alteração. Saldos disponíveis, obrigações a pagar e recebíveis preservam seus cálculos existentes.

## Validação e publicação

Os testes automatizados usam fontes sintéticas, PostgreSQL local e Chromium isolado com transporte externo bloqueado. Cobrem centavos fracionários, categorias reais, adicionais elegíveis/cancelados, período/obra/situação/tenant, estornos, zero, área inválida, overflow, falha de leitura, diagnóstico de folha, clique em detalhes e exportação. As capturas são sintéticas em desktop, 390 e 320 pixels.

O roteiro de conferência autorizada mínima de produção utiliza somente agregados de uma obra, das cinco fontes necessárias, em memória. Seu resultado persistido contém exclusivamente contagens e conformidade; não guarda nomes, IDs ou valores financeiros. Nesta rodada o conector retornou erro antes de concluir a comparação: a consulta não foi repetida e nenhuma conformidade real é afirmada. O SQL e o comparador foram ensaiados com sucesso em PostgreSQL local sintético. Essa conferência não valida auth/RLS nem a cobertura operacional da folha.

A publicação autorizada deve usar exclusivamente `./deploy.sh` a partir de `dev` limpa, com cache busting automático. Conferir `main/dev`, CI do GitHub Pages e hashes dos arquivos públicos contra os blobs Git. O GET público não equivale a validação de login ou UI autenticada em produção.

Para desfazer funcionalmente, reverter o commit da implementação e publicar pelo mesmo fluxo autorizado. `rollback.sh` sozinho reverte apenas o último commit; se ele for o cache busting, não remove o commit funcional anterior. Não executar rollback sem autorização.
