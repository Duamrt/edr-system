# Pré-requisitos da stack local — somente leitura

## Estado após autorização — 06/10/2026

Duam autorizou especificamente o preparo da stack e a correção de admin ativo com **“SIM.EU AUTORIZO”**, às **08:58:37 UTC**. O Docker foi iniciado e a CLI oficial preparada, após esse consentimento. A pausa descrita no diagnóstico inicial abaixo é histórica e foi superada dentro do escopo autorizado.

| Item | Estado local comprovado pela tarefa principal |
| --- | --- |
| Projeto/pasta | `edr-caixa-qa-20261006`, pasta irmã `caixa-auth-local`; sem `project-ref`, `supabase link` ou vínculo de deploy remoto. |
| CLI oficial | `2.119.0`; SHA-256 do ZIP `db4a6ec26d182408ca605efc0d0d938720bd2d8d39541e79c7d69043897affb9`. |
| Runtime | Docker Desktop `4.92`, engine `29.8`; GoTrue `2.197`, PostgREST `16.4`, PostgreSQL `17.11.0.002`. |
| Rede | DB `55322` e API `55321` publicados somente em `127.0.0.1` por rebind local dos containers, pois CLI não oferece `HostIp`; sem alterações do daemon/firewall. Auth `9999` e REST `3000` não publicados diretamente. |
| Auth | Login local email/senha habilitado, identidades sintéticas; sem SMTP, hooks ou OAuth externos. Segredos/logs privados ficam fora do pacote versionado. |
| Bootstrap | Helpers, policies e auditoria preparados a partir de metadados reais revisados; dependências auxiliares mínimas documentadas, sem copiar dados reais. |
| Migração LOCAL | SHA-256 `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a`; quatro tabelas com RLS e duas funções `SECURITY DEFINER`. Zero aberturas após bootstrap e antes dos ensaios sintéticos. |
| Autorização do Caixa | Guard de admin ativo nos dois RPCs/quatro policies aplicado localmente após consentimento; sem mudança de helpers/policies/grants legados. |
| Validação local | 20 PGlite, 8 nativos e 38 UI PASS; regressão integral final 279 PASS/0 FAIL/2 SKIP; os grupos opcionais Auth e UI real passaram separadamente. |
| Ensaio API real | **15/15 PASS**, zero falhas/skips, 4281,1055 ms; oito logins/JWTs GoTrue reais. [Log](2026-10-06-auth-local.log). Primeiro erro do harness superado no reensaio limpo; produção não ensaiada. |
| Contingência compatível | **5/5 Chromium PASS**, [evidência](2026-10-06-contingencia-testes.md); patch separado, não aplicado no frontend normal/publicado e sem bloqueio de backend/clientes antigos. |

A stack usa Auth/PostgREST reais, mas versões e dependências auxiliares mínimas diferem da produção. Ela não equivale a clone completo de staging. Os backups físicos de produção foram comprovados por metadados oficiais read-only; restauração física não foi executada/provada. Recuperação sintética 10/10 PASS: [evidência e limites](../recuperacao-caixa/backup-restore-local.md), banco novo no mesmo cluster PG17.11, UID por GUC e roles não recriadas em outro cluster; não é restauração física gerenciada nem ensaio Auth. Migração aditiva de produção `20261006104227` concluída às 10:42:27 UTC, com quatro tabelas vazias verificadas. Publicação foi bloqueada antes da execução do script; abertura real e ensaios financeiros de produção permanecem não executados. Consulte o [registro efetivo](2026-10-06-implantacao-execucao.md).

## Registro inicial histórico — somente leitura, antes de 08:58:37 UTC

Os valores e propostas seguintes preservam o diagnóstico anterior ao consentimento; não representam o runtime atual. Os limites de isolamento, proteção de segredos, licença/custos e preservação de workloads preexistentes continuam aplicáveis.

Consulta em 06/10/2026 no computador DuamRT. **Stack ainda não iniciada e viabilidade operacional não comprovada.** Nenhum serviço, recurso Windows/BIOS, software, imagem, credencial, OAuth, token ou conta de teste foi criado/alterado. A autorização específica está sendo solicitada pelo pai; não executar os passos de preparação até recebê-la.

## Observado

