# Handoff — EDR System
**Data:** 2026-04-08
**Sessão:** BUG #2 — unicidade de código de material (000223 duplicado)

## O que foi feito
- Identificados 5 pontos de insert na tabela `materiais` sem validação de `codigo` duplicado
- Adicionada trava de unicidade de `codigo` em todos os pontos antes do `sbPost`
- Deploy realizado: **v04081330**

## O que funcionou
- Recarregar catálogo do banco (`_carregarCatalogo` / `loadMateriais`) antes de gerar próximo código — garante dados frescos
- Verificação dupla: nome + codigo antes de inserir
- Loop em `autocadastrarMateriais` já atualiza o array local após cada insert, então check por codigo no array local é suficiente

## O que não funcionou / bloqueios
- Os dois registros `000223` já existentes no banco **não foram corrigidos** — precisam ser resolvidos manualmente via Supabase (renomear ou excluir o duplicado)

## Próximos passos
- [ ] **URGENTE:** Supabase → tabela `materiais` → localizar os dois `codigo = '000223'` e corrigir manualmente
- [ ] Checar outros duplicados: `SELECT codigo, COUNT(*) FROM materiais GROUP BY codigo HAVING COUNT(*) > 1;`
- [ ] Considerar UNIQUE CONSTRAINT no banco: `ALTER TABLE materiais ADD CONSTRAINT materiais_codigo_unique UNIQUE (codigo);`
- [ ] Continuar lista de bugs: `/Downloads/EDR_BUGS_CLAUDE_CODE.md` — BUG #1 e #4 corrigidos em sessão anterior, BUG #2 corrigido agora

## Arquivos modificados
- `js/edr-v2-estoque.js` — 3 funções:
  - `_criarMaterialEVincular`: check de codigo duplicado + abort com reload se colidir
  - `duplicarMaterial`: reload forçado do catálogo antes de gerar próximo código
  - `salvarMaterial`: reload + double-check de nome e codigo com dados frescos do banco
- `js/edr-v2-notas.js` — `autocadastrarMateriais`: skip se codigo gerado já existir no array local
- `js/edr-v2-utils-extras.js` — `salvarCadastroRapido`: reload via `loadMateriais()` + check de codigo antes do insert

## Contexto importante
- Bug original: `000223 - ESTRIBOS CA60 4.2MM 7X17` e `000223 - ESTRIBOS` — dois materiais com mesmo código na obra Pedro
- Causa provável: catálogo em memória desatualizado → `obterProximoCodigoDisponivel()` / `_proxCodigoCatalogo()` retornando mesmo código em imports simultâneos ou sessões paralelas
- `loadMateriais()` está em `edr-v2-infra.js` e é global — seguro chamar de qualquer módulo
- `_carregarCatalogo()` é local do módulo estoque, atualiza `EstoqueModule.catalogoMateriais`
- Deploy sempre via `./deploy.sh "mensagem"` — versão atual: **v04081330**
- Repo: `~/edr-system/` (nunca `edr-system-v2/`)
