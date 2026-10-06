# Caixa prospectivo — roteiro de homologação e implantação

Preparado em 06/10/2026 em cópia isolada. A homologação local foi concluída: Auth/PostgREST real 15/15, interface com RPC real 1/1, recuperação sintética 10/10, contingência Chromium 5/5 e regressão integral 279 PASS/0 FAIL. Dois grupos opcionais da regressão foram executados separadamente com sucesso. A revisão técnica aprovou a DDL aditiva vazia de SHA-256 `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a`. Os gates técnicos da autorização condicional foram cumpridos. A aplicação de produção foi rejeitada pela revisão automática por falta de aprovação direta para o projeto exato; veja o [bloqueio e liberação necessária](evidencias-caixa/2026-10-06-migracao-producao-bloqueada.md). O registro abaixo distingue execução real de preparação; abertura real continua pendente de autorização própria.

## Versões e controle da execução

| Item | Registro atual |
| --- | --- |
| Repositório | `Duamrt/edr-system` |
| Base revisada | `7ace6ac5295790acf8b7295dd52c07cc53a92614` |
| Branch local | `dev` na cópia isolada; `main` local preparada; refs remotas preservadas em `7ace6ac` |
| Commit novo da funcionalidade | **PENDENTE** — preencher SHA completo após congelar/revisar o pacote |
| Commit/build de publicação | **PENDENTE** — preencher após execução autorizada de `deploy.sh` |
| Cache observado na cópia | Scripts `?v=10051611`; SW `edr-system-v20261005161158`; não são a versão futura |
| Migração local revisada | `sql/caixa-prospectivo-DRAFT.sql`; SHA-256 `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a`; aplicada somente à stack QA local |
| Ambiente/projeto de homologação | Stack local `edr-caixa-qa-20261006`, pasta irmã `caixa-auth-local`, sem `project-ref`; Auth/PostgREST reais e dados/identidades sintéticos |
| Resultado Auth/PostgREST local real | **APROVADO: 15/15 PASS**, zero falhas/skips, 4281,1055 ms; [log](evidencias-caixa/2026-10-06-auth-local.log). Não equivale a homologar configuração/usuários de produção |
| Backup e restauração de produção | Oito backups físicos `COMPLETED` comprovados em leitura; restauração física real **NÃO EXECUTADA / NÃO PROVADA** |
| Migração em produção | **BLOQUEADA pela revisão automática** - falta aprovação direta para `mepzoxoahpwcvvlymlfh` |
| Publicação/propagação | **PENDENTE** - depende da migração; nenhum push/deploy executado |
| Corte e saldos para ativação | **PENDENTE** — declaração privada revisada para o marco escolhido |
| Ativação e smoke posterior | **PENDENTE** |

Antes de qualquer execução, completar os campos com data/hora/fuso, alvo, SHA do pacote e evidências reais. Não registrar como aprovado/executado apenas porque o roteiro existe. O ajuste de recebíveis por obra de outra tarefa fica fora deste pacote.

## Estado atual e histórico da autorização

As informações remotas e da stack foram comunicadas pela tarefa principal em 06/10/2026; esta subetapa documental não executou consultas remotas nem operações de infraestrutura.

