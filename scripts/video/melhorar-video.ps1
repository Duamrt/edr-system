# melhorar-video.ps1 — EDR Engenharia
# Melhora qualidade e saturacao de video SEM CORTAR NADA.
# Mantem duracao integral, audio original e metadados de data.
#
# Uso:
#   .\melhorar-video.ps1 "C:\Users\voce\Downloads\EPISODIO 9.MOV"
#   .\melhorar-video.ps1 video1.MOV video2.MOV -Saturacao 1.4
#
# Requer ffmpeg no PATH:  winget install Gyan.FFmpeg

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arquivos,

  # 1.00 = original | 1.28 = padrao EDR | 1.45 = forte (cuidado com pele)
  [double]$Saturacao = 1.28,
  [double]$Contraste = 1.05,
  # Nitidez: 0 = nenhuma | 0.7 = padrao | 1.2 = agressiva
  [double]$Nitidez   = 0.7,
  # CRF: menor = melhor qualidade e arquivo maior. 17 e praticamente sem perda visivel.
  [int]$Crf          = 17,
  [ValidateSet('ultrafast','veryfast','faster','fast','medium','slow','slower','veryslow')]
  [string]$Preset    = 'slow',
  [string]$Sufixo    = '_MELHORADO'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-Comando($nome) {
  return [bool](Get-Command $nome -ErrorAction SilentlyContinue)
}

