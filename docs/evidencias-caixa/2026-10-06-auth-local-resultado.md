# Resultado de Auth/RLS real na QA local

**APROVADO: 15/15 testes, 0 falhas, 0 skips, 4,28 segundos.** Registro em 06/10/2026 09:32 UTC; 14 cenarios mais o agregador do Node. [Log publico sanitizado](2026-10-06-auth-local.log) e [protocolo/comandos/limites](2026-10-06-auth-local-protocolo.md).

O alvo foi exclusivamente `edr-caixa-qa-20261006`, API `127.0.0.1:55321` e DB `127.0.0.1:55322`. A tarefa principal conferiu bindings reais Docker, saude, labels e ausencia de vinculo remoto antes da execucao. Nao houve migracao remota, deploy, copia de usuarios/dados de producao ou criacao de abertura real.

## Mecanismo exercitado

Oito identidades sinteticas foram criadas no GoTrue LOCAL e autenticadas por senha. Os JWTs emitidos passaram por `/auth/v1/user` e foram enviados ao PostgREST real. O SQL administrativo preparou/conferiu fixtures; nao simulou JWT, `auth.uid()` nem RLS de cliente.

- Admin A e admin B acessaram apenas seus tenants. Ambas empresas tinham dados nas quatro tabelas.
- Operacional, mestre, visitante, sem empresa e admins `active=false`/`NULL` foram negados nas duas RPCs; SELECT retornou vazio.
- Admin desativado depois do login, ainda com JWT valido, nao leu, escreveu nem recuperou recibo por retry. Reativacao exclusivamente sintetica devolveu o recibo original sem novo movimento.
- Sem chave/sessao, chave anon sem JWT de sessao, bearer anon, senha incorreta, JWT malformado e assinatura de JWT REAL adulterada foram rejeitados.
- INSERT/UPDATE/DELETE diretos das quatro tabelas foram negados inclusive a admin ativo.
- Tenant como argumento, conta/destino/obrigacao/cancelamento de outra empresa e UUID/payload A reenviado por B foram rejeitados sem alterar as contagens.
- Abertura, corte efetivo (incluindo dia sem hora), entrada, saida, transferencia, parcial/total, cancelamento e dois pedidos HTTP simultaneos com o mesmo UUID passaram por RPC real.
- Pagamento acionou `fn_audit_log()` com UID e nome do Auth real. Saldo manual, custo, folha fechada, estoque e obrigacao anteriormente paga permaneceram iguais.
- Catalogo confirmou quatro RLS/policies SELECT, nenhuma permissao DML cliente, EXECUTE negado a PUBLIC/anon, EXECUTE authenticated e duas RPCs SECURITY DEFINER com owner/search_path esperados.
- Rollback vazio recusou dados auditados e preservou movimentos/recibos/API. Recuperacao por backup/restore e UI Chromium com RPC real sao evidencias separadas.

## Versoes e limites

Runtime registrado pela tarefa principal: CLI oficial `2.119.0`, Docker Desktop `4.92`, engine `29.8`, PostgreSQL imagem `17.11.0.002`, GoTrue `2.197` e PostgREST `16.4`. O driver confirmou `server_version=17.11`. PostgreSQL gerenciado EDR previamente coletado: `17.6.1.063`.

Helpers/policies/grants/constraints e auditoria vieram dos snapshots reais revisados; nao houve mudanca de seguranca legada. Obras/NFs sao dependencias minimas, custos/folha/estoque sentinelas e o caminho auxiliar platform admin nao integra esta matriz. Isso prova o mecanismo local oficial, nao a configuracao gerenciada de producao, callback/OAuth externo, dashboard completo ou sessao existente no site publico.

O primeiro ensaio teve 10 aprovados/5 falhos, incluindo agregador: faltava uma aspa na consulta de auditoria do harness, interrompendo cancelamentos e causando falhas dependentes. A consulta foi corrigida, a stack QA foi reconstruida pelo responsavel e o ensaio completo repetido limpo. O log inicial foi preservado fora do repositorio; nenhuma alteracao da migracao foi necessaria.

## SHA-256 dos artefatos executados

| Artefato | SHA-256 |
| --- | --- |
| `sql/caixa-prospectivo-DRAFT.sql` | `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a` |
| `tests/caixa-prospectivo-auth-local.test.js` | `f47948f2a4f7bed073520302eb93ca65f420fe1f26878f21809793918c0a31eb` |
| `tests/fixtures/caixa-supabase-local-runtime.cjs` | `8244cf4f38bdfa7970e67219d55eb6b5a482283cb07f127c230c48dfe5d187ba` |
| `tests/fixtures/caixa-supabase-local-bootstrap.sql` | `aac166628d89256507c7818fe458959efa80282a28ad927136125ceec94bc7a8` |
| `scripts/caixa-auth-local-bootstrap.cjs` | `8075ce3782d0abe813c3003130441e6aa36165760f91364806becd65205d2fdc` |
| `docs/evidencias-caixa/2026-10-06-auth-local.log` | `242a1786d9fc8fc62fb6d56a05602e306b8102d1fffbffcf58834ddcac26c8ac` |
