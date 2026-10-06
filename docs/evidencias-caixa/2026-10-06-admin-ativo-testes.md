# Validação local — administrador ativo no Caixa

Duam autorizou explicitamente em 06/10/2026 a restrição das duas RPCs e quatro policies novas do Caixa a administradores com vínculo ativo, assim como ensaios locais com dados e identidades sintéticas.

O patch DRAFT valida `company_users.user_id = auth.uid()`, empresa correspondente, papel `admin` e `active IS TRUE`. A verificação precede leitura, escrita e consulta de recibo/reenvio. As quatro policies SELECT qualificam a empresa da própria tabela. Nenhuma função, policy, grant ou estrutura legada foi alterada pela migração.

A fixture de teste reproduz os helpers legados que ignoram `active` e a policy de leitura de `company_users`, sem acesso remoto. Isso permite testar a proteção mesmo quando o UID e os helpers continuam indicando administrador e empresa após desativação.

## Resultados das execuções posteriores à autorização

| Suíte | Ambiente | Resultado | Duração do runner |
| --- | --- | --- | --- |
| `tests/caixa-prospectivo-db.test.js` | PGlite / PostgreSQL 17.5 sintético | 20 aprovados, zero falhas ou skips | 16936.2719 ms |
| `tests/caixa-prospectivo-concorrencia-pg.test.js` | PostgreSQL 17.11 nativo descartável | 8 aprovados, zero falhas ou skips | 7925.1409 ms |

Logs completos do runner, gravados nestas execuções:

- `docs/evidencias-caixa/2026-10-06-admin-ativo-pglite.log`
- `docs/evidencias-caixa/2026-10-06-admin-ativo-nativo.log`

O novo teste confirmou, com a mesma sessão simulada, que `active = false` e `active = NULL` negam leitura das quatro tabelas, RPC de estado, nova movimentação, pagamento/reenvio pelo recibo, cancelamento e abertura. A reativação devolve o acesso, preserva o estado e retorna o recibo original; outro tenant continua isolado. O preflight rejeita `company_users` sem `active boolean` antes de criar objetos de caixa.

Todos os testes de corte, idempotência, pagamentos, falhas transacionais e isolamento continuaram aprovados. A proteção do rollback por locks exclusivos e bloqueio após qualquer dado também foi mantida. No ensaio nativo, os oito casos observaram espera real entre PIDs independentes antes de liberar a primeira transação.

O último cluster nativo ficou em:

```text
C:\Users\Duam Rodrigues\Documents\Codex\2026-10-05\task-3\native-pg-caixa\edr-estoque-pg-qHUJOB
```

O harness limitou o listener a `127.0.0.1` e encerrou o cluster no teardown. Uma checagem posterior pelo `pg_ctl` desse diretório confirmou `no server running`. `node --check` dos dois testes e `git diff --check` passaram.

## Identificação dos artefatos testados

SHA-256 lido após essas execuções:

| Arquivo | SHA-256 |
| --- | --- |
| `sql/caixa-prospectivo-DRAFT.sql` | `8FE4DC1CFF2B09429E7D7F6959D1BB1396C3693FDAD49B310DD630FA5CCA167A` |
| `sql/caixa-prospectivo-rollback-DRAFT.sql` | `8386ADA6417AD76DC6968272FCFAD442073ED6F2BED8A9B3AFC92B4B35BFDDB8` |
| `tests/fixtures/caixa-prospectivo-base.sql` | `112B09158A275EC4BACEA226CF22A93A53D6A88E50F2013FAC0FC9C4D50BA4EA` |
| `tests/caixa-prospectivo-db.test.js` | `2670E0DD4E9FDCA9328EF981505ED20F3A197D243D43F4B0E39C1E4C5B37597E` |

Estas suítes usam autenticação simulada no banco local. Não substituem a homologação de Auth/JWT reais de ponta a ponta. Nenhuma migração, dado, política ou grant foi aplicado a banco remoto; nenhum push ou deploy foi executado por este trabalho.
