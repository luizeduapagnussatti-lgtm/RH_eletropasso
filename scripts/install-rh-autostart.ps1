# Registra tarefa do Windows para subir RH Eletropasso ~5 min após reinício.
# Executar como Administrador:
#   powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\RH_eletropasso\scripts\install-rh-autostart.ps1
#
# Watchdogs usam Run-HiddenPs1.vbs (wscript) para NÃO piscar janela de PowerShell.

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$RepoScripts = 'C:\xampp\htdocs\RH_eletropasso\scripts'
$DeployScripts = 'E:\RH_eletropasso\scripts'
$TaskName = 'RH_Eletropasso_AutoStart'
$WatchdogTaskName = 'RH_Eletropasso_DmprepSync_Watchdog'
$FrontendWatchdogTaskName = 'RH_Eletropasso_Frontend_Watchdog'
$NpmUpstreamTaskName = 'RH_Eletropasso_NpmUpstream_Watchdog'
$ApiHealthTaskName = 'RH_Eletropasso_SupabaseApi_Watchdog'

New-Item -ItemType Directory -Force -Path $DeployScripts | Out-Null
$toCopy = @(
  'start-rh.ps1', 'start-rh-delayed.ps1', 'run-dmprep-sync.ps1',
  'Ensure-DmprepSync.ps1', 'Ensure-Frontend.ps1', 'Watch-Frontend.ps1',
  'Run-WatchFrontend.vbs', 'Run-HiddenPs1.vbs',
  'Ensure-NpmRhUpstream.ps1', 'Ensure-SupabaseApi.ps1', 'fix-npm-rh-ipv4.py',
  'Apply-SilentWatchdogs.ps1'
)
foreach ($f in $toCopy) {
  $src = Join-Path $RepoScripts $f
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination (Join-Path $DeployScripts $f) -Force
  }
}

$vbs = Join-Path $DeployScripts 'Run-HiddenPs1.vbs'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
$DelayedScript = Join-Path $DeployScripts 'start-rh-delayed.ps1'

$RunAsUser = $env:USERNAME
if ($RunAsUser -match '^\s*$') { $RunAsUser = 'Servidor_Eletropasso' }

$Principal = New-ScheduledTaskPrincipal `
  -UserId $RunAsUser `
  -LogonType Interactive `
  -RunLevel Limited

function New-SilentPs1Action([string]$Ps1Path, [string]$ExtraArgs = '') {
  $arg = '//nologo "{0}" "{1}"' -f $vbs, $Ps1Path
  if ($ExtraArgs) { $arg = "$arg $ExtraArgs" }
  return (New-ScheduledTaskAction -Execute $wscript -Argument $arg)
}

# AtStartup + 5 min — via VBS (sem flash)
$Action = New-SilentPs1Action $DelayedScript
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Trigger.Delay = 'PT5M'
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew `
  -Hidden

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Force | Out-Null

Write-Host "Tarefa registrada: $TaskName (silenciosa)"
Write-Host "Disparo: ao iniciar o Windows + 5 min de atraso"
Write-Host "Script: $DelayedScript -> start-rh.ps1"
Write-Host "Logs: E:\RH_eletropasso\logs\"
Write-Host ""

$WatchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
  -MultipleInstances IgnoreNew `
  -Hidden

$Every5 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
  -RepetitionInterval (New-TimeSpan -Minutes 5) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

# dmprep
Register-ScheduledTask `
  -TaskName $WatchdogTaskName `
  -Action (New-SilentPs1Action (Join-Path $DeployScripts 'Ensure-DmprepSync.ps1')) `
  -Trigger $Every5 `
  -Settings $WatchdogSettings `
  -Principal $Principal `
  -Force | Out-Null
Write-Host "Tarefa registrada: $WatchdogTaskName (a cada 5 min, silenciosa)"

# Frontend backup a cada 5 min (supervisor contínuo cobre ~30s)
Register-ScheduledTask `
  -TaskName $FrontendWatchdogTaskName `
  -Action (New-SilentPs1Action (Join-Path $DeployScripts 'Ensure-Frontend.ps1') '-Mode preview') `
  -Trigger $Every5 `
  -Settings $WatchdogSettings `
  -Principal $Principal `
  -Force | Out-Null
Write-Host "Tarefa registrada: $FrontendWatchdogTaskName (a cada 5 min, silenciosa)"

# NPM IPv4
Register-ScheduledTask `
  -TaskName $NpmUpstreamTaskName `
  -Action (New-SilentPs1Action (Join-Path $DeployScripts 'Ensure-NpmRhUpstream.ps1')) `
  -Trigger $Every5 `
  -Settings $WatchdogSettings `
  -Principal $Principal `
  -Force | Out-Null
Write-Host "Tarefa registrada: $NpmUpstreamTaskName (a cada 5 min, silenciosa)"

# API/banco
Register-ScheduledTask `
  -TaskName $ApiHealthTaskName `
  -Action (New-SilentPs1Action (Join-Path $DeployScripts 'Ensure-SupabaseApi.ps1')) `
  -Trigger $Every5 `
  -Settings $WatchdogSettings `
  -Principal $Principal `
  -Force | Out-Null
Write-Host "Tarefa registrada: $ApiHealthTaskName (a cada 5 min, silenciosa)"
Write-Host ""
Write-Host "Atalho: Apply-SilentWatchdogs.ps1 (reaplica sem reinstalação completa)"
Write-Host "Teste: wscript.exe //nologo `"$vbs`" `"$(Join-Path $DeployScripts 'Ensure-Frontend.ps1')`" -Mode preview"
