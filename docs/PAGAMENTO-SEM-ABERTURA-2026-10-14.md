# Pagamento ocorrido sem abertura de Caixa — revisão local

Implementação preparada em 14/10/2026, somente em cópia isolada. Nenhum pagamento, baixa, abertura, permissão, migração ou deploy foi realizado em produção. A conta Dantas não foi alterada. O repositório original foi preservado.

## Comportamento preparado

Em **Contas a Pagar → Confirmar pagamento**, o administrador informa origem, valor efetivamente pago, data, referência e confirma que o pagamento ocorreu. Horário é opcional. Não há transferência bancária nesta ação.

- Sem abertura, somente pagamentos de obrigações podem ser registrados. Origem: C6 PJ ou dinheiro no escritório, as duas contas já previstas pelo sistema. Não se cria conta/saldo fictício.
- O pagamento fica no histórico existente com **conciliação pendente**, também indicada na conta a pagar. A obrigação pode ficar quitada enquanto a conciliação do Caixa continua pendente.
- Abrir o Caixa posteriormente não absorve nem desconta esses registros. Em **Movimentos efetivos → Conferir com abertura**, o administrador decide se o pagamento já estava incluído no saldo informado ou ocorreu depois. Falta de informação mantém a pendência. Datas/horários que contradizem a decisão são rejeitados.
- Com abertura, pagamentos com data/hora suficientes mantêm a regra de corte já existente. No dia do corte sem horário nem decisão, o pagamento também pode ficar pendente de conciliação.
- Parcial abate apenas sua parte. Em “Houve desconto ou juros?”, o abatimento da obrigação é **pago + desconto − juros/multa**. O saldo de Caixa considera só o dinheiro efetivamente pago; o valor original da obrigação permanece intacto. Não há lançamento automático de custo ou ajuste de DRE.
- Cancelar movimento mantém a trilha original, registra autor/motivo e recompõe obrigação/saldo apenas onde houve efeito. Cancelar registro não é devolver dinheiro pelo banco. Uma devolução real ocorrida posteriormente requer registrar a entrada efetiva correspondente; não se presume que ela ocorreu.
- Visão Financeira aceita o novo histórico e mantém o disponível desconhecido enquanto houver conciliação pendente. A tela Caixa identifica o saldo antes da conciliação.

## Persistência e segurança

Migração revisável: `sql/caixa-pagamento-sem-abertura-DRAFT.sql`. Não aplicada remotamente.

Usa as tabelas e RPCs existentes. Em `caixa_movimentos`, acrescenta origem, desconto/juros e autor/data da conciliação; permite `conta_id` nulo exclusivamente no estado de pagamento pendente. A abertura permanece imutável e sem conciliação automática.

`caixa_registrar` conserva autenticação, administrador ativo, empresa derivada da sessão, isolamento por empresa, trava transacional por empresa, snapshot da obrigação e recibo de operação. Reenvio com o mesmo UUID/pedido retorna o recibo; UUID reutilizado com conteúdo diferente falha. A conciliação usa a mesma trava e trilha. O formulário conserva UUID/pedido em resposta incerta, inclusive após recarga. Escrita direta no histórico continua proibida. Não há novos GRANTs, policies, contas ou credenciais.

O impacto de segurança a aprovar é a ampliação da RPC `SECURITY DEFINER` existente para registrar pagamentos sem abertura e conciliar esses registros, mantendo os mesmos controles de acesso. A migração verifica a impressão digital das duas funções de origem e aborta se estiverem diferentes, evitando sobrescrever outra versão. Não remover essa trava para forçar aplicação.

## Verificação local

Testes focados: `caixa-prospectivo-db.test.js` (agora também aplica a migração nova), `caixa-pagamento-sem-abertura-db.test.js`, `caixa-pagamento-sem-abertura-pg.test.js`, `caixa-prospectivo-ui.test.js`, e testes de dados/modelo/contexto da Visão Financeira.

Cobertura: sem/com abertura; origem/data/horário inválidos e futuros; confirmação de pagamento; parcelas; descontos/juros; limite monetário; reenvio e concorrência; abertura concorrente; conciliação incluída/posterior/sem informação; cancelamento; isolamento por empresa/perfil/usuário inativo; rejeição de escrita direta; falha de persistência com reversão atômica; preservação de custo/estoque/folha; migração recusada em versão divergente; formulário real em Chromium desktop/celular sem requisições externas.

Runtime de banco: PGlite com PostgreSQL 17 e cluster PostgreSQL **17.11** novo, restrito a loopback, encerrado ao fim. Testes usam helpers de autenticação sintéticos; não comprovam integração com uma sessão Supabase Auth real. Imagens/logs ficam no diretório superior `evidencias/` e arquivos `*-final.log` / `browser-tests.log`.

Resultado verificado: **29/29 testes de banco**, **39/39 de interface (incluindo Chromium)** e regressões de dados/modelo/contexto da Visão Financeira aprovadas. `git diff --check` sem erros. Os dez arquivos preexistentes modificados nesta cópia foram comparados com a base copiada e continuam intactos no repositório original.

