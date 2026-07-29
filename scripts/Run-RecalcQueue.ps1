#Requires -Version 5.1
<#
.SYNOPSIS
  Drena a fila timesheet_recalc_queue (recalcula dias com batidas recém-chegadas).
  Fecha o ciclo ingest-punches -> recálculo. Idempotente e barato quando vazia.

.DESCRIPTION
  Wrapper de scripts/process-recalc-queue.mjs. Pensado para Task Scheduler
  (ex.: a cada 10 min) e para chamada best-effort após a coleta do relógio.
#>
[CmdletBinding()]
param(
  [int]$Limit = 500,
  [string]$LogDir = (Join-Path $PSScriptRoot 'watchcomm-poller\logs')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not (Test-Path -LiteralPath $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}
$logFile = Join-Path $LogDir ("recalc-queue-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Write-Host $line
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

try {
  Write-Log ("drain start limit={0} repo={1}" -f $Limit, $repoRoot)
  Push-Location $repoRoot
  try {
    $output = & npx vite-node scripts/process-recalc-queue.mjs "--limit=$Limit" 2>&1
  } finally {
    Pop-Location
  }
  foreach ($line in @($output)) { Write-Log ([string]$line) }
  Write-Log 'drain done'
  exit 0
} catch {
  Write-Log ("drain FAIL: {0}" -f $_.Exception.Message)
  exit 1
}
