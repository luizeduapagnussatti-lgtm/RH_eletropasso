#Requires -Version 5.1
<#
.SYNOPSIS
  Instala Task Scheduler do poller WatchComm no host .245 (padrao: a cada 1 hora).
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'OpenHR-WatchComm-Poller',
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [int]$IntervalHours = 1,
  [switch]$Bootstrap
)

$ErrorActionPreference = 'Stop'

if ($IntervalHours -lt 1) { throw 'IntervalHours deve ser >= 1' }

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  $example = Join-Path $PSScriptRoot 'config.example.json'
  if (-not (Test-Path -LiteralPath $example)) { throw "Falta $example" }
  Copy-Item -LiteralPath $example -Destination $ConfigPath
  Write-Host "Criado $ConfigPath - edite ingestApiKey antes de uso em producao."
  $Bootstrap = $true
}

$cmd = Join-Path $PSScriptRoot 'Run-Poller.cmd'
if (-not (Test-Path -LiteralPath $cmd)) { throw "Run-Poller.cmd nao encontrado: $cmd" }

$ErrorActionPreference = 'Continue'
schtasks /Delete /TN $TaskName /F 2>$null | Out-Null

# TR curto via .cmd evita truncamento do schtasks e paths com espacos
$tr = "`"$cmd`""
$createOut = schtasks /Create /TN $TaskName /TR $tr /SC HOURLY /MO $IntervalHours /F 2>&1
$createCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
Write-Host ($createOut | Out-String)

if ($createCode -ne 0) {
  Write-Host "AVISO: schtasks create falhou (exit=$createCode). Execute como Administrador."
} else {
  Write-Host ("Task '$TaskName' instalada (a cada {0} h)." -f $IntervalHours)
}

if ($Bootstrap) {
  $x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  $runner = Join-Path $PSScriptRoot 'Run-WatchCommPoller.ps1'
  Write-Host 'Executando bootstrap (watermark NSR)...'
  & $x86 -NoProfile -ExecutionPolicy Bypass -File $runner -ConfigPath $ConfigPath -Bootstrap
  Write-Host ("Bootstrap exit={0}" -f $LASTEXITCODE)
}

Write-Host "Config: $ConfigPath"
Write-Host 'Logs: E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller'
