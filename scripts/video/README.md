# Melhorar vídeo — EDR Engenharia

Script local para **melhorar qualidade e saturação de vídeo sem cortar nada**.
Duração integral, áudio original e data de criação são preservados.

> Utilitário local. Não faz parte do site publicado — roda na máquina Windows.

---

## Instalação (uma vez só)

```powershell
winget install Gyan.FFmpeg
```

Feche e reabra o terminal depois de instalar.

---

## Uso

**Jeito fácil:** arraste os vídeos para cima de `melhorar-video.bat`.

**Pelo terminal:**

```powershell
.\melhorar-video.ps1 "C:\Users\voce\Downloads\EPISÓDIO 9.MOV"
.\melhorar-video.ps1 "ENTREGA DE LEONARDO.MOV" "EPISÓDIO 9.MOV"
```

Saída: mesmo diretório, com sufixo `_MELHORADO.mp4`.
O arquivo original nunca é alterado nem sobrescrito.

---

## Parâmetros

| Parâmetro     | Padrão | O que faz |
|---|---|---|
| `-Saturacao`  | `1.28` | Intensidade da cor. `1.0` = original, `1.45` = forte |
| `-Contraste`  | `1.05` | Contraste. Acima de `1.15` começa a estourar sombra |
| `-Nitidez`    | `0.7`  | Sharpening. `0` desliga, `1.2` agressivo (pode granular) |
| `-Crf`        | `17`   | Qualidade. Menor = melhor e mais pesado. `15` quase lossless, `20` mais leve |
| `-Preset`     | `slow` | Velocidade de encode. `medium` é ~2× mais rápido com perda mínima |
| `-Sufixo`     | `_MELHORADO` | Sufixo do arquivo de saída |

Exemplo com cor mais puxada:

```powershell
.\melhorar-video.ps1 "EPISÓDIO 9.MOV" -Saturacao 1.45 -Contraste 1.08
```

Se ficar exagerado, refaça com `-Saturacao 1.15`. O original continua intacto,
então dá pra testar quantas vezes quiser.

---

## O que o script faz por baixo

1. **Detecta HDR** (`smpte2084` / `arib-std-b67` / `bt2020`) e aplica *tonemap* para SDR bt709.
   Gravação de iPhone é HDR — quando reencodada sem tonemap, fica lavada e cinza.
   Essa é a causa nº 1 de "o vídeo perdeu a cor" depois de editar.
2. **Saturação + contraste + gamma** (`eq`) — o realce de cor pedido.
3. **Nitidez** (`unsharp`, só no luma) — o croma fica intocado, evitando cor borrada nas bordas.
4. **Encode H.264 CRF 17, preset slow** — qualidade alta, compatível com Instagram,
   WhatsApp, YouTube e Premiere.
5. **Áudio copiado sem reencode** quando já é AAC (zero perda). Senão, AAC 320k.
6. **Confere a duração de saída** contra a de entrada e avisa se divergir — a garantia
   de que nada foi cortado.

---

## Observação honesta sobre "melhorar a qualidade"

Nenhum processamento inventa detalhe que não foi gravado. O que dá pra fazer
de verdade — e é o que o script faz:

- corrigir o HDR lavado (ganho grande e visível);
- realçar cor e contraste;
- dar micro-nitidez;
- **não perder qualidade no reencode** (CRF 17 é o ponto onde a perda deixa de ser visível).

Vídeo tremido, desfocado ou com pouca luz não se resolve aqui — se resolve na gravação.

---

## Alternativa manual (CapCut / Premiere)

Se preferir ajustar na mão, os valores equivalentes:

| Ajuste       | CapCut  | Premiere (Lumetri) |
|---|---|---|
| Saturação    | +25 a +30 | Saturation 125–130 |
| Contraste    | +5 a +8   | Contrast +5 |
| Nitidez      | +15       | Sharpen 15–20 |
| Exportar     | 1080p / 4K, 50–60 Mbps | H.264, VBR 2 pass, alvo 50 Mbps |

No CapCut, desative "reduzir tamanho do arquivo" na exportação — é o que
achata a qualidade.
