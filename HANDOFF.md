# Handoff — EDR System V2
**Data:** 2026-04-06
**Sessão:** Correções na tela de Permissões — 400 no company_users, nomes de usuários, matriz editável

## O que foi feito
- Fix 400 Bad Request em `renderPermissoes`: `company_users` não tem colunas `nome`/`email` — query ajustada
- SQL rodado pelo Duam: `ALTER TABLE company_users ADD COLUMN IF NOT EXISTS nome text; email text;`
- SQL rodado pelo Duam: `ALTER TABLE companies ADD COLUMN IF NOT EXISTS permissions jsonb;`
- `_carregarCompanyId()` agora salva `nome`/`email` do usuário logado em `company_users` a cada login (auto-populate)
- `renderPermissoes` simplificado: busca `nome`/`email` direto de `company_users` (agora que as colunas existem)
- Matriz de permissões tornou-se **editável**: admin clica nos ícones de Operacional/Mestre/Visitante para liberar ou bloquear
- `_togglePermissao(perfilId, moduloId)` + `_salvarPermissoes()` adicionados em `edr-v2-auth.js`
- `_aplicarPermissoesBanco(perms)` adicionado em `index.html` — carrega `companies.permissions` e sobrescreve `PERFIL_VIEWS` em runtime
- `loadCompanyPlan()` atualizado para buscar `permissions` junto com `plan,trial_ends_at`

## O que funcionou
- Auto-populate de nome/email: cada usuário que fizer login grava seus dados em `company_users` automaticamente
- Matriz clicável com save no banco funcionando
- Fix do 400 resolvido permanentemente

## O que não funcionou / bloqueios
- **QUEBREI** a sidebar: ao mudar os defaults do `PERFIL_VIEWS` (operacional → lista restrita), o `_applyPermissionFilter` escondeu P&L (`relatorio`), Fluxo de Caixa (`caixa`) e Configuração (`setup`) antes do sistema confirmar o perfil real do usuário
- Causa: `_applyPermissionFilter` roda no `DOMContentLoaded` com o perfil do localStorage, antes de `_carregarCompanyId` confirmar o role do banco
- Solução: revertidos defaults para `null` (acesso total) — configuração deve ser feita via matriz na UI, não via código

## Próximos passos
- **Usuários sem nome** ainda aparecem como "—" até fazerem login novamente (auto-resolve conforme entram)
- **Tela de Permissões — tarefa pendente**: fix layout aba Equipe em `edr-v2-diario.js` + limpeza de tabs AGENDA/OBRAS no Painel (`index.html`) — sessão interrompida antes de executar
- **Configurar permissões reais**: Duam ainda não definiu o que Operacional e Visitante podem ou não ver — usar a matriz editável para isso
- **Race condition latente**: `_applyPermissionFilter` deve ser chamado APÓS `_carregarCompanyId` resolver, não no DOMContentLoaded. Refatorar para evitar bug em sessões lentas

## Arquivos modificados
- `js/edr-v2-auth.js` — fix query company_users, _carregarCompanyId salva nome/email, _togglePermissao, _salvarPermissoes, renderPermissoes com matriz clicável
- `js/edr-v2-infra.js` — loadCompanyPlan busca `permissions`, chama `_aplicarPermissoesBanco`
- `index.html` — PERFIL_VIEWS defaults (revertidos para null), função `_aplicarPermissoesBanco`

## Contexto importante
- `company_users.user_id` = UUID do Supabase Auth (não da tabela `usuarios` do V1)
- `sbPatch('company_users', rows[0].id, {...})` — funciona porque `sbPatch` converte UUID puro para `?id=eq.UUID`
- Admin sempre tem `null` (acesso total) — coluna Admin na matriz não é clicável por design
- Permissões salvas em `companies.permissions` como JSONB — só operacional/mestre/visitante, admin nunca entra
- Deploy via `./deploy.sh` — último deploy: `v20260406204016`
