# Drena timesheet_recalc_queue (batidas do relógio → horas do espelho).
# Watchdog: a coleta WatchComm já drena ao final, mas se o login/processador falhar
# os dias ficam com horas da última batida PWA e FALTA 08:00. Este script recupera.
#
# Always drain from the live git repo (C:\xampp\...), not E:\ copy: E:\ has the
# wrapper scripts but not process-recalc-queue.mjs / node_modules.
param(
  [int]$Limit = 200
)

$ErrorActionPreference = 'Stop'
$runner = 'C:\xampp\htdocs\RH_eletropasso\scripts\Run-RecalcQueue.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
  $runner = Join-Path $PSScriptRoot 'Run-RecalcQueue.ps1'
}
if (-not (Test-Path -LiteralPath $runner)) {
  throw "Run-RecalcQueue.ps1 not found"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runner -Limit $Limit
exit $LASTEXITCODE
