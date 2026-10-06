# Recuperação sintética: resultado final

Em 06/10/2026, o ensaio local passou **10/10 testes, zero falhas, cancelamentos ou skips**, em PostgreSQL/pg_dump/pg_restore/pg_dumpall **17.11**. Node conta nove verificações e o agrupador; duração total **5765,4716 ms**. O [teste executado](../../tests/caixa-recuperacao-pg.test.js) tem SHA-256 `5d1962b7fc0a4c30474cd1179f6242354be7ec94eca193eb35ce1a0c0c32fab9`; execuções anteriores da regressão geral não devem ser atribuídas a este arquivo após o reforço do teste de truncamento.

A restauração custom integral em banco **novo**, por `--single-transaction --exit-on-error`, preservou dados, owners, ACLs, policies, flags RLS, funções, constraints, snapshots de obrigações, datas originais e histórico auditado sintético. Os 12 recibos foram reenviados com os mesmos UUIDs/pedidos, sem alterar qualquer linha, timestamp, auditoria ou saldo. Pagamentos parciais, quitação, cancelamento, movimentos incluídos na abertura e transferência com tarifa separada estão no dataset.

Os testes negativos confirmaram fonte intacta: divergência do hash impede criar destino; dump truncado com TOC legível falha **durante a carga** e o destino fica sem tabelas; conflito SQL no banco novo reverte a carga preservando apenas a sentinela anterior ao restore. Destinos de falha recebem `complete=false`.

O cluster sintético, PID **35728**, porta **51975** apenas `127.0.0.1`, foi encerrado e confirmado: `pg_ctl status=3`, sem `postmaster.pid`. Não houve Authstack, produção, dados reais ou publicação neste ensaio. Dumps, roles e snapshots continuam fora do checkout.

Evidências originais, relativas à pasta `task-3`:

- `native-pg-caixa-recuperacao/2026-10-06-recuperacao-final.tap.log`
- `native-pg-caixa-recuperacao/edr-estoque-pg-HaBeLH/RECUPERACAO-RESULTADO.json`
- `native-pg-caixa-recuperacao/edr-estoque-pg-HaBeLH/BACKUP-MANIFESTO.json`
- `native-pg-caixa-recuperacao/edr-estoque-pg-HaBeLH/ferramentas.jsonl`

O TAP integral foi copiado para [2026-10-06-recuperacao-local.tap.log](2026-10-06-recuperacao-local.tap.log), sem nova execução; SHA-256 `4461a9f531e9fa2281277dfa067131cca7b8f6c7f74a560149760df461f4e964`. O [roteiro](../recuperacao-caixa/backup-restore-local.md) registra versões, hashes e limites. A revisão independente inicial não encontrou bugs; sua observação sobre truncamento foi reforçada e reexecutada no resultado acima. O revisor principal conferiu posteriormente o TAP final, o resultado JSON, os hashes e a falha durante a carga, sem novo bug. Sua observação de clareza foi resolvida: o roteiro não exige recuperação física gerenciada fora do escopo para a aplicação aditiva em tabelas novas/vazias.

Este resultado comprova dump/restore lógico da fixture/DRAFT, no mesmo cluster com roles já existentes. Não comprova restauração física dos backups gerenciados de produção, recriação de roles em outro cluster, auditoria/schema legado reais, PITR ou JWT/Auth real. A confirmação separada da existência de backups gerenciados não amplia este resultado.
