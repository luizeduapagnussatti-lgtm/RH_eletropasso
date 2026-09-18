#Requires -Version 5.1
<#
.SYNOPSIS
  Agenda Ensure-PrintPointLink na segunda 08:45 (antes da coleta 09:00).

.DESCRIPTION
  Reforca ARP estatico + TCP preflight como SYSTEM, silenciosamente,
  15 min antes de OpenHR-WatchComm-Poller (segunda 09:00).
  O Run-Poller.cmd tambem chama o preflight; esta tarefa antecipa o link
  para a sync semanal nao falhar por ARP/TCP frio.

  Use -RemoveTask para desagendar. -SkipNow pula a execucao imediata.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'OpenHR-PrintPoint-Link',
  [string]$ClockIp = '192.168.15.201',
  [int]$ClockPort = 3000,
  [string]$MacAddress = 'f8-f0-05-65-80-11',
  [DayOfWeek]$DayOfWeek = [DayOfWeek]::Monday,
  [int]$ScheduleHour = 8,
  [int]$ScheduleMinute = 45,
  [switch]$RemoveTask,
  [switch]$SkipNow
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $RepoRoot 'scripts\Ensure-PrintPointLink.ps1'
if (-not (Test-Path -LiteralPath $script)) {
  throw "Missing $script"
}

$ps = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
# -WindowStyle Hidden: tarefa agendada sem flash de console
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -ClockIp $ClockIp -ClockPort $ClockPort -MacAddress $MacAddress -TcpAttempts 4 -WarmPingCount 2"

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

if ($RemoveTask) {
  Write-Host "Task '$TaskName' removida."
  exit 0
}

$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
$at = Get-Date -Hour $ScheduleHour -Minute $ScheduleMinute -Second 0
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $at
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -Hidden
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host ("Task '{0}' registrada (semanal {1} {2:D2}:{3:D2} SYSTEM, antes da coleta 09:00)." -f $TaskName, $DayOfWeek, $ScheduleHour, $ScheduleMinute)

if (-not $SkipNow) {
  & $ps -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $script -ClockIp $ClockIp -ClockPort $ClockPort -MacAddress $MacAddress -TcpAttempts 4 -WarmPingCount 2
  exit $LASTEXITCODE
}
exit 0
