# Execução da implantação do Caixa prospectivo

## Autorização e pacote

Duam confirmou diretamente o alvo exato em **06/10/2026 10:39:07 UTC**, após a pergunta que identificou Supabase EDR SYSTEM (`mepzoxoahpwcvvlymlfh`), site `sistema.edreng.com.br` e repositório `Duamrt/edr-system`. A abertura real ficou separada.

Pacote retomado: `0325011dea1c65f416209d420ed26db94d4f2162`; funcionalidade `b70919c809e7bd4480d8be5888cd0d288e7ef368`, base `7ace6ac5295790acf8b7295dd52c07cc53a92614`. SQL SHA-256 `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a`.

A negativa de 09:52:50 UTC permanece como [histórico](2026-10-06-migracao-producao-bloqueada.md). Antes da repetição única, o catálogo voltou a mostrar ausência dos novos objetos, GitHub `dev`/`main` permaneciam na base e o baseline legado foi comparado integralmente igual. [Preflight da retomada](2026-10-06-retomada-preflight.json).

## Migração concluída

A repetição de `apply_migration` retornou `success: true` às **10:42:27 UTC**. Registro remoto:

- Versão: `20261006104227`.
- Nome: `caixa_prospectivo_por_conta_20261006`.
- Projeto: `mepzoxoahpwcvvlymlfh`, PostgreSQL `17.6`, executor/owner `postgres`.
- Quatro tabelas novas com RLS e **zero linhas em cada uma**.
- Quatro policies `SELECT` para `authenticated`, com tenant e vínculo `active IS TRUE`.
- Clientes `anon` sem SELECT/DML; `authenticated` com SELECT e sem INSERT/UPDATE/DELETE/TRUNCATE diretos.
- Duas RPCs `SECURITY DEFINER`, `search_path=pg_catalog, public`, execução `PUBLIC`/`anon` revogada e `authenticated` concedida.
- MD5 dos corpos exatamente iguais ao SQL homologado: `caixa_estado` = `a708fe6fae5b86d5fc4cc41d905f80a3`; `caixa_registrar` = `884a638a876ab5c8f90490c3c74c7dd9`.
- Helpers, função de auditoria, owners, ACLs e policies legadas relacionados foram comparados integralmente iguais antes/depois.

[Metadados e contagens pós-migração](2026-10-06-migracao-producao-verificacao.json), consultados às 10:43:44 UTC. Nenhuma abertura, movimento, obrigação de teste, cobrança ou escrita financeira real foi criada pela tarefa.

O backup físico existente `1884527306`, `COMPLETED` em 06/10/2026 07:44:51.78 UTC, foi reconfirmado imediatamente antes da migração. Nenhum download/restore real ou custo foi gerado.

## Publicação

Etapa seguinte: commit apenas destas evidências/documentos e execução do `deploy.sh` existente em `dev` limpa na cópia isolada. O script fará cache busting e pushes `dev`/`main`; sua mensagem de sucesso não substitui a verificação de build/SHA/arquivos servidos. Registrar resultados efetivos nesta seção após confirmação.

## Limites e abertura

Homologação sintética: regressão 279 PASS/0 FAIL; Auth real 15/15; UI com RPC real 1/1; recuperação 10/10; contingência 5/5. Os dois grupos opcionais da regressão passaram separadamente. Login visual/dashboard integral e smoke autenticado em produção não foram executados por falta de sessão própria legítima disponível; não criar credenciais ou usar a sessão do usuário para suprir isso.

Abertura real permanece **não executada**, exigindo declaração específica de tenant, marco e saldos por conta. Os recebíveis de outra tarefa não integram o pacote. Após uso, preservar ledger/recibos e seguir o roteiro de contingência; nenhum rollback de banco foi executado.
