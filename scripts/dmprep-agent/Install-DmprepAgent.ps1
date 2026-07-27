#Requires -Version 5.1
param(
  [string]$InstallRoot = 'C:\RH_eletropasso\dmprep-agent',
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw 'Execute como Administrador (clique direito no INSTALAR.bat).'
}

if (-not (Test-Path -LiteralPath $SourceDir)) {
  throw "Pasta origem nao encontrada: $SourceDir"
}

Write-Host "Instalando DMPREP agent em $InstallRoot ..."
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $InstallRoot 'logs') -Force | Out-Null

$sourceNorm = [System.IO.Path]::GetFullPath($SourceDir).TrimEnd('\')
$installNorm = [System.IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
$sameFolder = ($sourceNorm -ieq $installNorm)

$files = @(
  'Sync-DmprepPunches.ps1',
  'Run-DmprepAgent.vbs',
  'config.json',
  'config.example.json'
)
if (-not $sameFolder) {
  foreach ($name in $files) {
    $src = Join-Path $SourceDir $name
    if (Test-Path -LiteralPath $src) {
      Copy-Item -LiteralPath $src -Destination (Join-Path $InstallRoot $name) -Force
    }
  }
} else {
  Write-Host 'Arquivos ja estao na pasta de instalacao; pulando copia.'
}

$configPath = Join-Path $InstallRoot 'config.json'
if (-not (Test-Path -LiteralPath $configPath)) {
  $example = Join-Path $InstallRoot 'config.example.json'
  if (-not (Test-Path -LiteralPath $example)) {
    $example = Join-Path $SourceDir 'config.example.json'
  }
  Copy-Item -LiteralPath $example -Destination $configPath -Force
  Write-Warning "Edite $configPath e defina ingestApiKey e syncApiKey."
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$statePath = $config.statePath
$state = @{
  movimentRecordCount       = 0
  movimentFileSize          = 0
  movimentLastModifiedTicks = 0
  mdbWatermark              = (Get-Date).Date.AddDays(-1 * [int]$config.lookbackDays).ToString('o')
  lastSuccessAt             = $null
  lastInserted              = 0
}
if (Test-Path -LiteralPath $config.movimentPath) {
  $item = Get-Item -LiteralPath $config.movimentPath
  $lines = (Get-Content -LiteralPath $config.movimentPath -Encoding Default | Measure-Object -Line).Lines
  $state.movimentRecordCount = $lines
  $state.movimentFileSize = $item.Length
  $state.movimentLastModifiedTicks = $item.LastWriteTimeUtc.Ticks
  Write-Host "Estado inicial MOVIMENT cursor=$lines linhas."
}
$stateDir = Split-Path -Parent $statePath
if (-not (Test-Path -LiteralPath $stateDir)) {
  New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
}
($state | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $statePath -Encoding UTF8

$vbs = Join-Path $InstallRoot 'Run-DmprepAgent.vbs'
$action = "wscript.exe `"$vbs`""

$tasks = @(
  @{ Name = 'RH_DmprepAgent_1200'; Time = '12:00' }
  @{ Name = 'RH_DmprepAgent_1800'; Time = '18:00' }
)

foreach ($t in $tasks) {
  $existing = Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false
  }

  $trigger = New-ScheduledTaskTrigger -Daily -At $t.Time
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $t.Name -Action (New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"") -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host ("Tarefa criada: {0} diariamente as {1} (SYSTEM, oculto)." -f $t.Name, $t.Time)
}

Write-Host ''
Write-Host 'Instalacao concluida.'
Write-Host ("Teste: wscript.exe `"{0}`"" -f $vbs)
Write-Host ("Logs: {0}" -f $config.logDir)
