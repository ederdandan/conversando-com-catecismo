# Salva a área de transferência (JSON copiado do NotebookLM) como data/fonte-<secao>/loteNN.json,
# só se for mesmo um array JSON; depois valida a seção.
# Uso: powershell -File scripts/salvar-lote.ps1 -Secao s2 -Lote 2
param([string]$Secao = 's2', [int]$Lote)
$t = Get-Clipboard -Raw
if (-not $t) { Write-Output 'ERRO: área de transferência vazia'; exit 1 }
$t = ($t -replace '^\s*```json\s*', '' -replace '```\s*$', '').Trim()
if (-not $t.StartsWith('[') -or -not $t.EndsWith(']')) { Write-Output "ERRO: não parece JSON: $($t.Substring(0, [Math]::Min(60, $t.Length)))"; exit 1 }
try { $n = ($t | ConvertFrom-Json).Count } catch { Write-Output "ERRO: JSON inválido: $($_.Exception.Message)"; exit 1 }
$raiz = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $raiz "data/fonte-$Secao"
$arq = Join-Path $dir ("lote{0:D2}.json" -f $Lote)
# A área de transferência ainda com um lote anterior (a cópia não aconteceu): recusa.
foreach ($f in Get-ChildItem $dir -Filter 'lote*.json') {
  if ($f.FullName -ne $arq -and ([IO.File]::ReadAllText($f.FullName)).Trim() -eq $t) { Write-Output "ERRO: igual a $($f.Name) (a cópia não aconteceu)"; exit 1 }
}
[IO.File]::WriteAllText($arq, $t, [Text.UTF8Encoding]::new($false))
Write-Output ("salvo lote{0:D2}.json com {1} itens" -f $Lote, $n)
