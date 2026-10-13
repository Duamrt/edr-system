# Correções de segurança do frontend — 13/10/2026

## Escopo e autorização

Lote autorizado por Duam após auditoria: corrigir as superfícies de renderização confirmadas, retirar a persistência indevida do relatório de obra e atualizar o leitor SheetJS; validar, documentar, commitar e publicar pelo `deploy.sh` existente.

Base examinada: `b87407f2b37fe3166fd3bf013d9cded6c01a9b8b`. O trabalho foi feito em clone independente, preservando o checkout canônico e todas as suas alterações locais. Este documento registra a correção do lote, não certifica a segurança integral do sistema nem representa um resultado oficial de scanner.

Este lote de frontend não alterou banco, RLS, RPCs, credenciais, criação/edição de contas, permissões, aprovações Elyda/Duam, regras financeiras, FIFO ou estoque. Não houve envio de mensagens, escrita de dados em produção nem reprodução de ataques com dados reais. O lote de banco aplicado posteriormente pelo conector está registrado separadamente em [Segurança do banco — auditoria e PCI legado](SEGURANCA-BANCO-AUDIT-PCI-2026-10-13.md).

## Correções

| Superfície | Risco anterior | Comportamento corrigido |
| --- | --- | --- |
| `acompanhar.html` | Slug e campos públicos podiam ser interpretados como HTML. | Slug e erros usam `textContent`; campos recebem escape; fotos usam propriedade e listener. |
| Importação XML e cadastro de materiais | Unidades, descrições, códigos e nomes chegavam a HTML/atributos e handlers sem proteção do contexto completo. | Escape consistente, inclusive execução isolada do importador; autocompletes e similares usam listeners. |
| Usuários, leads, estoque, diárias, obras, PCI e garantias | Aspas/entidades em campos persistidos podiam fechar argumentos de eventos ou atributos. | `escJsArg` produz um literal JavaScript completo, escapado para atributo HTML; campos textuais usam escape de HTML. |
| Diário e termo de entrega | Autor/clima/fotos e assinatura permitiam interpretação de marcação. | Escape de atributos/texto; busca de clima compara dataset; assinatura usa nós de texto e quebras de linha. |
| WhatsApp em leads | A expressão anterior não removia corretamente caracteres que não eram dígitos. | URL montada somente com dígitos do telefone. |
| Relatório de obra | Snapshot financeiro e dados do contratante persistiam em `localStorage`, sem vínculo com sessão/empresa; resposta atrasada podia recriar o snapshot após logout. | Entrega em memória pela aba de origem, identificador aleatório de uso único, prazo de 60 segundos para consumo e conferência da sessão/empresa antes da publicação. Sem dados do relatório em URL ou storage. |
| Relatório já aberto | A aba mantinha conteúdo após logout ou troca de identidade. | Revogação do DOM em logout, troca de sessão/usuário/empresa, expiração, histórico e impressão. Snapshot legado removido. Refresh da mesma sessão permanece válido. |
| Importação de cronograma | SheetJS 0.18.5 incluía versões atingidas por advisories do fornecedor. | Distribuição oficial 0.20.3; loader rejeita versão anterior ou incorreta, informa falha e permite nova tentativa. |

O fluxo válido do relatório continua abrindo uma nova aba. Recarregar ou abrir diretamente essa URL não recupera o relatório; é preciso gerá-lo novamente no sistema. Esse comportamento é intencional para impedir reutilização do snapshot. O encerramento de sessão não pode apagar impressões, capturas ou arquivos que alguém já tenha salvo.

O vínculo local do relatório protege o ciclo de vida da interface. Ele não substitui autorização no servidor nem torna confiável um token alterado pelo próprio usuário no navegador.

## Evidência e validação

Todos os testes de navegador usaram contexto novo, dados sintéticos, service workers bloqueados e transporte interceptado. Nenhum teste acessou Supabase ou endpoints EDR reais. Testes CEF existentes usaram somente servidor HTTP loopback próprio, com respostas sintéticas.

