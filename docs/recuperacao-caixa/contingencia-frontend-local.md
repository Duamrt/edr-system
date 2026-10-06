# Contingência frontend compatível - preparo separado

Ensaio concluído em **06/10/2026: 5/5 testes aprovados**, sem falhas ou skips, em Chromium **154.0.8037.93**. Aplicação/reversão do patch e callbacks de leitura, pagamentos, cancelamento, reenvio e guards foram verificados com dados sintéticos. Resultado e hashes: [evidência local](../evidencias-caixa/2026-10-06-contingencia-testes.md).

O artefato `caixa-suspender-mutacoes.patch` altera somente uma cópia de `js/edr-v2-caixa-prospectivo.js`. O frontend normal não recebeu esse patch. Não há flag em produção, parâmetro de URL ou alteração de grants, policies, autenticação, saldo ou dados.

Na cópia de contingência, as quatro funções públicas de abertura de formulário, gravação, cancelamento e reenvio retornam um aviso antes de qualquer envio. Os controles correspondentes ficam desativados. Leitura por `caixa_estado`, contas bancárias/dinheiro/total, obrigações com restante confirmado, movimentos/auditoria e alertas continuam usando os mesmos caminhos. O journal conserva UUID/pedido incerto até retomada/conferência; não vira saldo nem é apagado para esconder incerteza.

Os guards normais de obrigações vinculadas permanecem intactos: **Pago** de uma obrigação a pagar usa a função de pagamento suspensa; editar/excluir exige recarga do ledger e continua bloqueado para registros vinculados. Previsões de caixa e confirmação de reembolso do fornecedor continuam pelos fluxos existentes, fora do ledger; essa confirmação cadastral de recebimento não cria entrada efetiva no controle prospectivo. O aviso delimita a suspensão ao controle prospectivo. Os demais módulos e políticas existentes não foram alterados. Essa contingência de interface não revoga RPC no banco e não bloqueia abas/builds antigos, clientes externos ou chamadas diretas ao backend. A pausa depende da coordenação dos operadores; não apresentar deploy/cache como bloqueio global de escrita.

## Artefato revisável e aplicação somente em cópia

O manifesto `caixa-suspender-mutacoes.json` identifica os hashes da base, do patch e da cópia resultante, normalizados para LF. Se o frontend normal mudar, a preparação recusa aplicação por suposição. Revisar/regenerar o patch contra o pacote congelado antes de qualquer publicação futura.

Para preparar novamente o artefato local contra uma base conscientemente revisada:

```powershell
node tests/fixtures/caixa-contingencia.cjs --gerar
```

Esse comando gera apenas patch/manifesto em `docs/recuperacao-caixa`; não modifica o módulo normal e não publica nada. Para verificar aplicação numa cópia temporária, o teste usa `git apply --check`, aplica o patch e compara o hash resultante. A reversão `git apply -R` também é conferida nessa cópia.

Para executar os testes de interface, usar Playwright/Chromium já disponíveis e um contexto novo sem perfil/sessão do usuário:

```powershell
$env:EDR_PLAYWRIGHT_PATH='<pasta local de playwright já instalada>'
$env:EDR_CHROMIUM_PATH='<executável Chromium local já instalado, se necessário>'
$env:EDR_UI_EVIDENCE_DIR='<pasta de artefatos sintéticos de teste>'
node --test tests/caixa-contingencia-ui.test.js
```

O navegador fica headless; a página de ensaio é respondida pela interceptação do próprio teste em origem `127.0.0.1`, sem servidor, Authstack ou recursos externos. Os testes usam dados integralmente sintéticos e callbacks reais do módulo, financeiro e helpers de alertas. Falta de Playwright é reportada como skip, não aprovação de Chromium.

## Uso futuro, sujeito à revisão e autorização do alvo

Preparar uma branch/checkout de contingência a partir do commit funcional publicado, conservando todos os arquivos compatíveis do ledger, financeiro e alertas. Confirmar hashes/base e aplicar o patch apenas ali. Não retornar integralmente a `7ace6ac`, não executar `rollback.sh` às cegas e não publicar a versão de contingência como se fosse o pacote normal.

Antes de publicar essa cópia, registrar commit, diff, testes, alvo e plano de retomada; coordenar a pausa de pagamentos e atualização dos operadores. Cache/versão devem ser emitidos pelo `deploy.sh` autorizado, sem buster manual. Conferir build servido e controles desativados em sessão própria; manter banco e auditoria intactos. Após correção e revisão, a retomada usa um build compatível sem a suspensão, conserva o banco e confere pedidos incertos pelos mesmos recibos/UUIDs antes de novas digitações.

Este preparo não executou deploy, push, migração, restore no Authstack ou alteração de dados reais. Backup/restauração local é um ensaio separado descrito em `backup-restore-local.md`.
