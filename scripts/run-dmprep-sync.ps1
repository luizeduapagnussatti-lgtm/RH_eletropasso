# Carrega variaveis do .env e inicia dmprep-sync com reinicio automatico.
# Se o Node cair, sobe de novo apos alguns segundos.
param(
  [string]$EnvFile = 'E:\RH_eletropasso\config\dmprep-sync.env',
  [string]$ProjectDir = 'C:\xampp\htdocs\RH_eletropasso\services\dmprep-sync',
  [int]$RestartDelaySec = 5
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\dmprep-sync'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("runner-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-RunnerLog([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  Write-RunnerLog "Env file not found: $EnvFile"
  exit 1
}

function Import-DmprepEnv {
  Get-Content -LiteralPath $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) { return }
    if ($line -match '^([^=]+)=(.*)$') {
      $name = $matches[1].Trim()
      $value = $matches[2].Trim()
      Set-Item -Path "Env:$name" -Value $value
    }
  }
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
Set-Location -LiteralPath $ProjectDir

$distEntry = Join-Path $ProjectDir 'dist\src\server.js'
if (-not (Test-Path -LiteralPath $distEntry)) {
  Write-RunnerLog 'dist/src/server.js missing - running npm run build'
  npm run build
}

Write-RunnerLog "Starting dmprep-sync supervisor (node=$node, dir=$ProjectDir)"

while ($true) {
  try {
    Import-DmprepEnv
    Write-RunnerLog 'Launching node dist/src/server.js'
    & $node 'dist/src/server.js'
    $code = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
    Write-RunnerLog "dmprep-sync exited with code $code - restarting in ${RestartDelaySec}s"
  } catch {
    $err = $_.Exception.Message
    Write-RunnerLog "dmprep-sync crashed: $err - restarting in ${RestartDelaySec}s"
  }
  Start-Sleep -Seconds $RestartDelaySec
}
