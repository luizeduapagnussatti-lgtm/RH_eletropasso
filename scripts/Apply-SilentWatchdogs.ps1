# Re-registra watchdogs RH para rodarem via wscript (sem flash de janela).
# Pode rodar sem admin se as tarefas já existirem na conta atual.
#   powershell -ExecutionPolicy Bypass -File C:\xampp\htdocs\RH_eletropasso\scripts\Apply-SilentWatchdogs.ps1

$ErrorActionPreference = 'Stop'

$RepoScripts = 'C:\xampp\htdocs\RH_eletropasso\scripts'
$DeployScripts = 'E:\RH_eletropasso\scripts'
New-Item -ItemType Directory -Force -Path $DeployScripts | Out-Null

$files = @(
  'Run-HiddenPs1.vbs', 'Run-WatchFrontend.vbs',
  'Ensure-Frontend.ps1', 'Ensure-DmprepSync.ps1',
  'Ensure-NpmRhUpstream.ps1', 'Ensure-SupabaseApi.ps1',
  'Watch-Frontend.ps1', 'start-rh-delayed.ps1', 'start-rh.ps1',
  'fix-npm-rh-ipv4.py', 'install-rh-autostart.ps1'
)
foreach ($f in $files) {
  $src = Join-Path $RepoScripts $f
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $DeployScripts $f) -Force
  }
}

$vbs = Join-Path $DeployScripts 'Run-HiddenPs1.vbs'
$wscript = Join-Path $env:WINDIR 'System32\wscript.exe'

$RunAsUser = $env:USERNAME
if ($RunAsUser -match '^\s*$') { $RunAsUser = 'Servidor_Eletropasso' }

$Principal = New-ScheduledTaskPrincipal `
  -UserId $RunAsUser `
  -LogonType Interactive `
  -RunLevel Limited

$WatchdogSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3) `
  -MultipleInstances IgnoreNew `
  -Hidden

function Set-SilentPs1Task {
  param(
    [string]$TaskName,
    [string]$Ps1Path,
    [string]$ExtraArgs = '',
    [TimeSpan]$Interval,
    [TimeSpan]$ExecLimit = (New-TimeSpan -Minutes 3)
  )
  $arg = '//nologo "{0}" "{1}"' -f $vbs, $Ps1Path
  if ($ExtraArgs) { $arg = "$arg $ExtraArgs" }
  $action = New-ScheduledTaskAction -Execute $wscript -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
    -RepetitionInterval $Interval `
    -RepetitionDuration (New-TimeSpan -Days 3650)
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit $ExecLimit `
    -MultipleInstances IgnoreNew `
    -Hidden
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Set-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Principal $Principal | Out-Null
  } else {
    Register-ScheduledTask `
      -TaskName $TaskName `
      -Action $action `
      -Trigger $trigger `
      -Settings $settings `
      -Principal $Principal `
      -Force | Out-Null
  }
  Write-Host "OK (silencioso): $TaskName a cada $($Interval.TotalMinutes) min"
}

# AutoStart no boot — também via VBS (pode exigir admin)
$delayed = Join-Path $DeployScripts 'start-rh-delayed.ps1'
try {
  $bootAction = New-ScheduledTaskAction -Execute $wscript -Argument ('//nologo "{0}" "{1}"' -f $vbs, $delayed)
  $bootTrigger = New-ScheduledTaskTrigger -AtStartup
  $bootTrigger.Delay = 'PT5M'
  $bootSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew `
    -Hidden
  if (Get-ScheduledTask -TaskName 'RH_Eletropasso_AutoStart' -ErrorAction SilentlyContinue) {
    Set-ScheduledTask -TaskName 'RH_Eletropasso_AutoStart' -Action $bootAction -Trigger $bootTrigger -Settings $bootSettings -Principal $Principal | Out-Null
  } else {
    Register-ScheduledTask -TaskName 'RH_Eletropasso_AutoStart' -Action $bootAction -Trigger $bootTrigger -Settings $bootSettings -Principal $Principal -Force | Out-Null
  }
  Write-Host 'OK (silencioso): RH_Eletropasso_AutoStart (boot+5min)'
} catch {
  Write-Host "AVISO AutoStart (precisa admin): $($_.Exception.Message)"
}

# Frontend: 5 min (backup). Supervisor contínuo já cobre ~30s sem abrir janela.
Set-SilentPs1Task -TaskName 'RH_Eletropasso_Frontend_Watchdog' `
  -Ps1Path (Join-Path $DeployScripts 'Ensure-Frontend.ps1') `
  -ExtraArgs '-Mode preview' `
  -Interval (New-TimeSpan -Minutes 5)

Set-SilentPs1Task -TaskName 'RH_Eletropasso_DmprepSync_Watchdog' `
  -Ps1Path (Join-Path $DeployScripts 'Ensure-DmprepSync.ps1') `
  -Interval (New-TimeSpan -Minutes 5)

Set-SilentPs1Task -TaskName 'RH_Eletropasso_NpmUpstream_Watchdog' `
  -Ps1Path (Join-Path $DeployScripts 'Ensure-NpmRhUpstream.ps1') `
  -Interval (New-TimeSpan -Minutes 5)

Set-SilentPs1Task -TaskName 'RH_Eletropasso_SupabaseApi_Watchdog' `
  -Ps1Path (Join-Path $DeployScripts 'Ensure-SupabaseApi.ps1') `
  -Interval (New-TimeSpan -Minutes 5)

Write-Host ''
Write-Host 'Teste silencioso (não deve abrir janela):'
Write-Host "  wscript.exe //nologo `"$vbs`" `"$(Join-Path $DeployScripts 'Ensure-Frontend.ps1')`" -Mode preview"
