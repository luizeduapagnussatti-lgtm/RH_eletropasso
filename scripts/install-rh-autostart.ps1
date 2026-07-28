# Registra tarefa do Windows para subir RH Eletropasso ~5 min após reinício.
# Executar como Administrador:
#   powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\RH_eletropasso\scripts\install-rh-autostart.ps1

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

$RepoScripts = 'C:\xampp\htdocs\RH_eletropasso\scripts'
$DeployScripts = 'E:\RH_eletropasso\scripts'
$TaskName = 'RH_Eletropasso_AutoStart'
$WatchdogTaskName = 'RH_Eletropasso_DmprepSync_Watchdog'

New-Item -ItemType Directory -Force -Path $DeployScripts | Out-Null
Copy-Item -Path (Join-Path $RepoScripts 'start-rh.ps1') -Destination (Join-Path $DeployScripts 'start-rh.ps1') -Force
Copy-Item -Path (Join-Path $RepoScripts 'start-rh-delayed.ps1') -Destination (Join-Path $DeployScripts 'start-rh-delayed.ps1') -Force
Copy-Item -Path (Join-Path $RepoScripts 'run-dmprep-sync.ps1') -Destination (Join-Path $DeployScripts 'run-dmprep-sync.ps1') -Force
Copy-Item -Path (Join-Path $RepoScripts 'Ensure-DmprepSync.ps1') -Destination (Join-Path $DeployScripts 'Ensure-DmprepSync.ps1') -Force

$DelayedScript = Join-Path $DeployScripts 'start-rh-delayed.ps1'
$Action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$DelayedScript`""

# AtStartup + 5 min (PT5M) — total ~5 min após boot antes de start-rh.ps1
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Trigger.Delay = 'PT5M'

# Sem StartWhenAvailable: evita disparar a tarefa so por re-registrar (e evita loops/UAC).
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

# Conta que roda o Docker Desktop neste servidor
$RunAsUser = $env:USERNAME
if ($RunAsUser -match '^\s*$') { $RunAsUser = 'Servidor_Eletropasso' }

# Limited: start-rh nao precisa de admin. Highest + Interactive dispara UAC a cada logon.
$Principal = New-ScheduledTaskPrincipal `
  -UserId $RunAsUser `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Force | Out-Null

Write-Host "Tarefa registrada: $TaskName"
Write-Host "Disparo: ao iniciar o Windows + 5 min de atraso"
Write-Host "Script: $DelayedScript -> start-rh.ps1"
Write-Host "Logs: E:\RH_eletropasso\logs\"
Write-Host ""

# Watchdog: a cada 5 min garante dmprep-sync (:3099)
$WatchdogScript = Join-Path $DeployScripts 'Ensure-DmprepSync.ps1'
$WatchdogAction = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchdogScript`""
$WatchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$WatchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
  -MultipleInstances IgnoreNew
Register-ScheduledTask `
  -TaskName $WatchdogTaskName `
  -Action $WatchdogAction `
  -Trigger $WatchdogTrigger `
  -Settings $WatchdogSettings `
  -Principal $Principal `
  -Force | Out-Null

Write-Host "Tarefa registrada: $WatchdogTaskName (a cada 5 min)"
Write-Host ""
Write-Host "Testar agora (manual):"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$DelayedScript`""
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$WatchdogScript`""