Reprodução: definir `EDR_PGLITE_PATH` para instalação local de `@electric-sql/pglite`, `EDR_POSTGRES_BIN` para binários PG17, `EDR_PG_TEST_ROOT` para pasta descartável, `EDR_PLAYWRIGHT_PATH` e `EDR_CHROMIUM_PATH` para runtime de navegador existente. Executar `node --test` com os sete arquivos acima. Não apontar esses testes para URL/banco existente.

## Limites e publicação

Não há integração com extrato nem identificação automática de comprovante duplicado. Um novo UUID representa uma nova operação; o reenvio deve usar a chave preservada. O limite do restante impede excesso, mas dois pagamentos parciais intencionais com UUIDs diferentes são dois registros. Não permite baixa exclusivamente por desconto sem saída de dinheiro (valor pago deve ser positivo), outras origens, nem juros/desconto como lançamento contábil automático.

Homologação com sessão real concluída em QA em 15/10/2026, conforme evidência abaixo. Antes de publicar: preservar backup e conferir a integração do patch no repositório oficial. A comparação de produção somente leitura abaixo confirmou a base atual; repetir o preflight no momento da aplicação para detectar mudanças posteriores.

Exige aprovação explícita para **aplicar esta migração no projeto `mepzoxoahpwcvvlymlfh` e publicar os arquivos de frontend via `deploy.sh`**. A integração do patch deve preservar os trabalhos locais do repositório de produção. A cópia isolada é um snapshot local para revisão, não tem a genealogia/remote do repositório original e não deve ser usada diretamente para push/deploy.

Migração e frontend devem ser publicados de forma coordenada: frontend novo recusa pagamentos se a versão do banco ainda for antiga; frontend antigo não envia a confirmação exigida pela RPC nova e precisará recarregar após a publicação. Nenhuma autorização de publicação substitui a confirmação dos dados para pagamentos ou abertura reais.

Após gravar dados no novo formato, não restaurar cegamente funções antigas nem usar rollback que apague tabelas. Preservar pendências/recibos e fazer correção compatível ou suspender escrita até revisão. Nenhum rollback destrutivo foi preparado.

## Verificação independente posterior — 14/10/2026

Consultas exclusivamente SELECT no catálogo do projeto `mepzoxoahpwcvvlymlfh` confirmaram:

| Função atual | MD5 normalizado do corpo | Comparação com a base |
|---|---|---|
| `public.caixa_estado()` | `e541b7f7043b9fa6e0aa3129fef6ba20` | Igual |
| `public.caixa_registrar(uuid,jsonb)` | `7d766e79ef9be24b5d8500440bf06c4c` | Igual |

Normalização usada: `md5(btrim(replace(prosrc,chr(13),''),chr(32)||chr(10)||chr(9)))`, a mesma do preflight da migração. Ambas são SECURITY DEFINER com `search_path=pg_catalog, public`; `authenticated` possui EXECUTE e `anon` não. As quatro tabelas de Caixa têm RLS ativo, SELECT para authenticated e nenhum INSERT/UPDATE/DELETE direto para esse papel.

A constraint `caixa_movimentos_decisao_corte_check` e `conta_id NOT NULL` estão na versão esperada, e as cinco colunas novas ainda não existem. A única outra função pública encontrada chamando `caixa_registrar` foi `entrada_plano_operar(uuid,uuid,jsonb)`, nos tipos `entrada` e `saida`; esses contratos continuam exigindo abertura e não recebem a nova exigência de confirmação de pagamento.

Revisão do diff: corrigido o rótulo do resumo de Contas a Pagar para **QUITADAS NO MÊS · VALOR ORIGINAL**. O cálculo já era por valor original da obrigação; o rótulo anterior “PAGO EM” poderia confundir desconto/juros com dinheiro pago. Um teste específico verifica obrigação original de R$400, pagamento de R$250, desconto de R$150 e conciliação pendente, sem reinterpretar o resumo como extrato mensal. Nenhuma outra incompatibilidade impeditiva foi identificada na revisão focada; permanecem a atualização coordenada do frontend e as limitações registradas acima.

## Homologação autenticada concluída — 15/10/2026

**9/9 etapas aprovadas**, com GoTrue, PostgREST, PostgreSQL e Chromium reais. A migração exata deste patch foi aplicada somente na stack local `edr-entrada-qa-20261008`. API e interface responderam HTTP 200 em localhost18081/18080; não foi necessário publicar a porta do banco. Produção não foi consultada ou alterada nesta etapa.

O ensaio `tests/caixa-pagamento-sem-abertura-auth-local.cjs` exige a autorização explícita `EDR_PAY_AUTH_LOCAL_RUN=AUTHORIZED_LOCAL_QA`, fixa endpoints locais e confere o marcador do banco e os hashes dos corpos das funções. Guarda uma cópia do schema anterior e compara impressões digitais dos dados preexistentes antes/depois. Usa quatro identidades sintéticas por execução (administrador, visitante, administrador inativo e administrador de outra empresa), com senhas aleatórias mantidas apenas na memória.

