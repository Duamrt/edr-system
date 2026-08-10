# .ponte/ — área de troca Claude ↔ Codex

Diretório de trabalho da ponte. Conteúdo é **efêmero e ignorado pelo git** (só este README é versionado).

- `pedidos/` — pacotes de revisão gerados por `tools/ponte/revisar.sh` (diff + contexto + foco)
- `pareceres/` — resposta do Codex, mais o `.log` bruto da execução quando algo falha

## Quero guardar um parecer como evidência

Pareceres são ignorados de propósito — senão o repo enche a cada revisão. Para versionar um específico:

```bash
git add -f .ponte/pareceres/20260810-143022-parecer.md
```

Use isso quando o parecer virar evidência de um card em `docs/EDR-EXECUCAO.md`.

## Modo assíncrono (Claude na web)

Quando o Claude roda na nuvem e o Codex na sua máquina, os dois não se enxergam. O transporte
passa a ser o próprio repo:

1. Claude: `tools/ponte/revisar.sh --so-pedido` → commita e pusha o pedido (`git add -f`)
2. Você, no Codex local: `git pull` → pede a revisão → salva em `.ponte/pareceres/` → commita e pusha
3. Claude: `git pull` → lê o parecer → corrige

Documentação completa: `docs/PONTE-CLAUDE-CODEX.md`