if (-not (Test-Comando 'ffmpeg') -or -not (Test-Comando 'ffprobe')) {
  Write-Host ''
  Write-Host '  ffmpeg nao encontrado no PATH.' -ForegroundColor Red
  Write-Host '  Instale com:  winget install Gyan.FFmpeg' -ForegroundColor Yellow
  Write-Host '  Depois feche e reabra o terminal.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

if (-not $Arquivos -or $Arquivos.Count -eq 0) {
  Write-Host ''
  Write-Host '  Nenhum arquivo informado.' -ForegroundColor Red
  Write-Host '  Arraste os videos para cima de melhorar-video.bat' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

function Get-InfoVideo($caminho) {
  # ffmpeg/ffprobe nao suportam "--" como fim-de-opcoes: usar sempre -i
  $v = & ffprobe -v error -select_streams v:0 `
        -show_entries stream=width,height,color_transfer,color_primaries `
        -of default=nw=1 -i "$caminho" 2>$null
  $a = & ffprobe -v error -select_streams a:0 `
        -show_entries stream=codec_name `
        -of default=nw=1:nk=1 -i "$caminho" 2>$null
  $dur = & ffprobe -v error -show_entries format=duration `
        -of default=nw=1:nk=1 -i "$caminho" 2>$null

  $durTexto = ($dur | Select-Object -First 1)
  $durValor = 0.0
  if ($durTexto -and $durTexto -ne 'N/A') { $durValor = [double]$durTexto }

  $info = @{
    width = ''; height = ''; transfer = ''; primaries = ''
    audio = ($a | Select-Object -First 1); duracao = $durValor
  }
  foreach ($linha in $v) {
    switch -Regex ($linha) {
      '^width=(.+)$'           { $info.width     = $Matches[1] }
      '^height=(.+)$'          { $info.height    = $Matches[1] }
      '^color_transfer=(.+)$'  { $info.transfer  = $Matches[1] }
      '^color_primaries=(.+)$' { $info.primaries = $Matches[1] }
    }
  }
  return $info
}

# Cadeia de tonemap: converte HDR (iPhone Dolby Vision / HLG) para SDR bt709.
# Sem isso o video re-encodado fica lavado, cinza e sem cor — a causa mais comum
# de "perdeu a saturacao" ao editar gravacao de iPhone.
$FILTRO_HDR = 'zscale=transfer=linear:npl=100,format=gbrpf32le,zscale=primaries=bt709,tonemap=tonemap=hable:desat=0,zscale=transfer=bt709:matrix=bt709:range=tv,format=yuv420p'

$total = $Arquivos.Count
$indice = 0
$erros = @()

foreach ($arquivo in $Arquivos) {
  $indice++

  if (-not (Test-Path -LiteralPath $arquivo)) {
    Write-Host "  [$indice/$total] Nao encontrado: $arquivo" -ForegroundColor Red
    $erros += $arquivo
    continue
  }

  $item   = Get-Item -LiteralPath $arquivo
  $saida  = Join-Path $item.DirectoryName ($item.BaseName + $Sufixo + '.mp4')
  $info   = Get-InfoVideo $item.FullName

  $ehHdr = ($info.transfer -match 'smpte2084|arib-std-b67') -or ($info.primaries -match 'bt2020')

  Write-Host ''
  Write-Host "  [$indice/$total] $($item.Name)" -ForegroundColor Cyan
  Write-Host ("           {0}x{1} | {2:N0}s | {3}" -f $info.width, $info.height, $info.duracao, $(if ($ehHdr) { 'HDR -> tonemap para SDR' } else { 'SDR' })) -ForegroundColor DarkGray
  Write-Host ("           saturacao {0} | contraste {1} | nitidez {2} | crf {3}" -f $Saturacao, $Contraste, $Nitidez, $Crf) -ForegroundColor DarkGray

  # Monta a cadeia de filtros
  $filtros = @()
  if ($ehHdr) { $filtros += $FILTRO_HDR }
  $filtros += ('eq=saturation={0}:contrast={1}:gamma=1.02' -f `
                $Saturacao.ToString([cultureinfo]::InvariantCulture), `
                $Contraste.ToString([cultureinfo]::InvariantCulture))
  if ($Nitidez -gt 0) {
    $filtros += ('unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount={0}:chroma_amount=0' -f `
                  $Nitidez.ToString([cultureinfo]::InvariantCulture))
  }
  $filtros += 'format=yuv420p'
  $vf = $filtros -join ','

  # Audio: copia se ja for AAC (zero perda), senao reencoda em alta taxa
  $argsAudio = if ($info.audio -eq 'aac') { @('-c:a','copy') } else { @('-c:a','aac','-b:a','320k') }

  # O arquivo de saida tem de ser o ULTIMO argumento — qualquer opcao depois
  # dele seria aplicada a um proximo output, nao a este.
  $argsFfmpeg = @(
    '-hide_banner', '-loglevel', 'error', '-stats',
    '-i', $item.FullName,
    '-map', '0:v:0', '-map', '0:a?',
    '-vf', $vf,
    '-c:v', 'libx264', '-preset', $Preset, '-crf', "$Crf",
    '-profile:v', 'high',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-map_metadata', '0',
    '-movflags', '+faststart'
  ) + $argsAudio + @('-y', $saida)

  & ffmpeg @argsFfmpeg

  if ($LASTEXITCODE -ne 0) {
    Write-Host "           FALHOU" -ForegroundColor Red
    $erros += $item.Name
    continue
  }

  # Confere que a duracao bateu — garantia de que nada foi cortado
  $durSaida = [double](& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 -i "$saida")
  $delta = [math]::Abs($durSaida - $info.duracao)
  $tamanho = (Get-Item -LiteralPath $saida).Length / 1MB

  Write-Host ("           OK -> {0}  ({1:N0} MB)" -f (Split-Path $saida -Leaf), $tamanho) -ForegroundColor Green
  if ($delta -gt 0.5) {
    Write-Host ("           ATENCAO: duracao mudou {0:N2}s (original {1:N2}s / saida {2:N2}s)" -f $delta, $info.duracao, $durSaida) -ForegroundColor Yellow
  } else {
    Write-Host ("           duracao integral preservada ({0:N2}s)" -f $durSaida) -ForegroundColor DarkGray
  }
}

Write-Host ''
if ($erros.Count -gt 0) {
  Write-Host ("  Concluido com {0} erro(s): {1}" -f $erros.Count, ($erros -join ', ')) -ForegroundColor Yellow
  exit 1
}
Write-Host '  Todos os videos processados.' -ForegroundColor Green
Write-Host ''
