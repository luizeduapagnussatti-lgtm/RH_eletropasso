# Registra tarefa do Windows para subir RH Eletropasso ~5 min após reinício.
# Executar como Administrador:
#   powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\RH_eletropasso\scripts\install-rh-autostart.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$RepoScripts = 'C:\xampp\htdocs\RH_eletropasso\scripts'
$DeployScripts = 'E:\RH_eletropasso\scripts'
$TaskName = 'RH_Eletropasso_AutoStart'

New-Item -ItemType Directory -Force -Path $DeployScripts | Out-Null
Copy-Item -Path (Join-Path $RepoScripts 'start-rh.ps1') -Destination (Join-Path $DeployScripts 'start-rh.ps1') -Force
Copy-Item -Path (Join-Path $RepoScripts 'start-rh-delayed.ps1') -Destination (Join-Path $DeployScripts 'start-rh-delayed.ps1') -Force

$DelayedScript = Join-Path $DeployScripts 'start-rh-delayed.ps1'
$Action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$DelayedScript`""

# AtStartup + 5 min (PT5M) — total ~5 min após boot antes de start-rh.ps1
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Trigger.Delay = 'PT5M'

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

# Conta que roda o Docker Desktop neste servidor
$RunAsUser = $env:USERNAME
if ($RunAsUser -match '^\s*$') { $RunAsUser = 'Servidor_Eletropasso' }

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -User $RunAsUser `
  -RunLevel Highest `
  -Force | Out-Null

Write-Host "Tarefa registrada: $TaskName"
Write-Host "Disparo: ao iniciar o Windows + 5 min de atraso"
Write-Host "Script: $DelayedScript -> start-rh.ps1"
Write-Host "Logs: E:\RH_eletropasso\logs\"
Write-Host ""
Write-Host "Testar agora (manual):"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$DelayedScript`""