| Suíte nova | Resultado | Cobertura |
| --- | --- | --- |
| `seguranca-importacao.test.js` | 7/7 | Escape de argumentos; FileReader/DOMParser; unidade e cadastro XML; autocomplete/similares; slug e dados públicos. |
| `seguranca-cadastros-ui.test.js` | 6/6 | Usuários, logout/sessão inválida, leads/telefone/autocomplete, autor/clima/fotos do diário. |
| `seguranca-estoque-diarias-browser.test.js` | 6/6 | Estoque em cartões/tabela/categorias/cadastro; aliases, equipe, folha e apontamento mobile; parâmetros preservados. |
| `seguranca-obras-renderizacao.test.js` | 10/10 | Obras, garantias, PCI, cronograma, assinatura; falha/retry/versão do loader; XLSX/XLS/XLSB; comparação visual. |
| `seguranca-relatorio-transferencia.test.js` | 6/6 | Geração legítima, uso único, logout, resposta atrasada, nova sessão, troca de empresa/usuário, refresh, popup bloqueado, expiração, impressão e histórico. |

Total das novas suítes: **35 testes aprovados, zero skips**. A importação de cronograma preservou os 20 pesos extraídos e as 62 subetapas em seis roundtrips (XLSX/XLS/XLSB, peso inteiro e decimal). Imagens de cinco telas com dados legítimos ficaram idênticas à base: garantias, obras, PCI, cronograma e termo.

Também foram executadas 64 regressões existentes de estoque/custos/diárias/PIX, 17 de CEF/entrada de cliente e a suíte existente de conversão XML. Os testes de estoque que carregavam módulos sem os utilitários foram ajustados para usar os helpers reais; as assertivas financeiras não foram relaxadas. `node --check` passou nos 21 arquivos JavaScript/fixtures do lote e `git diff --check` passou.

Controles negativos carregaram os módulos de `b87407f` apenas em memória ou diretório temporário. A base falhou nos seis testes de estoque/diárias, em casos de usuários/telefone/fotos e nas superfícies de importação/página pública. Em obras, nove casos falharam e o comparador visual foi pulado intencionalmente no modo negativo. Falhas por helper/seletor novo ausente e pela URL antiga do SheetJS bloqueada foram tratadas como incompatibilidade estrutural, não como prova isolada de exploração.

Uma prova negativa adicional do relatório antigo foi bloqueada pela ferramenta de delegação e não foi repetida por outro caminho. A evidência do defeito anterior nesse item permanece a leitura do código; os seis testes do relatório corrigido foram executados. O sandbox Windows inicialmente impediu Chromium e três conexões loopback; as execuções isoladas autorizadas fora desse sandbox passaram.

### Reprodução dos testes novos

Requisitos locais: Node.js, Playwright e Chromium. Definir `EDR_PLAYWRIGHT_MODULE` e `EDR_CHROMIUM_EXECUTABLE` se não estiverem resolvidos no ambiente. Para os roundtrips reais, definir `EDR_SHEETJS_RUNTIME` para cópia local da distribuição oficial 0.20.3. Sem essa variável, o teste correspondente fica explicitamente marcado como skip e não equivale à validação completa registrada aqui.

```powershell
node --test tests/seguranca-importacao.test.js tests/seguranca-cadastros-ui.test.js tests/seguranca-estoque-diarias-browser.test.js tests/seguranca-obras-renderizacao.test.js tests/seguranca-relatorio-transferencia.test.js
```

Runtime oficial usado: 951904 bytes; SHA-256 `CC015130AA8521E7F088F88898EBA949CCDCBFB38DF0BD129B44B7273C3A6F41`. Essa cópia serviu ao teste e não foi adicionada ao repositório.

