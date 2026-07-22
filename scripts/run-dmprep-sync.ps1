# Carrega variaveis do .env e inicia dmprep-sync (processo independente do Cursor).
param(
  [string]$EnvFile = 'E:\RH_eletropasso\config\dmprep-sync.env',
  [string]$ProjectDir = 'C:\xampp\htdocs\RH_eletropasso\services\dmprep-sync'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
  Write-Error "Env file not found: $EnvFile"
  exit 1
}

Get-Content -LiteralPath $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  if ($line -match '^([^=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim()
    Set-Item -Path "Env:$name" -Value $value
  }
}

Set-Location -LiteralPath $ProjectDir
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node dist/src/server.js
