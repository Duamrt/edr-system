# Checkpoint de homologação — 06/10/2026

## Atualização após autorização — 06/10/2026

**Candidato a GO técnico condicionado ao fluxo UI com RPC real e revisão final; produção/publicação/abertura não executadas.** O bloqueio inicial de runtime e da correção do Caixa foi superado pela autorização específica de Duam, **“SIM.EU AUTORIZO”**, às **08:58:37 UTC**. A negativa inicial abaixo permanece como histórico; não houve contorno.

- Docker foi iniciado e CLI oficial Supabase `2.119.0` preparada no workspace. Stack QA `edr-caixa-qa-20261006`, pasta irmã `caixa-auth-local`, sem `project-ref`; somente dados/identidades sintéticos.
- Os dois RPCs e as quatro policies SELECT novos do Caixa agora exigem admin ativo na empresa da sessão. Helpers/policies/grants legados não foram alterados. Migração LOCAL de SHA-256 `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a` aplicada, após consentimento.
- Fixes aprovados em 20 PGlite, 8 PostgreSQL nativo e 38 UI. Regressão integral mais recente: **274 PASS / 0 FAIL / 1 SKIP**, de 275; o skip é Auth real, executado separadamente. Log `regressoes-caixa-final.log` fora do repositório.
- Auth/PostgREST real: **15/15 PASS**, zero falhas/skips, 4281,1055 ms; oito logins GoTrue/JWTs reais na QA sintética. [Log sanitizado](2026-10-06-auth-local.log). Primeiro ensaio 10 PASS/5 FAIL foi superado após correção do harness e reensaio limpo. Configuração gerenciada e usuários de produção não foram ensaiados.
- Contingência compatível: **5/5 Chromium PASS**, [evidência](2026-10-06-contingencia-testes.md); patch separado sem aplicação no frontend normal ou publicação, preserva leitura/auditoria e suspende mutações da interface. Não bloqueia backend/abas antigas.
- Backup: a limitação do MCP foi superada por consulta oficial CLI somente leitura às `09:28:40 UTC`, sem login novo, download ou restore. Oito backups físicos `COMPLETED`; último ID `1884527306` de `2026-10-06T07:44:51.78Z`; `walg_enabled = true`, `pitr_enabled = false`. [Metadados sanitizados](2026-10-06-backups-producao-metadados.json). Disponibilidade provada, restauração física real **não executada/provada** e retenção contratada não inferida.
- Pages existente: legado `main`/raiz, build `7ace6ac`, `https_enforced = false`; nenhuma alteração dessa configuração. Não houve migração de produção, abertura real, push ou deploy.

- Recuperação sintética: **10/10 PASS**, zero falhas/skips, 5765,4716 ms, [procedimento/evidências](../recuperacao-caixa/backup-restore-local.md). Dados/catálogo e todos os 12 recibos preservados; erros de restore revertidos sem substituir fonte e cluster encerrado. Limites: banco novo no mesmo cluster PG17.11, UID por GUC e roles não recriadas em outro cluster; não é restore físico gerenciado nem ensaio Auth.

As versões, rede loopback, auxiliares mínimos do bootstrap e limites frente à produção estão em [stack local](2026-10-06-stack-local.md). O [runbook](../caixa-prospectivo-implantacao.md) contém sequência condicionada, ativação privada e rollback sem perda de movimentos.

## Registro inicial histórico — anterior a 08:58:37 UTC

Os diagnósticos e pausas abaixo descrevem o primeiro checkpoint, antes do consentimento específico. A atualização acima registra o estado atual e não apaga a negativa.

**NO-GO para migração/publicação.** A autorização de implantação foi recebida, condicionada à homologação real isolada. O código existente não foi reimplementado.

## Alvos conferidos

- Repositório: `https://github.com/Duamrt/edr-system`; `dev` e `main` em `7ace6ac5295790acf8b7295dd52c07cc53a92614`, conferidos por `git ls-remote`.
- Infra da cópia: `https://mepzoxoahpwcvvlymlfh.supabase.co`; `CNAME`: `sistema.edreng.com.br`.
- A origem da cópia isolada ainda aponta para o clone local preservado. Antes de futura publicação, configurar e reconferir o remoto GitHub na cópia, sem tocar os checkouts do usuário.
- Projeto real EDR: PostgreSQL 17.6. Organização `iydbbmkyiffvmaftzptm`, plano `pro`, confirmado por ferramenta de leitura. O plano não confirma disponibilidade/data de backup/PITR deste projeto.

## Autenticação real bloqueada

O conector SQL executa como `postgres`, com `auth.uid()` nulo e sem `request.jwt.claims`. Consultas de catálogo comprovam estrutura e grants, mas não sessão JWT, PostgREST nem isolamento ponta a ponta. Nenhuma sessão/credencial de usuário foi fabricada ou extraída.

