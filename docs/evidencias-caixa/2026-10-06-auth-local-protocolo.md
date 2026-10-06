# Protocolo de homologacao Auth local do Caixa

Este protocolo executa GoTrue e PostgREST da stack Supabase oficial em ambiente local descartavel. JWTs sao emitidos por login real, enviados ao REST e verificados pelo servidor. `execute_sql` administrativo e `set request.jwt.claims` nao substituem estas verificacoes.

Ensaio executado e **aprovado em 06/10/2026: 15/15 testes, 0 falhas, 0 skips** (14 cenarios e agregador). [Resultado e hashes](2026-10-06-auth-local-resultado.md) e [log sanitizado](2026-10-06-auth-local.log). O [E2E Chromium com RPC real](2026-10-06-ui-auth-real-resultado.md) tambem passou 1/1. Nenhuma senha, JWT, chave ou conteudo do status JSON integra essas evidencias.

## Alvo e protecoes

- Projeto local: `edr-caixa-qa-20261006`, pasta `task-3/caixa-auth-local`, fora do repositorio.
- API exclusiva: `http://127.0.0.1:55321`; PostgreSQL exclusivo: `127.0.0.1:55322`, banco/usuario `postgres`.
- O runtime recusa host remoto, porta divergente, projeto vinculado por `.temp/project-ref`, config com identidade divergente e status privado dentro do repositorio.
- Nenhuma chamada usa configuracao/chave do EDR remoto. SQL usa `psql` existente com senha local em arquivo temporario privado externo, removido ao terminar. Chaves e JWTs usados pelo driver ficam somente em memoria.
- Dados e oito identidades sao integralmente sinteticos. Nenhum dump de dados de producao integra o ambiente.
- Antes de executar, conferir `docker inspect` dos containers desta stack: portas publicadas somente com HostIp `127.0.0.1`. A validacao de URL no driver protege o destino do cliente; nao substitui a verificacao do binding real do servidor.

## Ordem local

Depois que a stack estiver saudavel, informar os caminhos reais sem colar o conteudo dos arquivos privados:

```powershell
$env:EDR_CAIXA_AUTH_LOCAL_DIR = '<task-3>/caixa-auth-local'
$env:EDR_CAIXA_AUTH_LOCAL_STATUS = '<stack-local>/status.PRIVADO.json'
$env:EDR_POSTGRES_BIN = '<PostgreSQL-17-existente>/bin'
node scripts/caixa-auth-local-bootstrap.cjs
# Aplicar caixa-prospectivo-DRAFT.sql SOMENTE no mesmo PostgreSQL local validado.
# Recarregar schema PostgREST: NOTIFY pgrst, 'reload schema';
node --test tests/caixa-prospectivo-auth-local.test.js
```

Bootstrap e driver exigem ambiente novo. Nao sobrescrevem empresas, usuarios, obrigacoes ou movimentos existentes. Um ensaio interrompido exige reconstruir apenas a stack local descartavel pelo responsavel; nao adaptar este script para producao.

## Cobertura

O driver cria e autentica admin da empresa A, admin da empresa B, operacional/mestre/visitante A, usuario sem empresa e dois admins A desativados (`false`/`null`) **apos** login. Depois valida:

1. Auth real: criacao local de identidades, login por senha, leitura do usuario autenticado, senha incorreta, JWT malformado e JWT GoTrue real com assinatura adulterada.
2. Sem sessao/anon: RPCs e SELECT das quatro tabelas negados.
3. Perfis: operacional, mestre, visitante, sem empresa e admins inativos nao acessam o Caixa; SELECT retorna vazio e RPC nega a operacao.
4. RLS: ambos tenants possuem linhas nas quatro tabelas; cada admin ve somente a propria empresa, inclusive ao filtrar a outra explicitamente.
5. DML direto: INSERT/UPDATE/DELETE nas quatro tabelas negados a admin e operacional, sem alteracao das contagens.
6. RPCs: tenant nao e argumento permitido; conta, destino, obrigacao e cancelamento de outra empresa sao rejeitados; UUID/payload de recibo de A reenviado por B nao retorna o recibo de A.
7. Admin com JWT ainda valido desativado em banco perde leitura, escrita e retry de UUID antes de recuperar o recibo; reativacao apenas sintetica recupera o mesmo recibo.
8. Financeiro: abertura separada/imutavel, entrada, saida, transferencia vinculada, tarifa como saida, parcial/total, cancelamento, retry, dois pedidos HTTP simultaneos com o mesmo UUID e corte efetivo com classificacao explicita quando falta horario.
9. Auditoria legada: pagamento em `contas_pagar` aciona `fn_audit_log()` com usuario e nome provenientes da sessao Auth real.
10. Catalogo: RLS nas quatro tabelas, policies SELECT para authenticated, owner/search_path dos RPCs, nenhum DML cliente, nenhum EXECUTE PUBLIC/anon e EXECUTE authenticated restrito pelo corpo da RPC.
11. Preservacao: saldo_manual, custos, folha fechada, estoque e obrigacao ja paga permanecem iguais. O rollback vazio recusa dados auditados sem remover movimentos/recibos.

## Fidelidade e limites

Colunas/defaults obrigatorios, constraints de companies/company_users/contas_pagar, helpers e policies legadas, grants herdados e corpo do trigger usam os snapshots versionados de metadados reais. `audit_logs` reproduz suas 11 colunas e constraints. `auth.uid`, schema Auth, roles, assinaturas, emissao e verificacao JWT pertencem a stack oficial, sem mocks.

Obras e notas fiscais sao apenas dependencias minimas para satisfazer FKs; custos/folha/estoque sao sentinelas de preservacao, nao uma replica dos modulos. A policy auxiliar de empresas inclui `is_platform_admin()`; o bootstrap representa somente seu caminho `false` porque nao cria platform admins de QA. O novo Caixa nao depende desse helper. O trigger de protecao de edicao de company_users nao e reproduzido, pois nenhum RPC do Caixa edita essa tabela; desativacoes no ensaio sao preparacao administrativa local.

Homologacao local nao demonstra a configuracao gerenciada de Auth, rede ou usuarios existentes da producao. Antes de publicar, comparar novamente helpers/policies/grants/owners reais; depois da publicacao, usar sessao autorizada existente para smoke somente de leitura, sem criar abertura ou movimentos ficticios em producao. Recuperacao por backup/restore e roteiro de rollback de aplicacao sao ensaios separados, sempre preservando movimentos posteriores.

## Referencias oficiais consultadas

Consulta em 06/10/2026: [login por senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [identidades e criacao administrativa com email confirmado](https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0) e [claims e assinatura dos JWTs](https://supabase.com/docs/guides/auth/jwt-fields). Nenhum fluxo de migracao de usuarios descrito na referencia foi executado; criacao administrativa serve exclusivamente as oito identidades sinteticas locais.