- migracao local exata e dados anteriores preservados.
- quatro identidades sinteticas autenticadas pelo GoTrue real.
- login real pela tela e empresa/perfil confirmados.
- parcial com desconto/juros, resposta perdida e reenvio apos recarga sem duplicacao.
- quitacao preserva original e cancelamento reabre somente o restante correto.
- perfis, inativo, anonimo, empresa e escrita direta bloqueados pelo servidor.
- abertura nao absorve pendencias; conciliacao explicita uma vez e cancelamento recompõe saldo.
- concorrencia, autoria e preservacao integral dos dados anteriores/custos/folha/estoque.
- sessoes descartadas e contas sinteticas desativadas.

O login ocorreu pelo formulário original, com email/senha sintéticos; não houve injeção de identidade ou simulação de respostas financeiras. O ensaio provocou perda da resposta somente após commit real, recarregou a página e conferiu a mesma operação pelo botão de recuperação. Autoria e recibos foram conferidos no banco. A concorrência foi ensaiada com duas chamadas reais simultâneas e a mesma chave.

As contas sintéticas foram desativadas no vínculo da empresa e bloqueadas no Auth; sessões foram revogadas/removidas e as credenciais descartadas. Os registros fictícios permanecem identificados no QA para auditoria. Nenhum usuário preexistente foi alterado. As verificações preservaram custos, folha, estoque e todos os dados anteriores das tabelas envolvidas. RLS permaneceu ativo nas quatro tabelas; authenticated continua sem INSERT/UPDATE/DELETE direto, anon sem EXECUTE nas duas RPCs; ACL e search_path preservados.

Não foi identificada regressão adicional no produto. Os ajustes deste ensaio se limitaram ao roteiro: ordenar corretamente a tabela com chave composta, informar conta_id no cenário com abertura e reconhecer a consulta de estoque e a atualização de nome/email do próprio usuário feitas pelo boot original. A barreira de rede valida que essa atualização só alcança o vínculo sintético e não modifica perfil ou permissões.

Evidências locais: `output/playwright/pagamento-auth-result.json`, `qa-auth-local-final.log` e imagens `pagamento-auth-formulario.png`, `pagamento-auth-conciliacao.png`, `pagamento-auth-mobile.png`, no diretório desta tarefa. Não há senhas/tokens nos relatórios nem gravação de storageState/trace. A QA tem schema reduzido de outros módulos e bloqueia recursos externos: esta homologação cobre o fluxo de pagamento, e não certifica todos os módulos ou serviços externos da aplicação.

## Escopo exato para aprovação de publicação — não executado

1. Integrar o patch em checkout/worktree limpo com a genealogia e remote reais, preservando integralmente as alterações locais do repositório original. Não executar deploy a partir do snapshot desta tarefa. Comitar somente os arquivos revisados.
2. Preservar backup e repetir o preflight. Aplicar `sql/caixa-pagamento-sem-abertura-DRAFT.sql` somente no projeto `mepzoxoahpwcvvlymlfh`: ampliar `public.caixa_movimentos` com origem, desconto, juros e autoria/data de conciliação; ajustar nulabilidade/constraints; substituir os corpos de `public.caixa_estado()` e `public.caixa_registrar(uuid,jsonb)`. Nenhum GRANT, policy, usuário ou credencial de produção é criado/alterado. Interromper se os hashes de origem divergirem.
3. Publicar de forma coordenada os seis arquivos de comportamento: `js/edr-v2-caixa-prospectivo.js`, `js/edr-v2-financeiro.js`, `js/edr-v2-visao-financeira-contexto.js`, `js/edr-v2-visao-financeira-dados.js`, `js/edr-v2-visao-financeira-modelo.js` e `js/edr-v2-visao-financeira-ui.js`.
4. Usar o `deploy.sh` oficial a partir de dev limpa. Ele gera versão/cache, comita a invalidação e publica origin/dev e origin/main por fast-forward. Seu escopo de cache inclui `sw.js` e os HTMLs rastreados na raiz: `acompanhar.html`, `agenda-iannaline.html`, `agenda.html`, `index.html`, `landing.html`, `meu-plano.html`, `novo-cliente.html`, `preview-polimento.html`, `produto.html`, `relatorio-obra.html`, `termo-entrega.html` e `tracker.html`. Esses ajustes são de versão de recursos; não ampliam o comportamento funcional da correção. Não pular os bloqueios de checkout limpo, ancestrais remotos ou pre-deploy.
5. Conferir a versão publicada e o estado por leitura. Não registrar pagamento, abertura, conciliação ou baixa de conta real como smoke test. Frontends antigos devem recarregar; não fazer rollback destrutivo depois de existirem registros no formato novo.

Os testes e esta documentação acompanham a revisão do patch. A aprovação acima é somente de publicação da correção; não autoriza registrar o pagamento Dantas ou qualquer valor bancário real.
