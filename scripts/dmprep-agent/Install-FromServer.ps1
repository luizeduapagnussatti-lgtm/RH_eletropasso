# Instala tarefas agendadas NO SERVIDOR RH (.245) para sincronizar arquivos do PC .69 via SMB.
# Use quando RPC/schtasks remoto no .69 nao estiver disponivel.
#Requires -Version 5.1
param(
  [string]$AgentRoot = 'C:\xampp\htdocs\RH_eletropasso\scripts\dmprep-agent'
)

$ErrorActionPreference = 'Stop'

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdmin)) {
  throw 'Execute como Administrador.'
}

$configPath = Join-Path $AgentRoot 'config.from-server.json'
$syncScript = Join-Path $AgentRoot 'Sync-DmprepPunches.ps1'
$runnerBat = Join-Path $AgentRoot 'Run-Sync-FromServer.bat'

@(
  '@echo off',
  'cd /d "%~dp0"',
  "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$syncScript`" -ConfigPath `"$configPath`""
) | Set-Content -LiteralPath $runnerBat -Encoding ASCII

$tasks = @(
  @{ Name = 'RH_DmprepSync_FromServer_1200'; Time = '12:00' }
  @{ Name = 'RH_DmprepSync_FromServer_1800'; Time = '18:00' }
)

foreach ($t in $tasks) {
  $existing = Get-ScheduledTask -TaskName $t.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $t.Name -Confirm:$false
  }
  $trigger = New-ScheduledTaskTrigger -Daily -At $t.Time
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $t.Name -Action (New-ScheduledTaskAction -Execute $runnerBat) -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  Write-Host ("Tarefa criada no servidor: {0} as {1}" -f $t.Name, $t.Time)
}

Write-Host 'Sync via servidor configurado. Logs em scripts/dmprep-agent/logs/'