| Verificação | Resultado observado | Efeito sobre a implantação |
| --- | --- | --- |
| Referências do repositório | `origin/dev` e `origin/main` em `7ace6ac5295790acf8b7295dd52c07cc53a92614`. | Funcionalidade nova não publicada; reconferir os SHAs na execução futura. |
| Destino configurado | Supabase `mepzoxoahpwcvvlymlfh`; CNAME `sistema.edreng.com.br`. | Produção existente; não foi alvo de migração ou ensaio mutante. |
| PostgreSQL existente | 17.6; leitura como `postgres`, `auth.uid()` nulo e sem claims. | Não comprova login JWT, RPC por usuário ou isolamento ponta a ponta. |
| Schema de produção | Objetos `caixa_*` ausentes; pré-requisitos de `contas_pagar` presentes; `audit_contas_pagar` chama `fn_audit_log`. | Migração de produção não aplicada; metadados subsidiaram o bootstrap sintético local. |
| Ambiente remoto isolado | EDR com somente branch `main`; outros projetos não identificados como staging do EDR. | Nenhuma branch remota criada; não usar outro projeto por suposição. |
| Bloqueio local inicial, histórico | Docker engine indisponível e CLI não localizada antes da autorização específica. | Superado pela preparação local autorizada descrita abaixo. |
| Autorização específica | Duam respondeu **“SIM.EU AUTORIZO”**, em 06/10/2026 às **08:58:37 UTC**. | Autoriza iniciar Docker, instalar CLI e restringir os dois RPCs/quatro policies novos a admins ativos; não libera produção/abertura/deploy antes da homologação. |
| Correção local aplicada | Vínculo admin ativo exigido nos dois RPCs e quatro policies SELECT novas; helpers/policies/grants legados preservados. | 20 PGlite, 8 PostgreSQL nativo e 38 UI aprovados após os fixes. |
| Regressão integral de congelamento | **279 PASS / 0 FAIL / 2 SKIP**, de 281 testes; [log final](evidencias-caixa/2026-10-06-regressao-integral.log). | Dois grupos Auth/UI real opcionais passaram separadamente: 15/15 e 1/1. |
| Stack QA | `edr-caixa-qa-20261006`, pasta irmã `caixa-auth-local`, sem `project-ref`; bootstrap e migração LOCAL aplicados. | Dados e identidades sintéticos. Inventário após bootstrap: quatro tabelas RLS, duas funções `SECURITY DEFINER`, zero aberturas antes dos ensaios. |
| Auth/PostgREST real | Reensaio limpo: **15/15 PASS**, zero falhas/skips, 4281,1055 ms; oito logins GoTrue e JWTs reais. Tenant, perfis, admin inativo/nulo, DML, reenvio/HTTP simultâneo, parcial, cancelamento, auditoria, corte, catálogo e rollback aprovados. | [Log sanitizado](evidencias-caixa/2026-10-06-auth-local.log). Primeiro ensaio 10 PASS/5 FAIL foi diagnóstico do harness, superado pelo reensaio final; configuração gerenciada de produção não foi ensaiada. |
| Backups de produção | Consulta CLI oficial read-only às 09:28:40 UTC comprovou oito backups físicos `COMPLETED`, último ID `1884527306`, de `2026-10-06T07:44:51.78Z`; WALG ativo e PITR desativado. | Disponibilidade comprovada; restauração física real não executada/provada e retenção contratada não inferida. Nenhum login novo, download ou restore. |

**Histórico da negativa:** o revisor automático rejeitou inicialmente a edição de autorização por ser mudança de segurança sem consentimento suficiente. O patch não foi aplicado naquela tentativa nem a rejeição foi contornada. A confirmação específica de Duam às 08:58:37 UTC antecedeu sua aplicação local e os novos testes. Os [metadados e bloqueios](evidencias-caixa/2026-10-06-bloqueios.md) preservam esse registro; os [dados da stack](evidencias-caixa/2026-10-06-stack-local.md) registram a preparação posterior.

**GO técnico para migração aditiva vazia e publicação:** Auth/RLS real, UI com RPC real, recuperação, contingência e regressão aprovados. Preflight de produção confirmou helpers/trigger e owners iguais ao baseline homologado, quatro relações legadas com RLS e novos objetos ausentes. Backup físico mais recente disponível foi confirmado. Nenhuma abertura, seed ou movimento financeiro real integra a migração. Aplicação e publicação só serão registradas após resultados verificáveis; autorização de abertura permanece separada.

### Stack local aplicada e limites

| Item | Evidência atual |
| --- | --- |
| CLI oficial | Supabase `2.119.0`; SHA-256 do ZIP `db4a6ec26d182408ca605efc0d0d938720bd2d8d39541e79c7d69043897affb9`. |
| Runtime | Docker Desktop `4.92`; engine `29.8`; GoTrue `2.197`; PostgREST `16.4`; PostgreSQL `17.11.0.002`. |
| Rede | Somente DB `55322` e API `55321` publicados em `127.0.0.1`, por rebind local dos containers, pois a CLI não suporta `HostIp`; sem alterações de daemon/firewall. Auth `9999` e REST `3000` não publicados diretamente. |
| Auth | Login email/senha local habilitado; sem SMTP, hooks ou OAuth externos. Segredos de teste ficam fora do repositório e dos relatórios públicos. |
| Banco QA | Bootstrap sintético e DRAFT de hash `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a` aplicados LOCALMENTE; sem vínculo `project-ref` remoto. |
| Compatibilidade | Helpers/policies/auditoria de metadados reais revisados; auxiliares mínimos de schema documentados. PG/GoTrue locais diferem das versões observadas na produção; log final deve delimitar essa diferença. |

