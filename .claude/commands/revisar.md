---
description: Manda o diff atual para o Codex revisar e traz o parecer de volta (sem copiar e colar)
argument-hint: [foco da revisão, ex "RLS de notas"] | --escopo main..HEAD
allowed-tools: Bash(tools/ponte/revisar.sh:*), Read, Grep, Glob
---

Dispare a revisão do Codex sobre as alterações atuais e traga o parecer para dentro desta conversa.

## Passos

1. Rode `tools/ponte/revisar.sh` passando `$ARGUMENTS` como `--foco` (ou repassando `--escopo` se o usuário informou um range).
   - Timeout generoso: o Codex costuma levar de 1 a 5 minutos.
   - O script imprime o caminho do parecer na última linha do stdout.
2. Leia o arquivo de parecer.
3. Apresente ao usuário, em português:
   - **Veredito** do Codex em uma linha.
   - **Achados CRÍTICO/ALTO** com a prova (arquivo:linha) que o revisor citou.
   - **Onde você discorda**, com prova. O Codex é revisor, não é dono da verdade — se ele errou sobre um contrato do repo (`CLAUDE.md` / `AGENTS.md`), diga isso explicitamente em vez de obedecer.
4. Proponha o plano de correção — do mais grave ao menos grave, menor diff possível, sem misturar refactor com bugfix. **Não aplique nada antes do "vai" do usuário.**

## Se o script falhar

- `exit 127` = Codex CLI não está no PATH. O pedido de revisão ficou gravado em `.ponte/pedidos/` mesmo assim — avise o usuário e ofereça o modo assíncrono (commitar o pedido e pedir a revisão pelo Codex depois).
- `exit 3` = não há diff no escopo. Pergunte qual escopo revisar.
- `exit 4` = o Codex rodou mas falhou. Leia o `.log` ao lado do parecer e reporte o erro real, sem adivinhar.
