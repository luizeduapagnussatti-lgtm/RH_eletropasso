#Requires -Version 5.1
<#
.SYNOPSIS
  Agenda Cleanup-WatchCommLogs no domingo 10:30 (apos Cursor-Limpeza-Semanal 10:00).
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'OpenHR-WatchComm-LogCleanup',
  [string]$ScriptPath = '',
  [DayOfWeek]$DayOfWeek = [DayOfWeek]::Sunday,
  [int]$ScheduleHour = 10,
  [int]$ScheduleMinute = 30,
  [switch]$RemoveTask
)

$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) {
  $ScriptPath = Join-Path $PSScriptRoot 'Cleanup-WatchCommLogs.ps1'
}
if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "Missing $ScriptPath"
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

if ($RemoveTask) {
  Write-Host "Task '$TaskName' removida."
  exit 0
}

$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" -Silent"
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
$at = Get-Date -Hour $ScheduleHour -Minute $ScheduleMinute -Second 0
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $at
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -Hidden

$existingUser = $env:USERNAME
$existingLogon = 'Interactive'
try {
  $prev = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($prev -and $prev.Principal.UserId) {
    $existingUser = $prev.Principal.UserId
    if ($prev.Principal.LogonType) { $existingLogon = [string]$prev.Principal.LogonType }
  }
} catch {}

# Prefer same account as other OpenHR tasks
try {
  $poller = Get-ScheduledTask -TaskName 'OpenHR-WatchComm-Poller' -ErrorAction SilentlyContinue
  if ($poller -and $poller.Principal.UserId) {
    $existingUser = $poller.Principal.UserId
    if ($poller.Principal.LogonType) { $existingLogon = [string]$poller.Principal.LogonType }
  }
} catch {}

$principal = New-ScheduledTaskPrincipal -UserId $existingUser -LogonType $existingLogon -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Host ("Task '{0}' registrada (semanal {1} {2:D2}:{3:D2})." -f $TaskName, $DayOfWeek, $ScheduleHour, $ScheduleMinute)
Write-Host "Script: $ScriptPath"
