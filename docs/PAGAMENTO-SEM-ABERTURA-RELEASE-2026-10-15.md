# Release isolado de pagamentos — 15/10/2026

## Base publicada e preservação

Base: `d38f3008870592fbe8cbad54099a60a86410c8b1` (main). GitHub Pages informa esse commit como `built`, em 13/10/2026; versão pública `edr-system-v20261013171204`. Os 11 arquivos conferidos no domínio coincidem com a base: index, service worker, Auth, utilitários, transferência de relatório e os seis JS envolvidos na correção.

Worktree criado a partir dessa base, no branch novo `release/pagamento-sem-abertura-20261015`. Não houve reset, troca ou alteração das branches existentes. O checkout original com trabalhos locais permanece intacto. As correções de segurança já publicadas estão preservadas; o diff funcional contém exclusivamente os seis JS aprovados, a migração, testes e documentação de pagamentos.

O commit `7c928390050db83c45616a15afa08f98bbafacd8` de origin/dev não integra este release. Nenhuma alteração foi feita em `docs/SEGURANCA-BANCO-AUDIT-PCI-2026-10-13.md` ou `docs/SEGURANCA-FRONTEND-2026-10-13.md`.

## Revalidação na base atual

- Sintaxe: seis JS aprovados.
- Visão Financeira (modelo, dados e contexto): **110/110 testes**, sem falhas ou ignorados.
- GoTrue/PostgREST/PostgreSQL/Chromium reais no QA local: **9/9 etapas**, execução `299f4db74e`, encerrada em `2026-10-15T08:27:56.972Z`.
- Fluxos: login original, pagamento sem abertura, parcial, desconto/juros, perda da resposta após commit, recarga/reenvio, quitação, cancelamento, abertura posterior, conciliação incluída/posterior/pendente, concorrência, autorização e isolamento por empresa.
- Impressões digitais comprovaram preservação dos dados preexistentes. Contas e sessões sintéticas descartadas/bloqueadas; nenhum dado real foi usado.
- O servidor QA confirmou que serve este mesmo worktree. O roteiro passou a verificar essa identidade e aceita diretório separado de evidências; os ajustes são exclusivos do teste.
- Pre-deploy check oficial: exit 0, sem BLOCK. Seu aviso genérico de `FOR UPDATE` decorre de locks de linha nas funções SQL, não de criação/alteração de policy; esta migração não adiciona policies ou grants. O aviso foi revisado, sem pular o check.

Evidências da tarefa: `published-base-verified.json`, `release-visao-financeira-tests.log`, `qa-auth-release-base-atual.log` e `output/release-base-atual/playwright/pagamento-auth-result.json`. O relatório principal descreve a migração, os seis JS e as limitações do produto.

## Limite comprovado do deploy oficial

O `deploy.sh` foi preservado integralmente. Executá-lo neste branch isolado retorna exit 1 com a mensagem: `Execute o deploy a partir da branch dev`.

Além do nome da branch, o script exige que origin/dev seja ancestral de dev e depois faz merge fast-forward de dev em main. Origin/dev não é ancestral deste release; inclui os dois documentos alheios. Renomear a branch para dev não resolveria o segundo gate. Não se deve substituir refs, usar remote intermediário, retirar gates ou reiniciar branches para enganar essas verificações.

## Exceção de publicação aprovada

Duam autorizou expressamente ("Autorizo sim") a publicação isolada diretamente em main por fast-forward, com verificações equivalentes e preservação de dev. O release funcional aprovado é `88dec2cc706ad3a83e92fbc4190c5cb708ac3ca8`; a publicação acrescenta somente cache e esta documentação. O deploy.sh continua intacto. Etapas autorizadas:

1. Usar somente este branch isolado, confirmar que main continua na base validada e que o diff contém apenas os arquivos aprovados.
2. Gerar e conferir a atualização de cache equivalente à oficial nos HTMLs rastreados e no service worker; executar o mesmo pre-deploy check, sem ignorar achados bloqueadores.
3. Repetir o preflight/backup do banco e aplicar somente a migração de Caixa aprovada.
4. Publicar somente o release em main por fast-forward, sem force push e sem alterar dev; conferir o build Pages, artefatos e contratos em leitura.

Esta autorização cobre somente esta publicação; não altera o fluxo padrão de futuros releases. Cache preparado com as mesmas substituições do script oficial: `edr-system-v20261015054646` e recursos `?v=10150546`. A evidência final externa à árvore publicada registrará o commit efetivamente enviado, a migração e as verificações de produção.

## Recuperação e limites

O `rollback.sh` atual reverte somente o último commit e não desfaz banco; após o cache, pode reverter apenas a versão de recursos. Não é uma reversão integral do pagamento. A migração é transacional e tem trava de versão. Antes da aplicação, preservar a definição atual e confirmar backup. Depois de registros no formato novo, preservar movimentos/recibos e corrigir de forma compatível; não apagar colunas/dados nem restaurar cegamente funções antigas.

Snapshot direcionado do esquema capturado em `2026-10-15T08:44:39.312836+00:00`: definições das duas funções, colunas, constraints, policies, ACLs/RLS, contagens e impressão digital de contas_pagar. As quatro tabelas Caixa estavam vazias. Este snapshot não equivale a backup integral gerenciado. O roteiro de recuperação preparado bloqueia as quatro tabelas, aborta se houver qualquer registro e só então permite restaurar as funções originais, preservando as colunas aditivas; não foi executado.

No momento deste registro preparatório, migração e publicação ainda aguardam execução e verificação. Nenhum pagamento real, baixa Dantas ou abertura de Caixa foi executado. Evidências finais serão registradas separadamente sem alterar dados financeiros.