Novos recursos remotos, opções pagas ou cópia de dados reais continuam fora do preparo autorizado. Não presumir preço, retenção contratada ou staging remoto por a stack local estar funcionando.

## Infraestrutura existente inspecionada

- `deploy.sh:9–18` exige branch `dev` e checkout limpo, incluindo índice e arquivos não rastreados. O pacote funcional deve estar commitado antes do script; ele não recolhe arquivos JS/SQL pendentes.
- `deploy.sh:27–44` faz fetch e exige referências `origin/dev`/`origin/main` e avanço compatível por fast-forward. Conflitos/divergências precisam ser resolvidos no checkout isolado, preservando trabalhos alheios.
- `deploy.sh:57–104` gera a versão, atualiza `?v=` nos HTMLs rastreados da raiz e `CACHE_NAME` do SW, e cria commit de cache. Não gerar versões manuais. O check pré-deploy existente roda quando seu arquivo está presente; não usar `SKIP_CHECK=1` para contornar reprovação.
- `deploy.sh:108–112` publica `dev`, sincroniza `main` e publica `main`. Não executar push manual para substituir esse processo.
- `rollback.sh:15–18` reverte somente `HEAD` e chama `deploy.sh`. Isso não identifica automaticamente o commit funcional: após publicar, `HEAD` pode ser apenas o commit de cache. Reverter cache e regenerá-lo não garante remoção da funcionalidade.
- Não existe `.github/workflows` nesta cópia. A leitura remota confirmou Pages legado, origem `main`/raiz e build servido na base `7ace6ac`; `https_enforced = false` é configuração existente e não foi alterada. Reconferir origem, job/log, SHA servido e propagação na publicação futura; não presumir êxito.
- Os scripts não criam backup nem restauram PostgreSQL, e não foi encontrada rotina versionada de backup na busca local. A CLI oficial confirmou oito backups físicos `COMPLETED`, `walg_enabled = true` e `pitr_enabled = false`; último backup ID `1884527306`, de `2026-10-06T07:44:51.78Z`, consulta em `09:28:40 UTC`. Veja os [metadados sanitizados](evidencias-caixa/2026-10-06-backups-producao-metadados.json). Isso prova disponibilidade, não restauração física ensaiada nem política contratada de retenção. Nenhum login novo, download, dump ou restore foi feito para essa consulta.

## Pré-requisitos e backup

Usar checkout de publicação isolado em `dev`, com apenas o pacote aprovado e as referências atualizadas na execução. Registrar o SHA funcional anterior conhecido e o novo SHA; conservar uma referência restaurável do aplicativo anterior e o diff/manifesto do pacote. Não tocar o checkout do usuário, trabalhos locais ou a tarefa de recebíveis.

O alvo identificado usa GoTrue e PostgREST reais, com login email/senha e identidades sintéticas. O ensaio API autenticado concluiu 15/15 PASS, conforme log versionável; os testes PGlite/nativos/UI anteriores não comprovavam sozinhos o login. Helpers, policies e auditoria foram preparados a partir de metadados reais revisados, com auxiliares mínimos documentados, sem copiar dados operacionais. As versões locais diferem da produção e o schema de apoio é reduzido: registrar esses limites no log final, sem declarar equivalência integral com staging/produção. Não experimentar pagamentos em dados operacionais para completar homologação.

Conferir os pré-requisitos: `public.auth_company_id()`, `public.auth_user_role()`, `auth.uid()`, `companies`, `company_users` com `user_id`/`company_id` UUID, `role` texto e `active` booleano, e as colunas `id`, `company_id`, `valor`, `status`, `data_pagamento`, `tipo`, `obra_id`, `nota_id`, `nota_ref` de `contas_pagar`. Conferir owners das duas funções `SECURITY DEFINER`, `search_path`, grants e RLS das quatro tabelas novas. Os dois RPCs/quatro policies do Caixa agora exigem vínculo `role = 'admin'` e `active IS TRUE` na empresa da sessão, conforme correção local especificamente autorizada. Não alterar helpers/policies/grants legados para fazer o ensaio passar.

