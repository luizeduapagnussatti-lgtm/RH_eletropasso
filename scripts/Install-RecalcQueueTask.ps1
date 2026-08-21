#Requires -Version 5.1
<#
.SYNOPSIS
  OPCIONAL. Em produção o recálculo roda no fim de cada coleta WatchComm
  (Coletar batidas + segunda 09:00). Não instale esta tarefa no dia a dia.

  Fallback: drena timesheet_recalc_queue a cada N minutos se a coleta
  não puder esperar o drain.

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

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument ("-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"{0}`"" -f $runner)

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$principal = New-ScheduledTaskPrincipal `
  -UserId $existingUser `
  -LogonType $existingLogon `
  -RunLevel $existingRunLevel

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

Write-Host ("Tarefa '{0}' registrada: a cada {1} min -> {2}" -f $TaskName, $IntervalMinutes, $runner)