| Item | Evidência local |
| --- | --- |
| Sistema | Windows 11 Pro, 64 bits, build 26200; versão WSL reportou `10.0.26200.9457`. |
| WSL | `2.6.3.0`, kernel `6.6.87.2-1`; distribuição padrão `docker-desktop`, modo padrão 2. Apenas comandos `--status`/`--version`, sem iniciar distribuição. |
| CPU/virtualização | AMD Ryzen 7 5800X3D, 8 núcleos/16 threads; WMI `VirtualizationFirmwareEnabled = true`, `HypervisorPresent = true`. WMI SLAT e VM monitor retornaram false; isso não comprova compatibilidade ou incompatibilidade operacional sob o hipervisor já presente. Conferir o backend após liberação, sem alterar BIOS/recursos Windows nesta fase. |
| Memória | 47,91 GiB totais e 26,29 GiB livres no momento da consulta. |
| Disco C | 135,14 GiB livres de 930,46 GiB. É uma foto de espaço, não uma reserva para imagens/volumes. |
| Docker | Desktop `4.92.0.240144`; cliente `29.8.0`. Serviço `com.docker.service` parado/manual; API `DockerDesktopLinuxEngine` indisponível. Não foi possível inventariar imagens/containers sem iniciar o engine. |
| Node | `v24.14.0`. |
| CLI Supabase | Não localizada em PATH nem no local padrão do pacote no cache npm consultado. Isso não é inventário exaustivo de todos os discos. A pasta `.temp` do clone está vinculada à produção, não a uma stack local. |
| Portas usuais de teste | Consulta de listeners não encontrou `54321/54322/54323/54324/54327/54328` em uso naquele momento. Revalidar na execução; isso não reserva portas. |

## Requisitos e limites consultados em documentação oficial

O Docker documenta Windows suportado, WSL 2.1.5 ou superior, processador 64 bits/SLAT, virtualização e 8 GB de RAM para o backend WSL. Os valores de OS/WSL/RAM observados atendem essas faixas; o engine/backend ainda precisa ser validado. Não atualizar recursos Windows, BIOS, grupos de acesso ou configuração permanente para fazê-lo iniciar sem nova autorização. Fonte: [Docker Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

A stack Supabase usa CLI e runtime compatível com Docker e disponibiliza serviços locais como banco, Auth e Data API. O runtime nativo experimental não é alternativa Windows documentada nessa página. Não substituir Auth real por `set_config`/JWT fabricado nem declarar os ensaios PGlite como teste do mecanismo de login. Fonte: [Supabase local](https://supabase.com/docs/guides/local-development).

Elegibilidade e aceitação dos termos Docker Desktop não foram comprovadas. A documentação prevê uso gratuito em certos contextos e assinatura para organizações acima dos limites comerciais. Não presumir que instalação existente garante licença adequada, não aceitar termos novos automaticamente, não fazer login/criar conta Docker Hub e não contratar serviço. Se aparecer requisito pago ou aceite pendente, parar e pedir orientação ao pai. Fonte: [licença Docker Desktop](https://docs.docker.com/subscription-billing/desktop-license/).

## Menor preparação proposta, ainda não executada

Após autorização específica, usar uma pasta descartável separada dentro do workspace, com projeto/configuração local própria e portas loopback. Não iniciar a stack dentro do clone vinculado à produção; não copiar `.temp`, pooler URL, `.env`, secrets, arquivos de sessão, usuários reais, senhas, chaves ou dados financeiros para ela. Não executar `supabase link`, `db push` ou qualquer comando cujo alvo seja inferido de produção.

Usar CLI oficial com versão/origem/checksum registrados; instalação apenas no workspace/temporário, sem alterar PATH global ou criar novos acessos permanentes. Baixar imagens somente após autorização e validar espaço/memória antes/depois. A compatibilidade entre versões de CLI, PostgreSQL, Auth e PostgREST deve ser registrada; os metadados da produção indicam PostgreSQL `17.6.1.063` e arquivo local vinculado reporta GoTrue `v2.188.1`, sem demonstrar versão operacional de uma stack futura.

Preparar schema/dependências e helpers/triggers conferidos a partir de metadados revisados, com dados totalmente sintéticos. Nunca copiar contas/pagamentos/estoque/folha ou usuários de produção. Identidades de teste descartáveis precisam de autorização própria e devem usar login real da stack, contemplando dois tenants, admin ativo, papel insuficiente e admin inativo/nulo. Nenhum OAuth/credencial remota novo é necessário à proposta. Guardar segredos de teste fora do pacote versionado e não transmiti-los em logs/chat.

A correção ficou inicialmente rejeitada e pausada. Após autorização específica às 08:58:37 UTC, os dois RPCs/quatro policies do Caixa passaram a exigir admin ativo e o DRAFT corrigido foi aplicado apenas à QA local. O ensaio Auth real concluiu 15/15 PASS e a recuperação sintética também concluiu 10/10 PASS; ownership/grants e limites das dependências devem constar da evidência final.

Encerrar apenas containers/volumes do projeto de teste identificado, preservando evidências sanitizadas e qualquer serviço/imagem/volume preexistente. O impacto de iniciar Docker Desktop sobre workloads existentes ainda não foi verificado. Não prometer custo zero ou viabilidade concluída; esta alternativa evita criar serviço Supabase pago, mas ainda depende de licença/termos, recursos, downloads e permissões locais.
