# Lista completa após registrar parcelas

Ao importar uma NF antes de abrir o Financeiro, o cache `contasPagar` começava vazio e recebia somente as contas retornadas pela operação. Os callbacks de Contas a Pagar e Caixa usavam `contasPagar.length` como indicação de carregamento completo. Assim, duas parcelas recém-criadas impediam a consulta das demais contas e a tela mostrava `Todas (2)`.

A consulta somente leitura confirmou 158 contas: as 156 anteriores, com hash de conteúdo idêntico ao registrado antes da publicação, e duas parcelas novas cadastradas pelo usuário. Dantas e DARF continuavam no banco. Políticas e permissões permaneceram idênticas. Não houve exclusão das contas anteriores nem mudança de RLS nesta regressão.

A correção consulta a lista completa ao entrar em Contas a Pagar/Caixa e após confirmar parcelas. O recibo da operação continua sendo tratado como resultado parcial. Erro de leitura preserva o cache e mostra aviso explícito, sem apresentar totais incompletos como lista completa e sem repetir uma gravação já confirmada. Leituras ultrapassadas ou de outra sessão não sobrescrevem o resultado atual. Os caminhos de pagamento e renderização do Caixa compartilham o mesmo controle de leitura.

Os novos testes integram os módulos reais e o registro das views: criação antes da primeira abertura do Financeiro, desdobramento, navegação, recarga, filtros, falha de leitura após gravação confirmada e respostas concorrentes. Os testes anteriores de navegador usavam um renderizador substituto e não cobriam esse ciclo completo; a regressão foi reproduzida no código anterior antes da validação da correção.

Bateria final: 135 testes aprovados, sem falhas ou skips, incluindo Chromium, VM e PGlite. São 25 novos cenários (6 navegador, 15 listagem e 4 concorrência do Caixa) e 110 regressões de parcelas, integração, pagamento, recibo e Caixa. O baseline no navegador falhou em quatro dos seis novos cenários; a correção passou nos seis. Sintaxe dos módulos e diff também conferidos. O fixture opcional de autenticação Supabase local foi adaptado à dependência real do loader, mas esse cenário específico não foi executado nesta bateria.

Não há migration, alteração de dados financeiros, credenciais, permissões ou configuração de segurança nesta entrega. A publicação segue o `deploy.sh` oficial; build e evidências finais constam no relatório de implantação.
