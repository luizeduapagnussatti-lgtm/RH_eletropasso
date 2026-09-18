#Requires -Version 5.1
<#
.SYNOPSIS
  Instala Task Scheduler do watchdog de coleta WatchComm (1x por semana).

.DESCRIPTION
  Verifica se a ultima coleta passou de MaxAgeHours (padrao 8 dias).
  Se estiver stale, dispara uma coleta manual. Cadencia alinhada a coleta
  semanal — nao roda a cada poucas horas.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'RH_Eletropasso_ClockCollect_Watchdog',
  [string]$ScriptPath = '',
  [DayOfWeek]$DayOfWeek = [DayOfWeek]::Monday,
  [int]$ScheduleHour = 10,
  [double]$MaxAgeHours = 192
)

$ErrorActionPreference = 'Stop'
if (-not $ScriptPath) {
  $ScriptPath = Join-Path $PSScriptRoot 'Ensure-ClockCollect.ps1'
}
if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "Script nao encontrado: $ScriptPath"
}

$existingUser = $env:USERNAME
$existingLogon = 'Interactive'
try {
  $prev = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($prev -and $prev.Principal.UserId) {
    $existingUser = $prev.Principal.UserId
    if ($prev.Principal.LogonType) { $existingLogon = [string]$prev.Principal.LogonType }
  }
} catch {}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$vbs = Join-Path $PSScriptRoot 'Run-HiddenPs1.vbs'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
# Pass MaxAgeHours so weekly cadence does not treat "1 day since last collect" as failure.
$scriptArgs = '"{0}" -MaxAgeHours {1}' -f $ScriptPath, $MaxAgeHours
if (Test-Path -LiteralPath $vbs) {
  $action = New-ScheduledTaskAction -Execute $wscript -Argument ('//nologo "{0}" {1}' -f $vbs, $scriptArgs)
} else {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File {0}' -f $scriptArgs)
}

$at = Get-Date -Hour $ScheduleHour -Minute 0 -Second 0
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $at

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 45) `
  -MultipleInstances IgnoreNew `
  -Hidden

$principal = New-ScheduledTaskPrincipal -UserId $existingUser -LogonType $existingLogon -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Write-Host ("Tarefa registrada: {0} (semanal {1} {2:D2}:00, MaxAgeHours={3})" -f $TaskName, $DayOfWeek, $ScheduleHour, $MaxAgeHours)
Write-Host "Script: $ScriptPath"
