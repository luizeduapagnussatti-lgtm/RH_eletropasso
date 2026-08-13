#Requires -Version 5.1
<#
.SYNOPSIS
  Instala Task Scheduler do poller WatchComm no host .245.

.DESCRIPTION
  Padrao: coleta automatica 1x por semana, segunda-feira as 09:00 (horario local).
  Coleta manual em Comunicacao com o relogio permanece disponivel a qualquer momento.

  Alternativas:
    -DaysOfWeek Tuesday -ScheduleHour 8
    -ScheduleHours 9,15,19   (legado diario)
    -IntervalHours 1         (legado horario)

  O watchdog dmprep-sync (cada 5 min) e independente — so garante o servico :3099.
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'OpenHR-WatchComm-Poller',
  [string]$ConfigPath = '',
  [DayOfWeek]$DayOfWeek = [DayOfWeek]::Monday,
  [int]$ScheduleHour = 9,
  # Legacy daily times (local). When set, overrides weekly default.
  [int[]]$ScheduleHours = @(),
  [int]$IntervalHours = 0,
  [switch]$Bootstrap
)

$ErrorActionPreference = 'Stop'

if (-not $ConfigPath) {
  $ConfigPath = Join-Path $PSScriptRoot 'config.json'
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  $example = Join-Path $PSScriptRoot 'config.example.json'
  if (-not (Test-Path -LiteralPath $example)) { throw "Falta $example" }
  Copy-Item -LiteralPath $example -Destination $ConfigPath
  Write-Host "Criado $ConfigPath - edite ingestApiKey antes de uso em producao."
  $Bootstrap = $true
}

$cmd = Join-Path $PSScriptRoot 'Run-Poller.cmd'
if (-not (Test-Path -LiteralPath $cmd)) { throw "Run-Poller.cmd nao encontrado: $cmd" }

$useHourly = $IntervalHours -ge 1
$useDaily = -not $useHourly -and $ScheduleHours -and $ScheduleHours.Count -gt 0

if ($useHourly) {
  # ok
} elseif ($useDaily) {
  foreach ($h in $ScheduleHours) {
    if ($h -lt 0 -or $h -gt 23) { throw "ScheduleHours invalido: $h (0-23)" }
  }
} else {
  if ($ScheduleHour -lt 0 -or $ScheduleHour -gt 23) {
    throw "ScheduleHour invalido: $ScheduleHour (0-23)"
  }
}

# Preserve existing principal when reinstalling
$existingUser = $env:USERNAME
$existingLogon = 'Interactive'
$existingRunLevel = 'Limited'
try {
  $prev = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($prev -and $prev.Principal.UserId) {
    $existingUser = $prev.Principal.UserId
    if ($prev.Principal.LogonType) { $existingLogon = [string]$prev.Principal.LogonType }
    if ($prev.Principal.RunLevel -eq 'Highest') { $existingRunLevel = 'Highest' }
  }
} catch {}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $cmd
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

$principal = New-ScheduledTaskPrincipal `
  -UserId $existingUser `
  -LogonType $existingLogon `
  -RunLevel $existingRunLevel

if ($useHourly) {
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(5) `
    -RepetitionInterval (New-TimeSpan -Hours $IntervalHours) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null
  Write-Host ("Task '$TaskName' instalada (a cada {0} h)." -f $IntervalHours)
} elseif ($useDaily) {
  $triggers = foreach ($h in ($ScheduleHours | Sort-Object -Unique)) {
    $at = Get-Date -Hour $h -Minute 0 -Second 0
    New-ScheduledTaskTrigger -Daily -At $at
  }
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null
  $label = ($ScheduleHours | Sort-Object -Unique | ForEach-Object { '{0:D2}:00' -f $_ }) -join ', '
  Write-Host ("Task '$TaskName' instalada (diaria: {0})." -f $label)
} else {
  $at = Get-Date -Hour $ScheduleHour -Minute 0 -Second 0
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $at
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Force | Out-Null
  Write-Host ("Task '{0}' instalada (semanal: {1} {2:D2}:00)." -f $TaskName, $DayOfWeek, $ScheduleHour)
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
Write-Host 'Coleta manual continua disponivel em Comunicacao com o relogio.'
