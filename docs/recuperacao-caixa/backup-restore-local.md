# Recuperação do Caixa — ensaio PostgreSQL 17 local

Ensaio concluído em **06/10/2026: 10/10 testes aprovados**, zero falhas, cancelamentos ou skips. O Node conta nove verificações e o agrupador. PostgreSQL, `pg_dump`, `pg_restore` e `pg_dumpall`: **17.11**. A restauração integral em banco novo preservou os dados e o catálogo; o reenvio dos 12 recibos não alterou saldo, recibos, snapshots ou histórico. O cluster foi encerrado e seu encerramento foi confirmado.

Implementação reproduzível: [tests/caixa-recuperacao-pg.test.js](../../tests/caixa-recuperacao-pg.test.js), usando o [harness existente](../../tests/fixtures/estoque-pg-local.cjs), a [fixture sintética](../../tests/fixtures/caixa-prospectivo-base.sql) e o [DRAFT atual](../../sql/caixa-prospectivo-DRAFT.sql). Este trabalho não modifica esses três arquivos, o rollback DRAFT, o frontend nem o roteiro principal.

## Executar novamente

Na raiz deste checkout isolado, com Node e os binários PostgreSQL 17 já disponíveis:

```powershell
$env:EDR_POSTGRES_BIN = 'C:/Users/Duam Rodrigues/Documents/Codex/2026-09-06/auditoria-estoque-edr-system/work/postgresql17-portable/pgsql/bin'
node --check tests/caixa-recuperacao-pg.test.js
node --test --test-reporter=tap tests/caixa-recuperacao-pg.test.js
```

O runner cria sua própria pasta aleatória fora do checkout, em `../native-pg-caixa-recuperacao/edr-estoque-pg-*`. É possível mudar somente essa pasta privada com `EDR_PG_TEST_ROOT`: ela deve ficar dentro da tarefa ou do TEMP e fora do checkout. `EDR_POSTGRES_BIN` é uma pasta de executáveis já instalados; não instala ferramentas. Sem essa variável, o teste registra **skip**, que não comprova recuperação.

O teste não recebe host, URL, senha, nome de banco existente nem flags de conexão. Remove as variáveis herdadas `PG*`; fixa clientes e servidor em `127.0.0.1`; escolhe uma porta livre; inicia um cluster novo com `initdb`; oculta processos no Windows. Em `finally`, fecha conexões, para o cluster e exige `pg_ctl status=3` e ausência de `postmaster.pid`. Se a execução falhar, o exit code e os registros de falha devem ser tratados como falha do ensaio.

## O que o roteiro faz e confere

1. Cria roles sintéticas `anon`, `authenticated` e um owner `NOLOGIN`, dois tenants e obrigações sintéticas. As tabelas e funções pertencem ao owner dedicado, para que a comparação de owners tenha significado.
2. Instala apenas no banco descartável a fixture e o DRAFT. Acrescenta na fixture inline um schema privado de teste, histórico de `contas_pagar`, trigger de auditoria sintético e sentinela fiscal. Não altera ou representa os triggers de produção.
3. Registra abertura por conta, entrada, saída, transferência com tarifa separada, pagamento parcial, duas parciais que quitam outra obrigação, pagamento integral cancelado e movimento incluído na abertura. Mantém também uma conta antiga já paga e uma obrigação de outro tenant.
4. Gera dump **custom integral do banco sintético**, sem filtrar apenas as tabelas novas. Assim, inclui as dependências, ledger, recibos, snapshots de obrigações, dados e histórico de `contas_pagar`, funções, policies, ACLs, constraints, índices, trigger sintético e sequência de auditoria.
5. Gera um arquivo separado de roles com `pg_dumpall --roles-only --no-role-passwords` e verifica ausência de cláusula `PASSWORD`. Calcula SHA-256 dos artefatos, código, fixture, DRAFT, harness e representações normalizadas dos dados/catálogo. Confere o TOC com `pg_restore --list`.
6. Cria um banco destino que ainda não existe, com o mesmo owner, e executa `pg_restore --single-transaction --exit-on-error`. Não usa `--clean`, `--create`, `--no-owner` ou `--no-acl`; nunca restaura sobre a fonte.
7. Compara todas as linhas, timestamps, identificadores, pedidos/resultados dos recibos, cancelamentos, snapshots e histórico. Compara esquema, owners, ACLs, flags RLS, policies, funções e `search_path`, defaults de colunas, constraints, índices, triggers, sequência de auditoria e atributos do banco. O resultado de `pg_restore` sozinho não confirma recuperação.
8. Compara `caixa_estado()` dos dois tenants e reenvia **todos os 12 UUIDs** com os pedidos originais. Exige o mesmo recibo e igualdade integral de dados antes/depois. Verifica leitura por tenant, ausência de escrita direta em tabelas do Caixa, negação de execução para `anon` e rejeição de administrador inativo, inclusive em retry.
9. Verifica os casos de erro abaixo e confirma que a fonte mantém dados e catálogo intactos. Somente após todas as verificações o relatório final marca `recovery_confirmed=true`.

O conjunto contém 12 recibos, nove movimentos, três snapshots de obrigações e dez eventos no histórico sintético de contas a pagar. Status e data originais da obrigação cujo pagamento foi cancelado são mantidos. Custos, estoque, folha, saldo manual e sentinela fiscal permanecem idênticos ao snapshot.

## Falhas ensaiadas

