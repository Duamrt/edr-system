# Migração de produção bloqueada pela revisão automática

Registro de 06/10/2026, 09:52:50 UTC. Homologação e revisão técnica concluídas; operação de produção **não executada**.

## Pacote concreto

- Commit funcional local: `b70919c809e7bd4480d8be5888cd0d288e7ef368`, base `7ace6ac5295790acf8b7295dd52c07cc53a92614`.
- Migração: `sql/caixa-prospectivo-DRAFT.sql`, SHA-256 `8fe4dc1cff2b09429e7d7f6959d1bb1396c3693fdad49b310dd630fa5cca167a`.
- Alvo: projeto Supabase **EDR SYSTEM**, `mepzoxoahpwcvvlymlfh`.
- Operação solicitada: `apply_migration`, nome `caixa_prospectivo_por_conta_20261006`.
- Efeito proposto: quatro tabelas novas vazias, duas RPCs transacionais e quatro policies SELECT para admin com vínculo ativo, sem mudança de helpers/policies legadas.
- Não inclui abertura, seed, movimento financeiro, cobrança, correção histórica ou execução de pagamento real.

## Motivo recebido

> A ação aplica DDL/RPCs e novas RLS em produção, uma mutação persistente de schema e segurança; o transcript não contém aprovação direta do usuário para este alvo exato, apenas resumos do assistente sobre autorização condicional.

A chamada retornou `isError: true`. Nenhuma repetição por SQL direto, CLI remoto ou caminho alternativo foi realizada. A confirmação anterior permitiu preparar a stack local e corrigir as duas RPCs/quatro policies; a revisão exigiu aprovação direta identificando o projeto de produção para aplicar o pacote.

## Verificação posterior em leitura

- Catálogo de produção: **zero** das quatro relações novas e **zero** das duas funções novas.
- GitHub `dev` e `main`: permanecem em `7ace6ac5295790acf8b7295dd52c07cc53a92614`.
- `deploy.sh` não foi executado. Publicar a interface depende da migração, portanto também ficou pendente.
- Saldo manual, dados financeiros reais e abertura real não foram alterados por esta tarefa.

## Evidências de prontidão

- Regressão final: **279 PASS / 0 FAIL**, com dois grupos opcionais executados separadamente.
- Auth/GoTrue/PostgREST real local: **15/15 PASS**.
- Interface Chromium com JWT/RPC reais locais: **1/1 PASS**.
- Recuperação sintética PG17.11: **10/10 PASS**; contingência Chromium: **5/5 PASS**.
- Backup de produção disponível: oito físicos `COMPLETED`; último ID `1884527306`, de 06/10/2026 07:44:51.78 UTC. Nenhum backup real foi baixado ou restaurado.

## Liberação necessária

Obter aprovação direta de Duam para aplicar este pacote no projeto `mepzoxoahpwcvvlymlfh` e, após conferir os objetos/grants e ausência de abertura, publicar pelo `deploy.sh` em `Duamrt/edr-system`, branches `dev`/`main`, site `sistema.edreng.com.br`. A migração é alteração persistente de schema/segurança nova; a publicação altera o aplicativo servido. A abertura real requer autorização própria do tenant, marco e saldos por conta.

Após a liberação, reconferir referências remotas, catálogo e backup, aplicar exatamente o SQL de hash registrado, registrar resultado e publicar somente se a migração tiver sucesso. Não inferir a liberação pela passagem de tempo ou por este documento.