- [Distribuição standalone oficial do SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/standalone/)
- [CVE-2023-30533 — advisory do fornecedor](https://cdn.sheetjs.com/advisories/CVE-2023-30533)
- [CVE-2024-22363 — advisory do fornecedor](https://cdn.sheetjs.com/advisories/CVE-2024-22363)

Não foi executado arquivo malicioso para explorar o parser; a atualização se apoia nas versões afetadas/corrigidas documentadas pelo fornecedor e em testes funcionais da versão nova.

## Publicação e recuperação

Gate de publicação: revisão independente do diff, testes descritos acima, ausência de segredos novos, checkout isolado limpo e branches compatíveis com fast-forward. A publicação usa exclusivamente o `deploy.sh` existente, que faz o cache busting e atualiza o service worker. O commit de correção deve ficar separado do commit automático de cache.

A revisão independente foi concluída sem bypass ou regressão concreta identificada no escopo. O revisor executou os 35 testes de segurança, dez regressões adicionais existentes e um ensaio próprio: fechar a aba de origem manteve a impressão enquanto autorizada; logout em outra aba revogou o relatório. Isso não valida outros navegadores, disponibilidade futura de CDN ou controles do servidor.

A publicação foi confirmada: commit de correção `43204649fc4871f1c63b6f614a015f4a5c23270e`; release/cache `d38f3008870592fbe8cbad54099a60a86410c8b1`. O GitHub Pages informou `built`, sem erro, às `2026-10-13T20:12:56Z`. Os 26 arquivos públicos alterados coincidiram por SHA-256 com os blobs desse release. O smoke em Chromium novo, sem sessão e com transporte externo bloqueado, confirmou login visível, relatório direto vazio e portal sem slug no estado vazio; zero erros de página. Versão dos recursos `10131712`, service worker `edr-system-v20261013171204`.

O frontend não exigiu migração. Há `rollback.sh`, mas ele reverte somente o último commit: se este for o cache bump ou uma atualização documental, não desfaz o patch de segurança. Em caso de regressão, identificar explicitamente o commit afetado e preferir correção pontual; reverter o lote inteiro reabriria os riscos descritos. Rollback de código não reverte o lote de banco aplicado separadamente. Não executar rollback automático sem avaliar o problema e o escopo autorizado.

## Próximos lotes, sujeitos a aprovação separada

1. **Demais objetos de banco, RLS e RPCs:** o conector já concluiu o lote específico de `audit_logs` e `pci_medicoes` plural, documentado separadamente. Para os demais objetos, preparar mudanças individualizadas após cruzar o inventário atual obtido pelo responsável pelo Supabase. Demonstrar tenant/ator ativo e aprovações no servidor com testes locais sintéticos; levantar consumidores antes de revogar grants/policies. Nenhuma alteração de banco foi executada pelo lote de frontend.
2. **Contas, senhas e sessão no servidor:** proposta própria para as funções implantadas, com checagem de identidade ativa, papel e empresa do alvo. A existência de botão oculto no frontend não serve como autorização. Não modificar credenciais ou contas como efeito deste release.
3. **Funções e integrações:** localizar jobs/chamadores e confirmar uso de `relatorio-semanal`, `dynamic-endpoint` e funções comerciais condicionais antes de mudanças. Rotação de segredos, restrição de destinos e interrupção de jobs precisam de plano por ação e verificação dos consumidores.

### Dependências locais levantadas para o próximo lote

- Não foi encontrado consumidor frontend/Edge local que insira diretamente em `audit_logs`. A fixture `tests/fixtures/entrada-plano-auth-local-bootstrap.sql` define `fn_audit_log` como `SECURITY DEFINER`, com escrita por triggers e revogação de acesso direto; snapshots de 06/10 registram função equivalente. Fixtures e snapshots não comprovam a implantação atual.
- Nenhum consumidor local de `pci_medicoes` (plural) foi encontrado. O código usa `pci_medicao` (singular), por exemplo em `js/edr-v2-pci.js`, e o SQL local cria o singular. Não tratar as tabelas como equivalentes.
- A implementação local de `relatorio-semanal` consulta obras/financeiro/diárias e envia um resumo; não consulta PCI. Não foi encontrado chamador ou agendamento local pelo nome. `dynamic-endpoint` não tem implementação/chamador identificado neste checkout. Não deduzir inexistência de jobs remotos dessa ausência local.

Os próximos lotes precisam declarar ação exata, motivo, consumidores afetados, teste de isolamento/regressão, reversão e evidência do ambiente atual antes de pedir aprovação. A correção já informada da tabela de backup de telhas não constitui garantia sobre outras tabelas ou funções.