| Caso | Resultado exigido e observado |
| --- | --- |
| Arquivo truncado e manifesto original | SHA-256 divergente; recusa antes de criar o destino; `complete=false`. |
| Arquivo truncado com TOC legível e hash próprio de teste | `pg_restore` falha durante a carga; a transação única desfaz tabelas/dados parciais; o novo banco fica sem tabelas da aplicação; `complete=false`. |
| Conflito SQL criado somente no novo banco destino | `pg_restore` falha e reverte tudo que começou a criar; a tabela sentinela anterior ao restore continua intacta; `complete=false`. |

Todos esses casos preservam o banco fonte, que continua com os mesmos dados e catálogo. Os bancos de falha nunca são promovidos nem confundidos com o destino validado. O arquivo `BACKUP-MANIFESTO.json` mantém `recovery_confirmed=false`: possuir um dump não comprova que ele foi recuperado. O resultado da recuperação fica em `RECUPERACAO-RESULTADO.json` e em um relatório separado por tentativa de restauração.

## Evidências da execução final

Execução reforçada, em UTC: **2026-10-06T09:28:33.736Z → 09:28:37.446Z**. PID PostgreSQL sintético **35728**, porta **51975**, somente loopback. Encerramento confirmado pelo runner após `pg_ctl stop`; `pg_ctl status` retornou **3** e `postmaster.pid` estava ausente.

Pasta privada, fora do checkout:

```text
../native-pg-caixa-recuperacao/edr-estoque-pg-HaBeLH/
```

Nessa pasta:

- `RECUPERACAO-RESULTADO.json`: nove resultados, hashes comparados, tentativas de falha e confirmação de encerramento.
- `BACKUP-MANIFESTO.json`, `dump-toc.txt`, `ferramentas.jsonl`: versões, conteúdo do archive e stdout/stderr/exit code das ferramentas.
- `snapshot-dados-sinteticos.json`, `snapshot-catalogo.json`: estados comparados pela execução.
- `postgres.log`, `ENSAIO-ISOLADO.json`: log e configuração do cluster descartável.
- `caixa-sintetico.dump`, `caixa-truncado.dump`, `roles-sinteticas-sem-senhas.sql`: artefatos privados sintéticos, mantidos somente para evidência local.
- `edr_caixa_rec_destino_*-restore.json`: um resultado por tentativa, incluindo `complete=false` nos erros.

TAP integral: `../native-pg-caixa-recuperacao/2026-10-06-recuperacao-final.tap.log`.

| Item | SHA-256 |
| --- | --- |
| Teste executado | `5d1962b7fc0a4c30474cd1179f6242354be7ec94eca193eb35ce1a0c0c32fab9` |
| DRAFT executado | `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a` |
| Dump custom, 53.115 bytes | `57a89890ba464141dfb448a77b115e2a14411efb911284a4795eef5b5fbab794` |
| Dados fonte = dados restaurados | `3a0dba294ed0d9867868ad08d9e802d4e73013047cf13bcddcaa9ded2e4eb423` |
| Catálogo fonte = catálogo restaurado | `32f2e89d72a8b99a57792e415d9032cff27b1cac03410ec4e50f2d9cd2a8439f` |

Não versionar dumps, diretórios `data`, arquivos de roles ou snapshots financeiros. Neste ensaio ficam fora do checkout. O código e este roteiro usam somente exemplos sintéticos; não contêm a foto financeira privada declarada pelo usuário.

## Limites e implantação

Este resultado comprova recuperação do **schema da fixture e DRAFT**, em banco novo no mesmo cluster PostgreSQL 17.11. Roles são objetos globais: o dump do banco preserva referências a elas e suas ACLs, mas não cria as roles. O ensaio captura definições sem senhas, compara seus atributos/memberships e verifica que não foram alteradas; **não ensaia recriação de roles em um segundo cluster**. A restauração em outro cluster deve preparar e conferir previamente os owners e as roles autorizadas, sem importar indiscriminadamente roles de infraestrutura.

Os helpers da fixture simulam UID de sessão com GUC; não há GoTrue/PostgREST/JWT neste ensaio. Não foram executados backup ou restauração no Auth stack, em Supabase remoto ou em produção. Não foram homologados aqui schema legado completo, triggers reais de auditoria, extensões, grants reais de infraestrutura, concorrência de escrita durante o backup, PITR, recuperação entre clusters nem objetivos operacionais de tempo/perda de dados.

Este dump/restore lógico sintético não comprova a recuperabilidade nem a restauração física dos backups gerenciados reais, mesmo quando sua existência foi confirmada por consulta de leitura separada.

O ensaio sintético concluído é a prova local de recuperação deste pacote. A existência dos backups físicos gerenciados é uma evidência separada de metadados. A aplicação aditiva do DRAFT em tabelas novas e vazias não exige nem justifica executar um restore destrutivo de produção. A revisão dos alvos/schema/owners reais e as demais condições de implantação seguem o roteiro principal; este documento não acrescenta um ensaio físico gerenciado fora do escopo autorizado.

Se uma recuperação operacional completa se tornar necessária após uso do Caixa, preparar um plano específico para o ambiente e estado afetados, incluindo dependências, auditoria, owners, roles e política de backup reais, e validá-lo na homologação apropriada antes da recuperação. Este roteiro não contém comandos para banco remoto e não autoriza aplicação do DRAFT, execução de migração remota, push, deploy, alteração de dados reais ou publicação do dump. Não há bloqueio para repetir o ensaio sintético local com os binários instalados.

Referências usadas: [PostgreSQL 17 — pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html), [pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html) e [pg_dumpall](https://www.postgresql.org/docs/17/app-pg-dumpall.html). A documentação distingue dump de banco de objetos globais e descreve os formatos de archive e a restauração em transação única.
