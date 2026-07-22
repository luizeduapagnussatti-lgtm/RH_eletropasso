# Instala autostart do RH na pasta Inicializar do Windows (nao precisa de Admin).
# Dispara ao logon do usuario + 5 min de espera interna (start-rh-delayed.ps1).

$ErrorActionPreference = 'Stop'

$RepoScripts = 'C:\xampp\htdocs\RH_eletropasso\scripts'
$DeployScripts = 'E:\RH_eletropasso\scripts'
$StartupFolder = [Environment]::GetFolderPath('Startup')

New-Item -ItemType Directory -Force -Path $DeployScripts | Out-Null
Copy-Item -Path (Join-Path $RepoScripts 'start-rh.ps1') -Destination (Join-Path $DeployScripts 'start-rh.ps1') -Force
Copy-Item -Path (Join-Path $RepoScripts 'start-rh-delayed.ps1') -Destination (Join-Path $DeployScripts 'start-rh-delayed.ps1') -Force

$vbsPath = Join-Path $StartupFolder 'RH_Eletropasso_AutoStart.vbs'
$delayedScript = 'E:\RH_eletropasso\scripts\start-rh-delayed.ps1'

$vbs = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""$delayedScript""", 0, False
"@

Set-Content -Path $vbsPath -Value $vbs -Encoding ASCII

Write-Host "Autostart instalado (logon do usuario):"
Write-Host "  $vbsPath"
Write-Host "Aguarda 5 min e executa start-rh.ps1"
Write-Host "Logs: E:\RH_eletropasso\logs\"
Write-Host ""
Write-Host "Para tarefa no boot do Windows (Admin), execute como Administrador:"
Write-Host "  powershell -ExecutionPolicy Bypass -File E:\RH_eletropasso\scripts\install-rh-autostart.ps1"
