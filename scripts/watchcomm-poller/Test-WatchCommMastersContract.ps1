#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -ne 4) {
  $x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  $process = Start-Process -FilePath $x86 -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
  ) -Wait -PassThru -NoNewWindow
  exit $process.ExitCode
}

$rsaCore = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\services\rep-gateway\research\WatchComm-RsaCore.ps1'))
. $rsaCore
Initialize-WatchCommRsa

$assembly = $script:WatchCommAssembly
$watchType = $assembly.GetType('org.cesar.dmplight.watchComm.impl.WatchComm')
$sendMethod = $watchType.GetMethod('SendMasterList')
$clearMethod = $watchType.GetMethod('ClearMasterList')

if (-not $sendMethod) { throw 'SendMasterList missing' }
if (-not $clearMethod) {
  $available = ($watchType.GetMethods() | Where-Object { $_.Name -match 'Master' } | ForEach-Object { $_.Name }) -join ', '
  throw "ClearMasterList missing. Available: $available"
}
if ($sendMethod.GetParameters().Count -ne 0) {
  throw ("Unexpected SendMasterList signature: " + $sendMethod.ToString())
}
$addMethods = @($watchType.GetMethods() | Where-Object { $_.Name -eq 'AddMaster' })
if ($addMethods.Count -lt 1) { throw 'AddMaster missing' }
$addMethod = $addMethods | Where-Object { $_.GetParameters().Count -eq 7 } | Select-Object -First 1
if (-not $addMethod) { throw 'Expected seven-parameter AddMaster overload missing' }
Write-Host (($addMethods | ForEach-Object {
  $parameters = ($_.GetParameters() | ForEach-Object { $_.ParameterType.Name + ' ' + $_.Name }) -join ', '
  $_.Name + '(' + $parameters + ')'
}) -join [Environment]::NewLine)
Write-Host 'WatchComm masters contract OK'
