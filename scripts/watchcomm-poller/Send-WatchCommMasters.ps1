#Requires -Version 5.1
<#
.SYNOPSIS
  Envia ou limpa supervisores no PrintPoint via WatchComm.dll.
.NOTES
  A API pública expõe AddMaster(...), SendMasterList() e ClearMasterList().
  Executa automaticamente no PowerShell x86 (SysWOW64).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('Send', 'Clear')]
  [string]$Action,
  [string]$PayloadPath = '',
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [string]$ResultPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([IntPtr]::Size -ne 4) {
  $x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  if (-not (Test-Path -LiteralPath $x86)) { throw 'PowerShell x86 (SysWOW64) nao encontrado' }
  $args32 = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
    '-Action', $Action, '-ConfigPath', $ConfigPath
  )
  if ($PayloadPath) { $args32 += @('-PayloadPath', $PayloadPath) }
  if ($ResultPath) { $args32 += @('-ResultPath', $ResultPath) }
  $process = Start-Process -FilePath $x86 -ArgumentList $args32 -Wait -PassThru -NoNewWindow
  exit $process.ExitCode
}

function Get-ConfigValue($Object, [string]$Name, $Default = $null) {
  if ($null -eq $Object) { return $Default }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value -or $property.Value -eq '') { return $Default }
  return $property.Value
}

function Save-Result([bool]$Success, [int]$Count, [string]$ErrorMessage = '') {
  if (-not $ResultPath) { return }
  $directory = Split-Path -Parent $ResultPath
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $json = [pscustomobject]@{
    success = $Success
    action = $Action.ToLowerInvariant()
    supervisorCount = $Count
    finishedAt = (Get-Date).ToString('o')
    error = $(if ($ErrorMessage) { $ErrorMessage } else { $null })
  } | ConvertTo-Json -Depth 5
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($ResultPath, $json, $utf8NoBom)
}

function Get-InnerMessage($Exception) {
  $current = $Exception
  while ($current.InnerException) { $current = $current.InnerException }
  return $current.Message
}

$count = 0
try {
  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Config nao encontrado: $ConfigPath" }
  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $ResultPath) {
    $logDir = [string](Get-ConfigValue $config 'logDir' (Join-Path $PSScriptRoot 'logs'))
    $ResultPath = Join-Path $logDir 'last-masters-result.json'
  }

  $clockIp = [string](Get-ConfigValue $config 'clockIp' '192.168.15.201')
  $clockPort = [int](Get-ConfigValue $config 'clockPort' 3000)
  $equipmentId = [int](Get-ConfigValue $config 'equipmentId' 1)
  $firmwareVersion = [string](Get-ConfigValue $config 'firmwareVersion' '03.00.0028')
  $modulusHex = [string](Get-ConfigValue $config 'modulusHex' '')
  $exponentHex = [string](Get-ConfigValue $config 'exponentHex' '010001')
  if (-not $modulusHex) { throw 'modulusHex ausente no config do WatchComm' }

  $rsaCore = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\services\rep-gateway\research\WatchComm-RsaCore.ps1'))
  . $rsaCore
  Initialize-WatchCommRsa
  $assembly = $script:WatchCommAssembly
  $watchType = $assembly.GetType('org.cesar.dmplight.watchComm.impl.WatchComm')
  $tcpType = $assembly.GetType('org.cesar.dmplight.watchComm.api.TCPComm')
  if (-not $watchType -or -not $tcpType) { throw 'Tipos WatchComm necessarios nao encontrados' }

  $protocol = Get-WatchCommEnumValue 'org.cesar.dmplight.watchComm.api.WatchProtocolType' 'PrintPointIII'
  $connection = Get-WatchCommEnumValue 'org.cesar.dmplight.watchComm.api.WatchConnectionType' 'ConnectedMode'
  $create = $watchType.GetMethods() | Where-Object {
    $_.Name -eq 'CreateWatchCommVB6' -and $_.GetParameters().Count -eq 10
  } | Select-Object -First 1

  $tcp = [Activator]::CreateInstance($tcpType)
  $tcpType.GetMethod('CreateTcpComm', [Type[]]@([string], [int])).Invoke($tcp, @($clockIp, $clockPort))
  try { $tcp.SetTimeOut(20000) } catch {}

  $watch = [Activator]::CreateInstance($watchType)
  [void]$create.Invoke($watch, @($protocol, $tcp, $equipmentId, '', $connection, $firmwareVersion, $modulusHex, $exponentHex, '', ''))
  try {
    [void]$watchType.GetMethod('OpenConnection').Invoke($watch, @())
  } catch {
    Write-Warning ("OpenConnection: {0}" -f (Get-InnerMessage $_.Exception))
  }

  if ($Action -eq 'Clear') {
    [void]$watchType.GetMethod('ClearMasterList').Invoke($watch, @())
  } else {
    if (-not $PayloadPath -or -not (Test-Path -LiteralPath $PayloadPath)) {
      throw 'PayloadPath e obrigatorio para Action=Send'
    }
    $payload = Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $masters = @($payload.masters)
    if ($masters.Count -lt 1 -or $masters.Count -gt 5) {
      throw 'A lista deve conter de 1 a 5 supervisores'
    }
    $addMaster = $watchType.GetMethods() | Where-Object {
      $_.Name -eq 'AddMaster' -and $_.GetParameters().Count -eq 7
    } | Select-Object -First 1
    if (-not $addMaster) { throw 'WatchComm.AddMaster esperado nao encontrado' }
    foreach ($item in $masters) {
      $code = [string](Get-ConfigValue $item 'code' '')
      $pis = [string](Get-ConfigValue $item 'pis' '')
      $password = [string](Get-ConfigValue $item 'password' '')
      if ($code -notmatch '^\d{1,20}$') { throw 'Codigo de supervisor invalido' }
      if ($pis -notmatch '^\d{12}$') { throw 'PIS de supervisor invalido' }
      if ($password -notmatch '^\d{6}$') { throw 'Senha de supervisor invalida' }
      [void]$addMaster.Invoke($watch, @(
        $pis,
        $code,
        $password,
        [bool](Get-ConfigValue $item 'hasTechnicalPermission' $true),
        [bool](Get-ConfigValue $item 'hasDatetimePermission' $true),
        [bool](Get-ConfigValue $item 'hasPendrivePermission' $true),
        [bool](Get-ConfigValue $item 'hasBobbinPermission' $false)
      ))
      $count++
    }
    [void]$watchType.GetMethod('SendMasterList').Invoke($watch, @())
  }

  try { [void]$watchType.GetMethod('CloseConnection').Invoke($watch, @()) } catch {}
  Save-Result $true $count
  Write-Host ("WatchComm masters {0} concluido ({1})" -f $Action, $count)
  exit 0
} catch {
  $message = Get-InnerMessage $_.Exception
  Save-Result $false $count $message
  Write-Error $message
  exit 1
}
