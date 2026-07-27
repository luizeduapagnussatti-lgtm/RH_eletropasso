# Executar no servidor RH (.245) para instalar o agente no PC DMPREP (.69) via compartilhamento admin.
param(
  [string]$RemoteHost = '192.168.15.69',
  [string]$RemoteInstallRoot = 'C:\RH_eletropasso\dmprep-agent',
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
$remoteShare = "\\$RemoteHost\C$"
$relativePath = $RemoteInstallRoot -replace '^[Cc]:\\', ''
$remotePath = Join-Path $remoteShare $relativePath

Write-Host "Copiando agente para $remotePath ..."
New-Item -ItemType Directory -Path $remotePath -Force | Out-Null
Copy-Item -Path (Join-Path $SourceDir '*') -Destination $remotePath -Recurse -Force

$configOnRemote = Join-Path $remotePath 'config.json'
if (-not (Test-Path -LiteralPath $configOnRemote)) {
  Copy-Item (Join-Path $remotePath 'config.example.json') $configOnRemote -Force
}

$localConfig = Join-Path $SourceDir 'config.production.json'
if (Test-Path -LiteralPath $localConfig) {
  Copy-Item -LiteralPath $localConfig -Destination $configOnRemote -Force
}

$installScript = Join-Path $remotePath 'Install-DmprepAgent.ps1'
$runOnceBat = Join-Path $remotePath 'RUN_INSTALL_ONCE.bat'

Write-Host "Disparando instalacao remota em $RemoteHost ..."
$taskTr = 'C:\RH_eletropasso\dmprep-agent\RUN_INSTALL_ONCE.bat'
$argList = @(
  '/Create', '/F',
  '/TN', 'RH_DmprepAgent_InstallOnce',
  '/TR', $taskTr,
  '/SC', 'ONCE',
  '/ST', '23:59',
  '/SD', (Get-Date -Format 'MM/dd/yyyy'),
  '/RU', 'SYSTEM',
  '/RL', 'HIGHEST',
  '/S', $RemoteHost
)
& schtasks.exe @argList
if ($LASTEXITCODE -ne 0) {
  Write-Warning "schtasks remoto indisponivel (RPC/firewall). Arquivos copiados para $remotePath"
  Write-Warning "No PC $RemoteHost: clique direito em INSTALAR.bat -> Executar como administrador"
  exit 0
}

& schtasks.exe /Run /TN 'RH_DmprepAgent_InstallOnce' /S $RemoteHost
Start-Sleep -Seconds 8
& schtasks.exe /Query /TN 'RH_DmprepAgent_1200' /S $RemoteHost /FO LIST 2>$null
& schtasks.exe /Query /TN 'RH_DmprepAgent_1800' /S $RemoteHost /FO LIST 2>$null
Write-Host 'Verifique no PC remoto: C:\RH_eletropasso\dmprep-agent\logs\'
