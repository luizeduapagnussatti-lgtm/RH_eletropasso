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
  [string]$LogDir = '',
  [string]$MinDate = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# $PSScriptRoot is empty in param() defaults when launched via Start-Process -File.
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$repoRoot = [IO.Path]::GetFullPath((Join-Path $scriptDir '..'))
if (-not $LogDir) {
  $LogDir = Join-Path $scriptDir 'watchcomm-poller\logs'
}
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
  Write-Log ("drain start limit={0} minDate={1} repo={2}" -f $Limit, $(if ($MinDate) { $MinDate } else { '-' }), $repoRoot)
  $node = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { $node = 'node.exe' }
  $viteNode = Join-Path $repoRoot 'node_modules\vite-node\dist\cli.mjs'
  $npxCmd = Join-Path $env:ProgramFiles 'nodejs\npx.cmd'
  $argList = @()
  $file = $node
  if (Test-Path -LiteralPath $viteNode) {
    $argList = @($viteNode, 'scripts/process-recalc-queue.mjs', "--limit=$Limit")
  } elseif (Test-Path -LiteralPath $npxCmd) {
    # npx.ps1 prompts and hangs under Task Scheduler; always use npx.cmd --yes.
    $file = $npxCmd
    $argList = @('--yes', 'vite-node', 'scripts/process-recalc-queue.mjs', "--limit=$Limit")
  } else {
    throw 'node/npx nao encontrado'
  }
  if ($MinDate) { $argList += "--min-date=$MinDate" }
  # vite-node inlines VITE_* from .env (https://api-rh.eletropasso.local).
  # Node rejects that self-signed cert → TypeError: fetch failed. Talk to Kong HTTP.
  $env:VITE_SUPABASE_URL = 'http://127.0.0.1:54321'
  Push-Location $repoRoot
  try {
    # Stream lines. Continue on native stderr so a stack trace does not abort the drain.
    $exitCode = 0
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $file @argList 2>&1 | ForEach-Object { Write-Log ([string]$_) }
    $ErrorActionPreference = $prevEap
    if ($null -ne $LASTEXITCODE) { $exitCode = [int]$LASTEXITCODE }
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    Write-Log ("drain FAIL: process-recalc-queue exit={0}" -f $exitCode)
    exit $exitCode
  }
  Write-Log 'drain done'
  exit 0
} catch {
  Write-Log ("drain FAIL: {0}" -f $_.Exception.Message)
  exit 1
}
