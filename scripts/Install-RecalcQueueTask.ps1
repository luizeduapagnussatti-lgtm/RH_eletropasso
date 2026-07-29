#Requires -Version 5.1
<#
.SYNOPSIS
  Registra a tarefa agendada "RH-RecalcQueue" que drena timesheet_recalc_queue
  a cada N minutos (blindagem contra "dias presos" — batidas sem recálculo).

.EXAMPLE
  # Produção (scripts sincronizados em E:\RH_eletropasso):
  powershell -ExecutionPolicy Bypass -File .\scripts\Install-RecalcQueueTask.ps1 -RepoRoot 'E:\RH_eletropasso'
#>
[CmdletBinding()]
param(
  [string]$RepoRoot = ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))),
  [int]$IntervalMinutes = 10,
  [string]$TaskName = 'RH-RecalcQueue'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$runner = Join-Path $RepoRoot 'scripts\Run-RecalcQueue.ps1'
if (-not (Test-Path -LiteralPath $runner)) {
  throw "Run-RecalcQueue.ps1 nao encontrado em: $runner (sincronize os scripts primeiro)"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $runner)

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host ("Tarefa '{0}' registrada: a cada {1} min -> {2}" -f $TaskName, $IntervalMinutes, $runner)
