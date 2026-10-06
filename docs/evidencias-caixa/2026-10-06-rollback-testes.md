# Evidências locais — caixa prospectivo e proteção do rollback

Registro em 06/10/2026 das saídas de terminal já capturadas. Este documento não resulta de uma nova execução. Depois da orientação para aguardar autorização específica de Duam, não foram executados novos testes, SQL, migrações ou rollback.

Todos os dados usados nas execuções abaixo eram sintéticos. Nenhum banco remoto ou credencial real foi utilizado.

## PostgreSQL sintético em PGlite

Arquivo: `tests/caixa-prospectivo-db.test.js`.

Runtime já disponível: PGlite com PostgreSQL 17.5. A saída do runner foi capturada pela ferramenta de terminal, sem gravação de um novo arquivo de log separado.

Trecho transcrito da saída anterior:

```text
✔ cancelamento que falha ao atualizar obrigação mantém movimento ativo e saldo
✔ RLS e RPCs isolam empresa/perfil/sessão; escrita e TRUNCATE diretos são negados
✔ rollback só remove schema vazio; abertura/recibos e movimentos bloqueiam qualquer DROP
tests 18
pass 18
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 12389.8816
```

A suíte também cobriu abertura imutável/idempotente, corte temporal, horário futuro, exatidão dos centavos, transferência/tarifa, reenvio/clique duplo, pagamento parcial e completo, contas antigas já pagas, confirmação de custo avulso e reversão integral após falhas de persistência.

O teste de rollback confirmou três situações: schema totalmente vazio pode ser removido; abertura com recibo bloqueia remoção mesmo sem movimento; movimento registrado bloqueia remoção e permanece auditado.

## PostgreSQL nativo com conexões independentes

Arquivo: `tests/caixa-prospectivo-concorrencia-pg.test.js`.

Trecho transcrito da saída anterior:

```text
CAIXA NATIVO postgres (PostgreSQL) 17.11; listener 127.0.0.1
✔ mesmo UUID simultâneo espera lock e gera um movimento/recibo
✔ UUID simultâneo com payload divergente rejeita sem repetir saldo
✔ duas parciais concorrentes não excedem restante da obrigação
✔ duas parciais válidas serializam e quitam somente uma obrigação
✔ cancelar transferência ainda não confirmada espera e neutraliza as duas contas
✔ rollback da transferência libera espera; cancelamento não fabrica movimento
✔ mesmo cancelamento simultâneo retorna recibo único sem neutralização dupla
✔ rollback aguarda registro concorrente e recusa DROP após commit da abertura
tests 8
pass 8
fail 0
cancelled 0
skipped 0
todo 0
duration_ms 7522.3703
```

Os oito testes verificaram PIDs distintos e observaram `wait_event_type = 'Lock'` e `pg_blocking_pids()` antes de liberar a primeira transação. Pares transcritos dos diagnósticos anteriores:

| Caso | PID aguardando | PID bloqueador |
| --- | ---: | ---: |
| Mesmo UUID | 34116 | 17864 |
| Payload divergente | 30392 | 39092 |
| Parciais excedendo restante | 38388 | 35152 |
| Parciais válidas | 6464 | 40748 |
| Cancelamento de transferência pendente | 32988 | 19312 |
| Transferência revertida | 29276 | 34880 |
| Cancelamento repetido | 27160 | 19100 |
| Rollback contra abertura pendente | 18496 | 27220 |

No último caso, o rollback aguardou a transação que registrava a abertura. Depois do commit, recusou o DROP e preservou duas contas, um recibo e total sintético de 120000 centavos. As sentinelas de custo, folha, estoque e saldo manual permaneceram iguais em todos os casos.

## Arquivos já existentes do último cluster descartável

O runner nativo de oito casos não foi redirecionado para um arquivo separado; seus resultados e PIDs vieram da saída da ferramenta de terminal. Os arquivos do servidor/manifesto do cluster estão nestes caminhos:

```text
C:\Users\Duam Rodrigues\Documents\Codex\2026-10-05\task-3\native-pg-caixa\edr-estoque-pg-ONiOle\postgres.log
C:\Users\Duam Rodrigues\Documents\Codex\2026-10-05\task-3\native-pg-caixa\edr-estoque-pg-ONiOle\ENSAIO-ISOLADO.json
```

O log `postgres.log` é do servidor PostgreSQL; não substitui o resumo do runner acima. O manifesto descreve o cluster local descartável, sua porta e os binários usados.

A verificação de encerramento já executada retornou:

```text
pg_ctl: no server running
```

Essa mensagem foi obtida para o diretório `edr-estoque-pg-ONiOle\data`. A checagem de sintaxe dos dois arquivos JavaScript e `git diff --check` também passou antes da pausa.

## Correção de segurança pendente naquele checkpoint

O patch que adicionaria validação explícita de `company_users.active IS TRUE` nas duas RPCs e nas quatro policies novas foi rejeitado integralmente pela revisão automática, citando a restrição anterior contra mudanças de segurança. Nenhum trecho daquele patch foi aplicado e não houve nova tentativa nem contorno.

Portanto, os resultados acima não comprovam correção do caso de administrador desativado com sessão ainda válida. Naquele checkpoint, o caso ainda aguardava autorização específica e implementação/testes posteriores; a autenticação real de ponta a ponta também não havia sido homologada.

Após a autorização explícita de Duam em 06/10/2026, a correção local foi aplicada e validada em uma execução posterior: veja `2026-10-06-admin-ativo-testes.md` e os dois logs referidos nele. Esse registro posterior não altera os resultados históricos de 18/18 e 8/8 transcritos acima.
