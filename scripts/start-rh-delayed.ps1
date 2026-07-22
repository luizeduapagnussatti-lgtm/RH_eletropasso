# Aguarda Docker/Windows estabilizar após reboot, depois chama start-rh.ps1.
# Usado pela Tarefa Agendada (atraso de 5 minutos).

$DelayMinutes = 5
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartScript = Join-Path $ScriptDir 'start-rh.ps1'
$DataRoot = 'E:\RH_eletropasso'
$LogDir = Join-Path $DataRoot 'logs'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$log = Join-Path $LogDir 'autostart-delayed.log'
"[$(Get-Date -Format o)] Waiting $DelayMinutes min before RH start..." | Out-File -FilePath $log -Append -Encoding utf8

Start-Sleep -Seconds ($DelayMinutes * 60)

"[$(Get-Date -Format o)] Launching start-rh.ps1" | Out-File -FilePath $log -Append -Encoding utf8

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript *>> $log

"[$(Get-Date -Format o)] Done." | Out-File -FilePath $log -Append -Encoding utf8
