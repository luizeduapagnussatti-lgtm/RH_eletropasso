#Requires -Version 5.1
<#
.SYNOPSIS
  Agenda o job semanal de alerta de batidas faltantes (segunda 06:00 local).

.DESCRIPTION
  Chama a Edge Function cron-missing-punches-alert no Supabase local.
  Requer CRON_SECRET em supabase/functions/.env (ou variável de ambiente).
#>
[CmdletBinding()]
param(
  [string]$TaskName = 'RH_Eletropasso_MissingPunchesAlert',
  [string]$FunctionsUrl = 'http://127.0.0.1:54321/functions/v1/cron-missing-punches-alert',
  [string]$EnvFile = '',
  [string]$CronSecret = ''
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) {
  $EnvFile = Join-Path $RepoRoot 'supabase\functions\.env'
}

if (-not $CronSecret -and (Test-Path -LiteralPath $EnvFile)) {
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*CRON_SECRET\s*=\s*(.+)\s*$') {
      $CronSecret = $Matches[1].Trim().Trim('"').Trim("'")
      break
    }
  }
}
$localSecretFile = Join-Path $PSScriptRoot '.cron-secret.local'
if (-not $CronSecret -and (Test-Path -LiteralPath $localSecretFile)) {
  $CronSecret = (Get-Content -LiteralPath $localSecretFile -Raw).Trim()
}
if (-not $CronSecret) {
  throw 'CRON_SECRET nao encontrado. Defina -CronSecret ou supabase/functions/.env'
}

$Runner = Join-Path $PSScriptRoot 'Invoke-MissingPunchesAlert.ps1'
@'
#Requires -Version 5.1
param(
  [string]$FunctionsUrl,
  [string]$CronSecret,
  [string]$LogDir = "E:\RH_eletropasso\logs"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$log = Join-Path $LogDir ("missing-punches-alert-{0:yyyyMMdd}.log" -f (Get-Date))
function Write-Log([string]$Msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Msg
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  Write-Host $line
}
try {
  $headers = @{
    Authorization = "Bearer $CronSecret"
    "Content-Type" = "application/json"
  }
  $resp = Invoke-RestMethod -Method Post -Uri $FunctionsUrl -Headers $headers -Body "{}" -TimeoutSec 120
  Write-Log ("OK " + ($resp | ConvertTo-Json -Compress))
  exit 0
} catch {
  Write-Log ("FAIL " + $_.Exception.Message)
  exit 1
}
'@ | Set-Content -LiteralPath $Runner -Encoding UTF8

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

$arg = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -FunctionsUrl "{1}" -CronSecret "{2}"' -f $Runner, $FunctionsUrl, $CronSecret
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 6:00am
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
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

Write-Host "Tarefa registrada: $TaskName (segunda 06:00)"
Write-Host "URL: $FunctionsUrl"
Write-Host "Runner: $Runner"
