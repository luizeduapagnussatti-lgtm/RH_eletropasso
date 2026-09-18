#Requires -Version 5.1
<#
.SYNOPSIS
  Reagenda Cursor-Limpeza-Semanal (domingo 10:00) com -Silent / Hidden.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'Cursor-Limpeza-Semanal',
  [string]$ScriptPath = ''
)

$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) {
  $ScriptPath = Join-Path $env:USERPROFILE 'Documents\Cursor_Manutencao\Limpar-Cursor-Seguro.ps1'
}
if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "Missing $ScriptPath"
}

$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Mode Standard -Silent"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At (Get-Date -Hour 10 -Minute 0 -Second 0)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -Hidden

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Limpeza Standard residual Cursor (Silent) — nao afeta PrintPoint/RH' `
  -Force | Out-Null

Write-Host "Task '$TaskName' re-registrada (domingo 10:00 Silent Hidden)."
Write-Host "Script: $ScriptPath"