Antes da DDL aditiva em produção, reconferir o backup físico `COMPLETED` do alvo, seu identificador/data e o procedimento existente de recuperação; registrar o risco e a janela escolhida. Conservar schema/auth/grants/owners e dados que as RPCs podem atualizar. A disponibilidade de backup já foi comprovada em metadados, e a recuperação deve ser ensaiada somente com dados sintéticos em QA, com evidência aprovada antes de avançar. Uma restauração gerenciada física real não foi executada, não é exigida para essa DDL aditiva vazia e não está autorizada por este roteiro; não sobrescrever produção, baixar/copiar dados reais ou apagar operações posteriores para completar a evidência. A política contratada de retenção não deve ser inferida do inventário observado.

A [recuperação sintética aprovada](recuperacao-caixa/backup-restore-local.md), 10/10 PASS, preservou dados/catálogo e o reenvio de todos os 12 UUIDs, com falhas de arquivo truncado/hash divergente/erro SQL revertidas sem substituir a fonte. Esse ensaio lógico no mesmo cluster usa GUC de teste, não Auth; não comprova recriação de roles em outro cluster, backup concorrente, PITR ou recuperabilidade física dos backups de produção.

Antes da ativação e durante operação, preservar também `caixa_contas`, `caixa_movimentos`, `caixa_obrigacoes`, `caixa_operacoes` e as obrigações legadas envolvidas. Os recibos por UUID e snapshots de status/data originais são necessários para recuperação/auditoria; um backup só do frontend não os contém. Não guardar dumps, credenciais, saldos privados ou comprovantes no repositório distribuído.

## Sequência condicionada

1. Registrar a autorização específica de 08:58:37 UTC e a correção já aplicada aos dois RPCs/quatro policies. Os 20 PGlite, 8 nativos e 38 UI aprovados, e a regressão integral 274 PASS/0 FAIL/1 SKIP, são evidência local; o [ensaio Auth real](evidencias-caixa/2026-10-06-auth-local.log) também concluiu 15/15 PASS. Congelar o pacote após revisão final, preencher SHA funcional e reconferir hash da migração. Preservar recebíveis e checkouts alheios.
2. Conferir a stack QA identificada, isolamento, bootstrap mínimo, versões, owners/grants/RLS/triggers e perfis sintéticos. A stack já existe; não repetir preparo ou instalar runtime por suposição. Conservar o [ensaio de recuperação aprovado](recuperacao-caixa/backup-restore-local.md), 10/10 PASS, com seus limites: PG17.11, banco novo no mesmo cluster, roles não recriadas em outro cluster e UID simulado por GUC, sem Auth real nesse ensaio nem restore físico gerenciado.
3. A migração de hash registrado já foi aplicada somente à QA local autorizada. Conservar a evidência dos objetos e do bootstrap sem abertura; não reaplicá-la cegamente nem inferir migração de produção. O SQL não contém seed de abertura ou valores privados.
4. Conservar o [reensaio Auth/PostgREST aprovado](evidencias-caixa/2026-10-06-auth-local.log), com login real e dados sintéticos: persistência, parciais, transferência, cancelamento, reenvio/HTTP simultâneo, erros, corte temporal e preservação de DRE/estoque/folha/saldo manual. O primeiro erro do harness foi superado pela execução final. Concluir separadamente o fluxo UI com RPC real e sua evidência, sem usar produção.
5. Registrar log final, conclusão efetiva, artefatos, limitações e revisão de recuperação. A disponibilidade dos backups físicos foi comprovada; conferir o backup final e plano de restauração aplicável, sem restore global nem perda de operações. Se faltar requisito material, manter produção/publicação/ativação pendentes; não substituir resultado por aprovação local nem contornar negativas.
6. Cumprida a condição e confirmado o alvo autorizado por Duam, obter/verificar o backup final e aplicar a mesma migração em produção antes do frontend. Registrar versão/hash, operador, data/hora e resultado. Conferir contrato das RPCs e grants em leitura; não declarar abertura nessa etapa.
7. Publicar pelo `deploy.sh` em `dev` limpa, usando Bash, Git, Node, sed e awk disponíveis no ambiente de publicação. Registrar SHA funcional, SHA de cache, versão emitida e resultado dos pushes. Conferir Pages/job remoto e propagação dos arquivos; o texto de sucesso do script não substitui a leitura do build servido.
8. Executar o smoke de leitura pós-publicação em sessão própria de validação, sem usar a sessão do usuário nem escrever dados financeiros. Até a ativação, a tela deve pedir abertura e não inventar saldo atual usando histórico ou localStorage.
9. Ativar somente após autorização específica da declaração privada de abertura e do tenant, além da revisão do marco/saldos por conta e do procedimento operacional descrito abaixo. A autorização de migração/publicação não aprova automaticamente gravação da abertura real. Após essa autorização, registrar abertura uma vez para a empresa expressamente identificada, conservando recibo e conferência. Não habilitar outro tenant por suposição.
10. Registrar evidências finais e o acompanhamento/rollback escolhido. Não marcar nenhuma etapa como executada sem resultado verificável.

