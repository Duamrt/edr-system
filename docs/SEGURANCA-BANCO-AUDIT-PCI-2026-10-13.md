# Segurança do banco — auditoria e PCI legado, 13/10/2026

## Resultado informado pelo executor do banco

O coordenador confirmou a aplicação pelo conector da migração `20261013201612_secure_audit_insert_and_legacy_pci_access`, concluída às **20:16 UTC de 13/10/2026**. Este registro documental usa as evidências fornecidas por esse executor; não representa nova aplicação ou verificação independente do banco pelo desktop.

Relatório de origem informado na Library: `libfile_8738b41c4da081919ce0a950f7f8c65d`. O arquivo não foi materializado nem relido nesta atualização.

| Objeto | Alteração confirmada pelo coordenador | Preservação informada |
| --- | --- | --- |
| `public.audit_logs` | Retirado `INSERT` direto de `anon`, `authenticated` e `PUBLIC`; removida a policy aberta `audit_insert`. | `SELECT` autorizado sob RLS mantido; 9.175 registros antes e depois. |
| `public.pci_medicoes` — plural | Retirados todos os privilégios de clientes e removida a policy aberta. | Dados e acesso administrativo preservados; zero registros antes e depois. |
| `public.pci_medicao` — singular | Nenhuma alteração neste lote. | Objeto usado pelo frontend permanece distinto da tabela plural. |
| Auditoria por triggers | Nenhuma alteração nos 12 triggers ou no hash da função `fn_audit_log`. | Função continua `SECURITY DEFINER`, pertencente a `postgres`. |

## Histórico da execução

A primeira tentativa foi cancelada **sem commit**. O histórico informado também registrou o erro PostgreSQL `42725`; o retry corrigiu exclusivamente o cast `tgenabled::text`. A execução final foi confirmada como bem-sucedida pelo conector. A anotação anterior de estado pendente por cancelamento está, portanto, superada por essa confirmação final.

Nenhuma migração foi executada ou duplicada pelo desktop para produzir este documento. Não foi criado SQL alternativo, alterado código de produção ou modificado outro objeto do sistema nesta atualização documental.

## Validação e limites

A evidência fornecida compreende catálogo, permissões e comparação dos invariantes: contagens de registros, 12 triggers e hash da função de auditoria preservados. **Não houve teste de escrita de negócio.** A preservação desses invariantes não equivale a uma validação funcional completa de todas as operações que geram auditoria.

O levantamento local anterior não encontrou inserção direta em `audit_logs` pelo frontend/Edge local, nem consumidor da tabela plural `pci_medicoes`; o frontend usa a tabela singular `pci_medicao`. Esse levantamento apoia a análise de dependências, mas não comprova a ausência de consumidores externos ou jobs remotos.

Esta migração trata os objetos e permissões descritos acima. Não é garantia sobre outras tabelas, RPCs, contas, funções Edge, integrações ou aprovações financeiras. Os demais lotes continuam sujeitos ao inventário atual, proposta específica, teste, plano de reversão e aprovação por ação.

## Relação com o release do frontend

O [lote de frontend](SEGURANCA-FRONTEND-2026-10-13.md) foi publicado anteriormente, com correção `43204649fc4871f1c63b6f614a015f4a5c23270e` e release `d38f3008870592fbe8cbad54099a60a86410c8b1`. Não dependeu de migração de banco. A presente atualização é um commit separado de documentação e não reaplica o release nem a migração.