O pai confirmou que o único branch EDR é `main`, com o mesmo `project_ref` de produção. Outros projetos da organização pertencem a sistemas distintos e não foram tratados como staging.

No computador há cliente Docker, mas `com.docker.service` está `Stopped / Manual`; o endpoint `npipe:////./pipe/dockerDesktopLinuxEngine` está ausente. `docker ps` e `docker images` não conseguiram consultar o engine. Não foi localizada CLI Supabase utilizável em PATH/cache npm consultado. Não existe stack Auth local utilizável comprovada. Não iniciei serviço, instalei software, baixei imagens ou criei contas/tokens.

Menor opção se já existir: fornecer um staging EDR autorizado e contas/sessões de teste existentes para admin de empresa A, admin de empresa B, papel insuficiente e vínculo inativo, com login por handoff e somente dados sintéticos. Sem staging existente, alinhar autorização específica para uma branch Supabase (schema/migrations, sem copiar dados reais), ou stack local Docker/Supabase; confirmar custo antes de criar branch e autorizar explicitamente identidades/sessões sintéticas descartáveis necessárias. Custo de branch ainda não consultado/confirmado. Não usar produção como ensaio mutante nem outro sistema como staging.

## Correção de segurança local rejeitada

Metadados reais mostraram que `auth_company_id()` e `auth_user_role()` consultam `company_users` sem filtrar `active`. A proposta local é exigir membership atual `user_id = auth.uid()`, `company_id` da sessão, `role = 'admin'` e `active IS TRUE` nos dois RPCs `caixa_estado`/`caixa_registrar` e nas quatro policies SELECT novas. Não altera helpers/policies legados, roles, credenciais ou grants existentes.

A tentativa de editar o DRAFT local foi rejeitada pelo revisor automático: **“patch altera RPCs e policies autorização (mudança segurança), contrariando autorização explícita não mudanças segurança; embora local/reversível não autorizado”**. Nenhuma parte desse patch foi aplicada. Não houve repetição ou contorno. Naquele momento faltava autorização humana específica. Ela foi concedida às 08:58:37 UTC; a correção local do Caixa foi então aplicada e validada pelos testes acima. Auth real passou no reensaio local; a recuperação sintética também passou, e a implantação continua condicionada ao fluxo UI real/revisão final e às evidências finais.

## Achado anterior fora do escopo

Foi identificado um achado de segurança anterior ao Caixa e fora deste pacote. Os detalhes e o checkpoint integral foram preservados em artefato privado da tarefa e comunicados à tarefa principal, para avaliação/autorização separadas. Nenhum dado da tabela envolvida foi lido, nenhum ensaio mutante foi feito e nenhuma correção legada foi aplicada. Este documento público omite identificadores e caminhos específicos.

## Trabalho independente

O rollback DRAFT local foi corrigido antes da pausa atual: locks exclusivos nas quatro tabelas antes de conferir qualquer linha; remove somente schema totalmente vazio, sem apagar abertura/recibo/snapshot/movimento. Dezoito testes PGlite e oito PostgreSQL nativo passaram antes da pausa; o caso novo mostrou espera real pela abertura concorrente e, depois de commit, recusou remoção e preservou os dados. Nenhum rollback/migração foi executado em banco real. Naquele checkpoint, novas execuções e preparo de stack ficaram pausados. Após a autorização específica, a migração e os ensaios foram executados somente na QA local sintética; produção permaneceu intocada.

Runbook: `../caixa-prospectivo-implantacao.md`. Metadados e baseline de RLS/grants: `2026-10-06-preflight-metadados.json`. Pré-requisitos de runtime/virtualização/espaço/termos: `2026-10-06-stack-local.md`. Registrar versões/commits/cache novos e evidência de backup/restauração somente quando existirem; não declarar essas etapas concluídas. Migração remota, push/deploy e ativação real não executados; o ensaio autenticado da QA local concluiu 15/15 PASS, conforme atualização acima. A foto de 05/10 não será gravada automaticamente nem inferida como saldo atual; abertura exige autorização específica da declaração e tenant.

## Checkpoint posterior: produção bloqueada

Em 06/10/2026, 09:52:50 UTC, após homologação real/UI/recuperação aprovadas e congelamento do commit local `b70919c809e7bd4480d8be5888cd0d288e7ef368`, a revisão automática rejeitou a aplicação no projeto exato `mepzoxoahpwcvvlymlfh` por falta de aprovação direta para esse alvo. Nenhuma migração ou publicação aconteceu; catálogo remoto e refs GitHub foram reconferidos. Consulte [ação, motivo e liberação necessária](2026-10-06-migracao-producao-bloqueada.md). A negativa não foi contornada.