## Smoke de leitura com autenticação real

| Verificação | Resultado esperado e evidência a registrar |
| --- | --- |
| Sessão administrativa da empresa autorizada | Login próprio válido; `caixa_estado` retorna `company_id` correspondente, contrato esperado e somente dados dessa empresa. Não salvar tokens/credenciais no relatório. |
| Perfil sem acesso administrativo e sessão sem empresa | Leitura financeira recusada/indisponível, sem cache administrativo reutilizado ou fallback legado. Verificar grants/metadados de escrita sem chamar `caixa_registrar` no smoke de leitura. |
| Admin com vínculo `active = false` ou `active IS NULL`, mantendo JWT válido | Com a correção autorizada aplicada, SELECT direto das quatro tabelas retorna vazio e `caixa_estado` recusa acesso. `caixa_registrar`, inclusive reenvio de UUID já confirmado, deve ser recusado no ensaio sintético isolado; não fazer chamadas de escrita desse teste em produção. |
| Outro tenant de homologação | Sua sessão não enxerga abertura/movimentos da empresa de ensaio. Não criar usuários/perfis reais nem alterar permissões para executar o smoke. |
| Sem abertura | Página solicita declaração; nenhuma foto privada é carregada automaticamente e custos/folha não fabricam disponível. |
| Com abertura de ensaio | Conta bancária, dinheiro e total correspondem à resposta persistida; obrigações/parciais aparecem separados, usando restante confirmado. |
| Persistência indisponível | Tela/alertas indicam indisponibilidade ou suprimem total; não apresentam saldo calculado do histórico como saldo atual. Simular falha somente no ambiente de homologação. |
| Build publicado | HTML e JS do commit esperado acessíveis; `?v=` e SW correspondem à versão emitida pelo script; páginas carregam sem erros de script/RPC. |
| Limites da integração | Avisos e fluxos manuais conferem com [Pagamentos e limites da integração](caixa-prospectivo-local.md#pagamentos-e-limites-da-integração). Nenhum movimento criado só por abrir páginas. |

Este smoke consulta dados e autenticação; não inclui declaração de abertura, entradas, saídas, transferências, pagamentos, cancelamentos, novas cobranças ou alterações de segurança. Os cenários de escrita pertencem à homologação sintética isolada ou à ativação autorizada, com evidências próprias.

## Ativação e rotina manual

Antes de qualquer abertura real, obter autorização específica de Duam para a declaração e o tenant; registrar essa confirmação na evidência privada da ativação. Revisar explicitamente empresa, conta C6 PJ, dinheiro no escritório, data/hora do corte em `America/Sao_Paulo` e os saldos demonstrados naquele marco. A foto privada de 05/10/2026 pertence ao exemplo/ensaio anterior: **não inferir que representa o saldo atual, não reutilizá-la silenciosamente e não avançar sua data mantendo os números**. Um marco histórico só pode ser escolhido expressamente com revisão do que ocorreu desde ele; isso não autoriza conciliação histórica nem ajuste compensatório.

Conferir movimentos no dia do corte sem horário e decidir caso a caso entre **Já incluído no saldo de abertura** e **Ocorreu após o marco de abertura**. A abertura é saldo informado, não receita. Preservar `companies.saldo_manual`. Não ativar se a classificação temporal ou os saldos de cada conta estiverem indefinidos.

Seguir a matriz operacional do [documento local](caixa-prospectivo-local.md#pagamentos-e-limites-da-integração): repasse CEF, adicional, entrada do cliente e reembolso realmente recebido exigem Entrada explícita por conta; NF já marcada paga fora do Caixa exige Saída simples ainda ausente, respeitando o corte. **Pago** de obrigação pendente já grava o pagamento vinculado: não criar outra Saída/Entrada. Folha, custo e consumo não são desembolso por si só. Transferência é uma operação vinculada de efeito total zero; tarifa é Saída separada.

Conferir movimentos e identificador do comprovante antes de registrar. Reenvio do mesmo UUID/payload é idempotente; duas digitações novas do mesmo comprovante não são deduplicadas automaticamente. Em resposta incerta, usar o pedido/journal existente para conferir o recibo antes de nova operação. A sessão de recuperação não é fonte operacional de saldo.

## Rollback que preserva dados

**Aplicativo:** registrar o commit funcional que precisa ser revertido e preparar o diff de rollback em checkout limpo. Não executar `rollback.sh` às cegas: ele reverte apenas `HEAD`, possivelmente cache. Publicar o rollback revisado pelo mesmo processo de cache/deploy. Reverter frontend não desfaz status/data alterados em `contas_pagar`, saldos, movimentos ou recibos.

Após ativação/uso, não tratar o Caixa legado de uma versão antiga como saldo operacional correto. Também não reativar **Pago**, edição ou exclusão legados de obrigações já vinculadas ao ledger: uma versão base ignora parciais/auditoria e pode repetir o pagamento ou remover a obrigação. Se for preciso suspender a funcionalidade, coordenar pausa de novos registros e usar versão de correção/rollback compatível que preserve leitura/auditoria e indisponibilize novas mutações problemáticas. Não há feature flag de suspensão documentada neste pacote; não inventar parâmetro ou alteração de grants/policies como atalho. Preparar/validar essa correção antes de executá-la.

Na base `7ace6ac`, `marcarComoPago` altera diretamente a obrigação e pode criar custo; o Caixa calcula entradas históricas menos custos/contas pagas e apresenta "SALDO DISPONÍVEL HOJE". A contingência após uso deve conservar leitura do RPC ou indisponibilidade explícita, alertas baseados no ledger, restante confirmado e guards de pagamento/edição/exclusão. O retorno integral à base não cumpre esse contrato. A contingência compatível foi preparada como [patch/manifesto separado](recuperacao-caixa/contingencia-frontend-local.md) e validada em [5/5 testes Chromium](evidencias-caixa/2026-10-06-contingencia-testes.md), preservando leitura/auditoria/guards e suspendendo novas mutações da interface. O patch não foi aplicado no frontend normal nem publicado; não é bloqueio de backend, abas/builds antigos ou clientes externos. Sua aplicação futura exige revisar hashes/versão, checkout limpo e coordenação dos operadores.

O SW atual usa rede primeiro e cache como fallback. Deploy/cache busting não comprova que todas as abas antigas/offline foram atualizadas. Na publicação ou contingência, conferir build/versão/SW numa sessão própria de validação e orientar atualização coordenada dos operadores antes de retomarem pagamentos. Não interferir na sessão do usuário nem presumir bloqueio de escritas por clientes antigos só porque o novo HTML foi publicado; qualquer bloqueio adicional de grants/policies legados exige plano e autorização específicos.

**Banco antes de qualquer uso:** o rollback DRAFT contém `DROP` e exige as quatro tabelas totalmente vazias. Na mesma transação, adquire `ACCESS EXCLUSIVE` em operações, contas, obrigações e movimentos antes de verificar qualquer linha; a ordem começa em operações, como os RPCs. Qualquer abertura, recibo, snapshot ou movimento aborta a remoção, inclusive movimento cancelado. O ensaio local concorrente observou espera real entre PIDs independentes e, após commit de abertura concorrente, preservou duas contas e um recibo; a suíte atual registra oito PostgreSQL nativo e vinte PGlite aprovados após a correção autorizada. O checkpoint inicial com dezoito PGlite permanece somente como histórico. Isso não equivale a executar rollback em produção. Após qualquer dado, preservar os objetos e usar o procedimento após uso. Não executar o DRAFT em produção apenas por existir no repositório.

**Banco após abertura ou qualquer movimento/pagamento:** não executar `DROP`, `TRUNCATE`, exclusão de auditoria nem restauração global que apague operações posteriores. Manter as quatro tabelas, RPCs, recibos e snapshots; obter backup consistente do estado atual e diagnosticar em cópia isolada. Correção de um movimento comprovadamente incorreto usa cancelamento auditado pela RPC, quando aplicável, com efeito e obrigação revisados. Não editar saldos diretamente nem fabricar entrada/saída compensatória para ocultar divergência.

Se restauração de obrigações legadas for necessária, preparar plano específico confrontando snapshots, recibos, movimentos ativos/cancelados e alterações posteriores de outras versões. Uma restauração do backup anterior pode apagar pagamentos válidos posteriores e não é um rollback automático permitido. Documentar alvo, linhas, efeitos esperados e evidências antes de executar a recuperação autorizada.

## Registro de execução

| Etapa | Status | Alvo/versão | Evidência/data/operador |
| --- | --- | --- | --- |
| Negativa inicial de segurança | HISTÓRICO - preservada | Edição local do DRAFT antes do consentimento | [Bloqueios](evidencias-caixa/2026-10-06-bloqueios.md) |
| Consentimento específico | CONCLUÍDO | Docker/CLI e vínculo admin ativo no Caixa | Duam, 06/10/2026 08:58:37 UTC |
| Correção e testes locais | APROVADOS | 20 PGlite, 8 nativos, 38 UI; regressão final 279 PASS/0 FAIL/2 SKIP | Dois opcionais Auth/UI real aprovados separadamente |
| Stack/bootstrap/migração QA | CONCLUÍDO LOCALMENTE | `edr-caixa-qa-20261006`, CLI `2.119.0`, hash registrado | Tarefa principal, 06/10/2026; [stack](evidencias-caixa/2026-10-06-stack-local.md) |
| Homologação Auth/PostgREST local real | APROVADA: 15/15 PASS | Stack local, GoTrue/PostgREST reais, oito identidades sintéticas | [Log sanitizado](evidencias-caixa/2026-10-06-auth-local.log), 4281,1055 ms; zero falhas/skips |
| Recuperação sintética | APROVADA LOCALMENTE: 10/10 PASS | PG17.11, dump/restore lógico em banco novo; 12 UUIDs preservados | [Evidência e limites](recuperacao-caixa/backup-restore-local.md), 5765,4716 ms; cluster encerrado |
| Contingência compatível | APROVADA LOCALMENTE: 5/5 Chromium | Patch/manifesto separado, sem aplicação no frontend normal | [Evidência sanitizada](evidencias-caixa/2026-10-06-contingencia-testes.md) |
| Fluxo UI com RPC real | APROVADO: 1/1 E2E | Chromium, GoTrue/PostgREST reais e módulo Caixa original | [Evidência e limites](evidencias-caixa/2026-10-06-ui-auth-real-resultado.md): zero falhas/skips |
| Revisão final/congelamento/commit funcional | CONCLUÍDOS LOCALMENTE | `b70919c809e7bd4480d8be5888cd0d288e7ef368`, SQL hash registrado | Apenas Caixa; pre-deploy check sem BLOCK |
| Disponibilidade de backups de produção | COMPROVADA EM LEITURA | 8 físicos COMPLETED; último ID `1884527306` | [Metadados](evidencias-caixa/2026-10-06-backups-producao-metadados.json), 09:28:40 UTC |
| Restauração física real de produção | NÃO EXECUTADA / NÃO PROVADA | Plano aplicável a revisar | Nenhum download ou restore; preservar operações posteriores |
| Migração de produção | BLOQUEADA / NÃO EXECUTADA | EDR SYSTEM `mepzoxoahpwcvvlymlfh` | [Rejeição automática e liberação](evidencias-caixa/2026-10-06-migracao-producao-bloqueada.md), 09:52:50 UTC |
| Deploy/Pages/propagação | PENDENTE / NÃO EXECUTADO | Pages atual legado `main`/raiz, build `7ace6ac` | A preencher para o novo pacote |
| Corte/saldos e abertura real | PENDENTE / NÃO EXECUTADA | Declaração privada e tenant autorizados | Não inferir foto de 05/10 como saldo atual |
| Smoke pós-publicação/ativação | PENDENTE | A preencher | A preencher |
| Plano de rollback aplicável | PREPARADO/TESTADO LOCALMENTE | DDL vazio com lock/guard; após uso, contingência compatível e preservação do ledger | Recuperação 10/10 e contingência 5/5; nenhum rollback real executado |

Arquivos de apoio: [migração](../sql/caixa-prospectivo-DRAFT.sql), [rollback DRAFT](../sql/caixa-prospectivo-rollback-DRAFT.sql), [deploy](../deploy.sh), [rollback do aplicativo](../rollback.sh), [regras/testes locais](caixa-prospectivo-local.md). Consulte os registros datados de execução; o roteiro por si só não executa operações. Memórias locais e trabalhos alheios foram preservados.
