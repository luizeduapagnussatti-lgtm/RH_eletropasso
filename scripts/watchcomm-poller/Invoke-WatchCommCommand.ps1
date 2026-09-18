#Requires -Version 5.1
<#
.SYNOPSIS
  Generic WatchComm.dll dispatcher for PrintPoint SmartPoint B.
.NOTES
  Connection boilerplate mirrors Send-WatchCommMasters.ps1 (x86, CreateTcpComm,
  CreateWatchCommVB6 10-arg, OpenConnection tolerate, CloseConnection).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet(
    'status','identity','employer-read','employee-list-read','fingerprint-list-read',
    'set-datetime','set-dst','remove-dst','include-holidays','send-display-message','clear-display-message',
    'send-employees','remove-employee','exclude-fingerprint','exclude-fingerprint-orphans',
    'program-biometric-reader-use','program-trigger-type','update-communication-user','set-net-info','change-employer'
  )]
  [string]$Operation,
  [string]$PayloadPath = '',
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [string]$ResultPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:DeniedMethods = @(
  'UpdateFirmware',
  'ActivateBootLoader',
  'EraseMarkingPoints',
  'ReplaceMRP',
  'ClearAllRegisters',
  'CleanEssentialVariables',
  'ExchangeSealREP'
)

if ([IntPtr]::Size -ne 4) {
  $x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  if (-not (Test-Path -LiteralPath $x86)) { throw 'PowerShell x86 (SysWOW64) nao encontrado' }
  $args32 = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
    '-Operation', $Operation, '-ConfigPath', $ConfigPath
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

function Save-Result([bool]$Success, $Data = $null, [string]$ErrorMessage = '') {
  if (-not $ResultPath) { return }
  $directory = Split-Path -Parent $ResultPath
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $json = [pscustomobject]@{
    success = $Success
    op = $Operation
    data = $Data
    finishedAt = (Get-Date).ToString('o')
    error = $(if ($ErrorMessage) { $ErrorMessage } else { $null })
  } | ConvertTo-Json -Depth 12
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($ResultPath, $json, $utf8NoBom)
}

function Get-InnerMessage($Exception) {
  $current = $Exception
  while ($current.InnerException) { $current = $current.InnerException }
  return $current.Message
}

function Convert-NetObjectToPs($Value, [int]$Depth = 0) {
  if ($null -eq $Value) { return $null }
  if ($Depth -gt 6) { return $Value.ToString() }

  if ($Value -is [string] -or $Value -is [bool] -or $Value -is [byte] -or
      $Value -is [int16] -or $Value -is [int] -or $Value -is [int64] -or
      $Value -is [uint16] -or $Value -is [uint32] -or $Value -is [uint64] -or
      $Value -is [double] -or $Value -is [decimal] -or $Value -is [single]) {
    return $Value
  }
  if ($Value -is [datetime]) { return $Value.ToString('o') }
  if ($Value -is [enum]) { return $Value.ToString() }
  if ($Value -is [byte[]]) { return [Convert]::ToBase64String([byte[]]$Value) }

  if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
    $items = @()
    foreach ($item in $Value) {
      $items += ,(Convert-NetObjectToPs $item ($Depth + 1))
    }
    return $items
  }

  $type = $Value.GetType()
  if (-not $type.IsClass -and -not $type.IsValueType) {
    return $Value.ToString()
  }

  $bag = [ordered]@{}
  $props = $type.GetProperties([Reflection.BindingFlags]'Public,Instance')
  foreach ($prop in $props) {
    if ($prop.GetIndexParameters().Count -gt 0) { continue }
    if (-not $prop.CanRead) { continue }
    try {
      $bag[$prop.Name] = Convert-NetObjectToPs ($prop.GetValue($Value, $null)) ($Depth + 1)
    } catch {
      $bag[$prop.Name] = $null
    }
  }
  if ($bag.Count -eq 0) {
    try { return $Value.ToString() } catch { return $null }
  }
  return [pscustomobject]$bag
}

function Get-WatchMethod([Type]$Type, [string]$Name, [int]$ParamCount = -1) {
  $methods = @($Type.GetMethods() | Where-Object { $_.Name -eq $Name })
  if ($ParamCount -ge 0) {
    $methods = @($methods | Where-Object { $_.GetParameters().Count -eq $ParamCount })
  }
  return $methods | Select-Object -First 1
}

function Invoke-WatchMethod($Watch, [Type]$Type, [string]$Name, [object[]]$MethodArgs = @(), [int]$ParamCount = -1) {
  $count = if ($ParamCount -ge 0) { $ParamCount } else { @($MethodArgs).Count }
  $method = Get-WatchMethod $Type $Name $count
  if (-not $method) {
    $available = @($Type.GetMethods() | Where-Object { $_.Name -eq $Name } | ForEach-Object {
      '{0}({1})' -f $_.Name, (($_.GetParameters() | ForEach-Object { $_.ParameterType.Name }) -join ',')
    }) -join '; '
    throw ("Metodo WatchComm.{0} nao encontrado (args={1}). Disponiveis: {2}" -f $Name, $count, $available)
  }
  # Parameterless methods must use $null — empty object[] triggers TargetException
  # ("Objeto nao coincide com o tipo de destino") on some WatchComm builds.
  if ($count -eq 0) {
    return $method.Invoke($Watch, $null)
  }
  return $method.Invoke($Watch, [object[]]@($MethodArgs))
}

function Get-ObjectProp($Object, [string[]]$Names) {
  if ($null -eq $Object) { return $null }
  foreach ($name in $Names) {
    $prop = $Object.PSObject.Properties[$name]
    if ($null -ne $prop -and $null -ne $prop.Value -and "$($prop.Value)" -ne '') {
      return $prop.Value
    }
    try {
      $netProp = $Object.GetType().GetProperty($name, [Reflection.BindingFlags]'Public,Instance,IgnoreCase')
      if ($netProp -and $netProp.GetIndexParameters().Count -eq 0) {
        $val = $netProp.GetValue($Object, $null)
        if ($null -ne $val -and "$val" -ne '') { return $val }
      }
    } catch {}
  }
  return $null
}

function Convert-EmployeeRow($Employee) {
  $pis = [string](Get-ObjectProp $Employee @('Pis', 'PIS', 'pis'))
  $name = [string](Get-ObjectProp $Employee @('Name', 'Nome', 'name', 'nome'))
  $code = Get-ObjectProp $Employee @('Credential', 'Credentials', 'EmployeeId', 'EmployeeID', 'Id', 'Code', 'Codigo', 'Password')
  if ($code -is [System.Array]) {
    $first = $code | Select-Object -First 1
    $code = Get-ObjectProp $first @('Credential', 'Code', 'Pis', 'PIS')
  }
  return [pscustomobject]@{
    pis = $pis
    name = $name
    code = $(if ($null -eq $code) { '' } else { [string]$code })
  }
}

function Read-PayloadObject {
  if (-not $PayloadPath) { return $null }
  if (-not (Test-Path -LiteralPath $PayloadPath)) {
    throw "PayloadPath nao encontrado: $PayloadPath"
  }
  return (Get-Content -LiteralPath $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Assert-NotDenied([string]$Name) {
  foreach ($denied in $script:DeniedMethods) {
    if ([string]::Equals($Name, $denied, [StringComparison]::OrdinalIgnoreCase)) {
      throw ("Operacao negada (denylist): {0}" -f $denied)
    }
  }
}

function Require-PayloadFields($Fields, [string[]]$Names) {
  if ($null -eq $Fields) { throw 'payload.payload e obrigatorio para esta operacao' }
  foreach ($name in $Names) {
    $prop = $Fields.PSObject.Properties[$name]
    if ($null -eq $prop -or $null -eq $prop.Value -or "$($prop.Value)" -eq '') {
      throw ("Campo payload obrigatorio ausente: {0}" -f $name)
    }
  }
}

$data = $null
$watch = $null
$watchType = $null
try {
  Assert-NotDenied $Operation

  if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Config nao encontrado: $ConfigPath" }
  $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (-not $ResultPath) {
    $logDir = [string](Get-ConfigValue $config 'logDir' (Join-Path $PSScriptRoot 'logs'))
    $ResultPath = Join-Path $logDir 'last-command-result.json'
  }

  $payloadRoot = Read-PayloadObject
  if ($null -ne $payloadRoot) {
    $payloadOp = [string](Get-ConfigValue $payloadRoot 'op' '')
    if ($payloadOp) { Assert-NotDenied $payloadOp }
  }
  $fields = if ($null -ne $payloadRoot) { Get-ConfigValue $payloadRoot 'payload' $null } else { $null }

  $clockIp = [string](Get-ConfigValue $config 'clockIp' '192.168.15.201')
  $clockPort = [int](Get-ConfigValue $config 'clockPort' 3000)
  $equipmentId = [int](Get-ConfigValue $config 'equipmentId' 1)
  $firmwareVersion = [string](Get-ConfigValue $config 'firmwareVersion' '03.00.0028')
  $modulusHex = [string](Get-ConfigValue $config 'modulusHex' '')
  $exponentHex = [string](Get-ConfigValue $config 'exponentHex' '010001')
  $accessKey = [string](Get-ConfigValue $config 'accessKey' '')
  $commUser = [string](Get-ConfigValue $config 'commUser' 'login')
  $commPassword = [string](Get-ConfigValue $config 'commPassword' 'senha')
  if (-not $modulusHex) { throw 'modulusHex ausente no config do WatchComm' }

  $rsaCore = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'lib\WatchComm-RsaCore.ps1'))
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
  if (-not $create) { throw 'CreateWatchCommVB6 (10 args) nao encontrado' }

  $writeOps = @(
    'set-datetime','set-dst','remove-dst','include-holidays','send-display-message','clear-display-message',
    'send-employees','remove-employee','exclude-fingerprint','exclude-fingerprint-orphans',
    'program-biometric-reader-use','program-trigger-type','update-communication-user','set-net-info','change-employer'
  )
  $isWriteOp = $writeOps -contains $Operation
  $openTimeoutMs = if ($isWriteOp) { 45000 } else { 20000 }
  $openMaxAttempts = if ($isWriteOp) { 6 } else { 1 }

  # LAN preflight (ARP/TCP) before fragile write sessions — same helper as Monday collect.
  if ($isWriteOp) {
    $linkScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\Ensure-PrintPointLink.ps1'))
    if (Test-Path -LiteralPath $linkScript) {
      try {
        $link = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
          '-NoProfile', '-ExecutionPolicy', 'Bypass',
          '-File', $linkScript,
          '-ClockIp', $clockIp,
          '-ClockPort', ([string]$clockPort)
        ) -Wait -PassThru -NoNewWindow
        if ($link.ExitCode -ne 0) {
          Write-Warning ("Ensure-PrintPointLink exit={0} - seguindo com OpenConnection" -f $link.ExitCode)
        }
      } catch {
        Write-Warning ("Ensure-PrintPointLink: {0}" -f $_.Exception.Message)
      }
    }
  }

  function Test-WatchConnected($WatchObj) {
    try { return [bool]$WatchObj.Connected } catch { return $false }
  }

  function New-WatchSession {
    $tcpLocal = [Activator]::CreateInstance($tcpType)
    [void]$tcpType.GetMethod('CreateTcpComm', [Type[]]@([string], [int])).Invoke($tcpLocal, @($clockIp, [int]$clockPort))
    try { $tcpLocal.SetTimeOut([int]$openTimeoutMs) } catch {}
    $watchLocal = [Activator]::CreateInstance($watchType)
    [void]$create.Invoke($watchLocal, @(
      $protocol, $tcpLocal, [int]$equipmentId, $accessKey, $connection,
      $firmwareVersion, $modulusHex, $exponentHex, $commUser, $commPassword
    ))
    # Ensure only the WatchComm instance is returned (no pipeline leaks).
    return ,$watchLocal
  }

  function Open-WatchSessionFresh {
    param([int]$Attempts = 3)
    $localWatch = $null
    for ($i = 1; $i -le $Attempts; $i++) {
      try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $iar = $tcpClient.BeginConnect($clockIp, $clockPort, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(3000, $false)
        $tcpOk = $ok -and $tcpClient.Connected
        try { $tcpClient.Close() } catch {}
        if (-not $tcpOk) {
          Start-Sleep -Seconds ([Math]::Min(2 * $i, 6))
          continue
        }
      } catch {
        Start-Sleep -Seconds ([Math]::Min(2 * $i, 6))
        continue
      }
      try {
        if ($null -ne $localWatch) {
          try { $localWatch.CloseConnection() } catch {}
        }
      } catch {}
      $localWatch = New-WatchSession
      $openErr = ''
      try {
        $localWatch.OpenConnection()
      } catch {
        $openErr = Get-InnerMessage $_.Exception
      }
      if (Test-WatchConnected $localWatch) { return $localWatch }
      # Soft-open (1730 / type mismatch) still usable for list reads
      if ($openErr -and ($openErr -match '1730|coincide com o tipo|tipo de destino')) {
        return $localWatch
      }
      Start-Sleep -Seconds ([Math]::Min(2 * $i, 6))
    }
    return $localWatch
  }

  $lastOpenMsg = ''
  $opened = $false
  for ($attempt = 1; $attempt -le $openMaxAttempts; $attempt++) {
    if ($isWriteOp) {
      try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $iar = $tcpClient.BeginConnect($clockIp, $clockPort, $null, $null)
        $ok = $iar.AsyncWaitHandle.WaitOne(3000, $false)
        if (-not $ok -or -not $tcpClient.Connected) {
          try { $tcpClient.Close() } catch {}
          $lastOpenMsg = "TCP ${clockIp}:${clockPort} inacessivel (tentativa $attempt/$openMaxAttempts)"
          Start-Sleep -Seconds ([Math]::Min(2 * $attempt, 8))
          continue
        }
        try { $tcpClient.Close() } catch {}
      } catch {
        $lastOpenMsg = "TCP preflight: $($_.Exception.Message)"
        Start-Sleep -Seconds ([Math]::Min(2 * $attempt, 8))
        continue
      }
    }

    try {
      if ($null -ne $watch) {
        try { $watch.CloseConnection() } catch {}
      }
    } catch {}
    $watch = New-WatchSession

    try {
      $watch.OpenConnection()
      $lastOpenMsg = ''
    } catch {
      $lastOpenMsg = Get-InnerMessage $_.Exception
      # Soft-open (1730) is tolerated on reads; write ops need Connected.
      if (-not $isWriteOp) {
        Write-Warning ("OpenConnection: {0}" -f $lastOpenMsg)
        $opened = $true
        break
      }
    }

    if ($isWriteOp) {
      if (Test-WatchConnected $watch) {
        $opened = $true
        break
      }
      # remove-employee can succeed idempotently via list-read on soft-open (fn 92 already cleared PIS)
      if ($Operation -eq 'remove-employee' -and $lastOpenMsg -match '1730|coincide com o tipo|tipo de destino|tempo limite') {
        Write-Warning ("OpenConnection soft para remove-employee: {0} - seguindo para Exclude/lista" -f $lastOpenMsg)
        $opened = $true
        break
      }
      $lastOpenMsg = if ($lastOpenMsg) { $lastOpenMsg } else { 'Connected=false apos OpenConnection' }
      Start-Sleep -Seconds ([Math]::Min(2 * $attempt, 8))
      continue
    }

    $opened = $true
    break
  }

  if ($isWriteOp -and -not $opened) {
    throw ("OpenConnection falhou apos {0} tentativas ({1}). Saia do menu do PrintPoint, confira cabo/rede e tente de novo." -f $openMaxAttempts, $lastOpenMsg)
  }

  switch ($Operation) {
    'status' {
      $bag = [ordered]@{}
      try {
        $status = Invoke-WatchMethod $watch $watchType 'GetPrintPointStatus'
        $bag['printPointStatus'] = Convert-NetObjectToPs $status
        if ($null -eq $bag['printPointStatus']) { $bag['printPointStatus'] = "$status" }
      } catch {
        $bag['printPointStatusError'] = Get-InnerMessage $_.Exception
      }
      try {
        $immediate = Invoke-WatchMethod $watch $watchType 'GetImmediateStatus'
        $bag['immediateStatus'] = Convert-NetObjectToPs $immediate
        if ($null -eq $bag['immediateStatus']) { $bag['immediateStatus'] = "$immediate" }
      } catch {
        $bag['immediateStatusError'] = Get-InnerMessage $_.Exception
      }
      $data = [pscustomobject]$bag
    }

    'identity' {
      $bag = [ordered]@{}
      try {
        $bag['serialNumber'] = [string](Invoke-WatchMethod $watch $watchType 'InquirySerialNumber')
      } catch {
        $bag['serialNumberError'] = Get-InnerMessage $_.Exception
      }
      try {
        $bag['firmwareVersion'] = Convert-NetObjectToPs (Invoke-WatchMethod $watch $watchType 'GetFirmwareVersion')
      } catch {
        $bag['firmwareVersionError'] = Get-InnerMessage $_.Exception
      }
      try {
        $bag['mac'] = Convert-NetObjectToPs (Invoke-WatchMethod $watch $watchType 'GetMAC')
      } catch {
        $bag['macError'] = Get-InnerMessage $_.Exception
      }
      try {
        $bag['serialAndMemory'] = Convert-NetObjectToPs (Invoke-WatchMethod $watch $watchType 'InquirySerialNumberOfREPAndMemory')
      } catch {
        $bag['serialAndMemoryError'] = Get-InnerMessage $_.Exception
      }
      # Prefer employer inquiry which is known to work on PrintPoint III collect path.
      try {
        $bag['employer'] = Convert-NetObjectToPs (Invoke-WatchMethod $watch $watchType 'InquiryEmployeer')
      } catch {
        $bag['employerError'] = Get-InnerMessage $_.Exception
      }
      $data = [pscustomobject]$bag
    }

    'employer-read' {
      try {
        $employer = Invoke-WatchMethod $watch $watchType 'InquiryEmployeer'
        $data = Convert-NetObjectToPs $employer
      } catch {
        $data = [pscustomobject]@{
          supported = $false
          error = Get-InnerMessage $_.Exception
        }
      }
    }

    'employee-list-read' {
      try {
        $list = @(Invoke-WatchMethod $watch $watchType 'InquiryEmployeeList')
        # ConfirmationReceipt is a pending/ack buffer — do NOT replace the full
        # Inquiry list when it returns fewer rows (that hid everyone except 1).
        try {
          $confirmed = @(Invoke-WatchMethod $watch $watchType 'ConfirmationReceiptEmployeeList')
          if ($confirmed.Count -gt $list.Count) { $list = $confirmed }
        } catch {}
        $employees = @($list | ForEach-Object { Convert-EmployeeRow $_ })
        $data = [pscustomobject]@{
          supported = $true
          count = $employees.Count
          employees = $employees
        }
      } catch {
        $data = [pscustomobject]@{
          supported = $false
          count = 0
          employees = @()
          error = Get-InnerMessage $_.Exception
        }
      }
    }

    'fingerprint-list-read' {
      $supported = $false
      $fingerprints = @()
      $inquiryType = Get-WatchMethod $watchType 'InquiryFingerPrint' 1
      $confirm = Get-WatchMethod $watchType 'ConfirmationReceiptFingerPrint' 0
      try {
        if ($inquiryType) {
          $paramType = $inquiryType.GetParameters()[0].ParameterType
          if ($paramType.IsEnum) {
            $allValue = [Enum]::Parse($paramType, 'All')
            $raw = $inquiryType.Invoke($watch, @($allValue))
            $supported = $true
            if ($null -ne $raw) {
              if ($raw -is [System.Array]) {
                $fingerprints = @($raw | ForEach-Object { Convert-NetObjectToPs $_ })
              } else {
                $fingerprints = @(Convert-NetObjectToPs $raw)
              }
            }
          } elseif ($paramType -eq [int]) {
            # Int32 employeeID overload — not used for full list
          }
        }
        if ($confirm) {
          $confirmed = $confirm.Invoke($watch, @())
          $supported = $true
          if ($null -ne $confirmed) {
            if ($confirmed -is [System.Array]) {
              $fingerprints = @($confirmed | ForEach-Object { Convert-NetObjectToPs $_ })
            } else {
              $fingerprints = @(Convert-NetObjectToPs $confirmed)
            }
          }
        }
      } catch {
        if (-not $supported) {
          $data = [pscustomobject]@{
            supported = $false
            fingerprints = @()
            error = Get-InnerMessage $_.Exception
          }
          break
        }
        throw
      }
      $data = [pscustomobject]@{
        supported = $supported
        count = $fingerprints.Count
        fingerprints = $fingerprints
      }
    }

    'set-datetime' {
      Require-PayloadFields $fields @('isoDateTime')
      $dt = [DateTime]::Parse([string]$fields.isoDateTime)
      [void](Invoke-WatchMethod -Watch $watch -Type $watchType -Name 'SetDateTime' -MethodArgs ([object[]]@($dt)) -ParamCount 1)
      $data = [pscustomobject]@{ isoDateTime = $dt.ToString('o') }
    }

    'set-dst' {
      Require-PayloadFields $fields @('startIso', 'endIso')
      $start = [DateTime]::Parse([string]$fields.startIso)
      $end = [DateTime]::Parse([string]$fields.endIso)
      [void](Invoke-WatchMethod -Watch $watch -Type $watchType -Name 'SetDST' -MethodArgs ([object[]]@($start, $end)))
      $data = [pscustomobject]@{
        startIso = $start.ToString('o')
        endIso = $end.ToString('o')
      }
    }

    'remove-dst' {
      [void](Invoke-WatchMethod -Watch $watch -Type $watchType -Name 'RemoveDST')
      $data = [pscustomobject]@{ removed = $true }
    }

    'include-holidays' {
      $rawDates = Get-ConfigValue $fields 'dates' $null
      if ($null -eq $rawDates) {
        throw 'payload.dates (array ISO) e obrigatorio'
      }
      $dates = [DateTime[]]@($rawDates | ForEach-Object { [DateTime]::Parse([string]$_) })
      [void](Invoke-WatchMethod -Watch $watch -Type $watchType -Name 'IncludeHolidaysList' -MethodArgs ([object[]]@(,$dates)) -ParamCount 1)
      $data = [pscustomobject]@{
        count = $dates.Count
        dates = @($dates | ForEach-Object { $_.ToString('o') })
      }
    }

    'send-display-message' {
      Require-PayloadFields $fields @('line', 'message')
      $line = [int16]$fields.line
      $message = [string]$fields.message
      try {
        [void](Invoke-WatchMethod -Watch $watch -Type $watchType -Name 'SendDisplayMessage' -MethodArgs ([object[]]@($line, $message)))
        $data = [pscustomobject]@{ supported = $true; method = 'SendDisplayMessage'; line = $line; message = $message }
      } catch {
        $cfg = Get-WatchMethod $watchType 'ConfigureMessage' 2
        if ($cfg) {
          try {
            [void]$cfg.Invoke($watch, @([byte]$line, $message))
            $data = [pscustomobject]@{ supported = $true; method = 'ConfigureMessage'; line = $line; message = $message }
          } catch {
            $data = [pscustomobject]@{
              supported = $false
              error = Get-InnerMessage $_.Exception
              note = 'Display message not supported on this PrintPoint firmware'
            }
          }
        } else {
          $data = [pscustomobject]@{
            supported = $false
            error = Get-InnerMessage $_.Exception
            note = 'Display message not supported on this PrintPoint firmware'
          }
        }
      }
    }

    'clear-display-message' {
      try {
        [void](Invoke-WatchMethod -Watch $watch -Type $watchType -Name 'ClearDisplayMessage')
        $data = [pscustomobject]@{ supported = $true; cleared = $true }
      } catch {
        $data = [pscustomobject]@{
          supported = $false
          cleared = $false
          error = Get-InnerMessage $_.Exception
          note = 'Clear display not supported on this PrintPoint firmware'
        }
      }
    }

    'send-employees' {
      $rawEmployees = Get-ConfigValue $fields 'employees' $null
      if ($null -eq $rawEmployees) {
        throw 'payload.employees e obrigatorio'
      }
      $employees = @($rawEmployees)
      # PrintPoint III (SmartPoint B): AddEmployee(7/5) is PrintPoint Li ONLY.
      # Use AddFullEmployee(pis,name,password,credentials[],fingerprints[]) so the
      # keypad badge (crachá) is programmed. Fallback: AddEmployee(3) + AddCredential.
      # Device stores password as 6 digits (99 → 000099).
      $addFull = Get-WatchMethod $watchType 'AddFullEmployee' 5
      $add3 = Get-WatchMethod $watchType 'AddEmployee' 3
      $add1 = Get-WatchMethod $watchType 'AddEmployee' 1
      $addCred = Get-WatchMethod $watchType 'AddCredential' 3
      $includeCred1 = Get-WatchMethod $watchType 'IncludeCredentialList' 1
      $include2 = Get-WatchMethod $watchType 'IncludeEmployeesList' 2
      $credType = $assembly.GetType('org.cesar.dmplight.watchComm.business.PrintPointCredential')
      $fpType = $assembly.GetType('org.cesar.dmplight.watchComm.impl.printpoint.PrintPointFingerPrintMessage')
      $added = 0
      $needIncludeCredentials = $false
      foreach ($item in $employees) {
        $pis = [string](Get-ConfigValue $item 'pis' '')
        $name = [string](Get-ConfigValue $item 'name' '')
        $credential = [string](Get-ConfigValue $item 'credential' '')
        if (-not $pis) { throw 'Employee.pis e obrigatorio' }
        $credDigits = ($credential -replace '\D', '')
        if (-not $credDigits) { $credDigits = '0' }
        $badge6 = $credDigits.PadLeft(6, '0')
        if ($badge6.Length -gt 6) { $badge6 = $badge6.Substring($badge6.Length - 6) }
        # Empty password NullRefs inside WatchComm — always non-empty 6-digit badge.
        $password = $badge6
        try {
          if ($addFull -and $name -and $credType -and $fpType) {
            $c = [Activator]::CreateInstance($credType)
            $c.Credential = $badge6
            $c.Pis = $pis
            try { $c.Via_version = [int16]0 } catch {}
            $credArr = [Array]::CreateInstance($credType, 1)
            $credArr.SetValue($c, 0)
            $fpArr = [Array]::CreateInstance($fpType, 0)
            [void]$addFull.Invoke($watch, @($pis, $name, $password, $credArr, $fpArr))
          } elseif ($add3 -and $name) {
            [void]$add3.Invoke($watch, @($pis, $name, $password))
            if ($addCred) {
              [void]$addCred.Invoke($watch, @($badge6, $pis, [byte]0))
              $needIncludeCredentials = $true
            }
          } elseif ($add1) {
            [void]$add1.Invoke($watch, @($pis))
          } else {
            throw 'AddEmployee/AddFullEmployee overload nao encontrado'
          }
        } catch {
          throw ("AddEmployee falhou para PIS {0} cred={1}: {2}" -f $pis, $badge6, (Get-InnerMessage $_.Exception))
        }
        $added++
      }
      try {
        # IncludeCredentialList only after AddCredential — not after AddFullEmployee
        # (Full path embeds credentials; IncludeCredentialList NullRefs otherwise).
        if ($needIncludeCredentials -and $includeCred1) {
          [void]$includeCred1.Invoke($watch, @($false))
        }
      } catch {
        throw ("IncludeCredentialList falhou apos AddCredential: {0}" -f (Get-InnerMessage $_.Exception))
      }
      try {
        if ($include2) {
          # usesPassword, isTotalProgramming — PrintPoint III preferred overload
          [void]$include2.Invoke($watch, @($true, $false))
        } else {
          [void](Invoke-WatchMethod $watch $watchType 'IncludeEmployeesList' @() 0)
        }
      } catch {
        throw ("IncludeEmployeesList falhou apos AddEmployee: {0}" -f (Get-InnerMessage $_.Exception))
      }
      $data = [pscustomobject]@{
        added = $added
        usedAddCredential = $needIncludeCredentials
        note = 'PrintPoint III: badge=password 6 digitos (ex. 99 -> 000099). Funcao 91: digite 99 ou 000099, ou selecione na lista.'
      }
    }

    'remove-employee' {
      Require-PayloadFields $fields @('pis')
      $pis = [string]$fields.pis
      $pisNorm = ($pis -replace '\D', '').PadLeft(12, '0')
      $excludeError = ''
      $removedViaApi = $false
      # PrintPoint III: ExcludeEmployeesList(pis) NullRefs. Working pattern is
      # stage with AddEmployee(pis) then flush via parameterless ExcludeEmployeesList().
      try {
        $add1 = Get-WatchMethod $watchType 'AddEmployee' 1
        if ($add1) {
          [void]$add1.Invoke($watch, @($pisNorm))
        } else {
          $watch.AddEmployee($pisNorm)
        }
        try {
          $watch.ExcludeEmployeesList()
        } catch {
          [void](Invoke-WatchMethod $watch $watchType 'ExcludeEmployeesList' @() 0)
        }
        $removedViaApi = $true
      } catch {
        $excludeError = Get-InnerMessage $_.Exception
        # Fallback: string overload (works on some firmwares / when buffer already staged)
        try {
          $exclude1 = Get-WatchMethod $watchType 'ExcludeEmployeesList' 1
          if ($exclude1 -and $exclude1.GetParameters()[0].ParameterType -eq [string]) {
            [void]$exclude1.Invoke($watch, @($pisNorm))
            $removedViaApi = $true
            $excludeError = ''
          } else {
            $watch.ExcludeEmployeesList($pisNorm)
            $removedViaApi = $true
            $excludeError = ''
          }
        } catch {
          $excludeError = if ($excludeError) {
            "$excludeError | fallback: $(Get-InnerMessage $_.Exception)"
          } else {
            Get-InnerMessage $_.Exception
          }
        }
      }

      # Idempotent verify: Prefer a fresh soft-open session — Exclude often poisons the socket
      # (NullRef / type mismatch) when the PIS was already removed via function 92.
      function Test-PisPresentInList($WatchObj, [string]$WantedPis) {
        $list = @(Invoke-WatchMethod $WatchObj $watchType 'InquiryEmployeeList')
        try {
          $confirmed = @(Invoke-WatchMethod $WatchObj $watchType 'ConfirmationReceiptEmployeeList')
          if ($confirmed.Count -gt $list.Count) { $list = $confirmed }
        } catch {}
        foreach ($row in $list) {
          $rowPs = Convert-EmployeeRow $row
          $rowPis = ([string]$rowPs.pis -replace '\D', '').PadLeft(12, '0')
          if ($rowPis -eq $WantedPis) { return $true }
        }
        return $false
      }

      $stillPresent = $false
      $listReadOk = $false
      $listError = ''
      try {
        $stillPresent = Test-PisPresentInList $watch $pisNorm
        $listReadOk = $true
      } catch {
        $listError = Get-InnerMessage $_.Exception
        try {
          $verifyWatch = Open-WatchSessionFresh -Attempts 3
          if ($null -eq $verifyWatch) { throw 'sessao de verificacao indisponivel' }
          $watch = $verifyWatch
          $stillPresent = Test-PisPresentInList $watch $pisNorm
          $listReadOk = $true
          $listError = ''
        } catch {
          $listError = if ($listError) { "$listError | retry: $(Get-InnerMessage $_.Exception)" } else { Get-InnerMessage $_.Exception }
        }
      }

      if ($listReadOk -and -not $stillPresent) {
        $data = [pscustomobject]@{
          pis = $pisNorm
          removed = $removedViaApi
          alreadyAbsent = (-not $removedViaApi)
          note = $(if ($removedViaApi) { 'excluded via AddEmployee+ExcludeEmployeesList' } else { 'PIS ja ausente na lista do PrintPoint (idempotente)' })
        }
      } elseif ($removedViaApi -and -not $listReadOk) {
        $data = [pscustomobject]@{
          pis = $pisNorm
          removed = $true
          alreadyAbsent = $false
          note = 'excluded (lista nao verificada)'
        }
      } else {
        $hint = if ($excludeError) { $excludeError } else { 'PIS ainda consta na lista do PrintPoint' }
        if ($listError) { $hint = "$hint | lista: $listError" }
        throw ("Nao foi possivel remover PIS {0} do PrintPoint: {1}. Saia do menu do relogio e tente de novo, ou use confirmacao manual se ja excluiu pela funcao 92." -f $pisNorm, $hint)
      }
    }

    'exclude-fingerprint' {
      Require-PayloadFields $fields @('pis')
      $pis = [string]$fields.pis
      [void](Invoke-WatchMethod $watch $watchType 'ExcludeFingerPrint' @($pis) 1)
      $data = [pscustomobject]@{ pis = $pis; excluded = $true }
    }

    'exclude-fingerprint-orphans' {
      [void](Invoke-WatchMethod $watch $watchType 'ExcludeFingerPrintWithoutEmployee')
      $data = [pscustomobject]@{ excludedOrphans = $true }
    }

    'program-biometric-reader-use' {
      Require-PayloadFields $fields @('useReader', 'usePassword')
      $useReader = [bool]$fields.useReader
      $usePassword = [bool]$fields.usePassword
      [void](Invoke-WatchMethod $watch $watchType 'ProgramBiometricReaderUse' @($useReader, $usePassword))
      $data = [pscustomobject]@{ useReader = $useReader; usePassword = $usePassword }
    }

    'program-trigger-type' {
      Require-PayloadFields $fields @('triggerType', 'value')
      $triggerType = [byte]$fields.triggerType
      $value = [int]$fields.value
      [void](Invoke-WatchMethod $watch $watchType 'ProgramTriggerType' @($triggerType, $value))
      $data = [pscustomobject]@{ triggerType = $triggerType; value = $value }
    }

    'update-communication-user' {
      Require-PayloadFields $fields @('user', 'password')
      $user = [string]$fields.user
      $password = [string]$fields.password
      [void](Invoke-WatchMethod $watch $watchType 'UpdateCommunicationUser' @($user, $password))
      $data = [pscustomobject]@{ user = $user; updated = $true }
    }

    'set-net-info' {
      Require-PayloadFields $fields @('ip', 'mask', 'gateway', 'dns')
      $ip = [string]$fields.ip
      $mask = [string]$fields.mask
      $gateway = [string]$fields.gateway
      $dns = [string]$fields.dns
      [void](Invoke-WatchMethod $watch $watchType 'SetNetInfo' @($ip, $mask, $gateway, $dns))
      $data = [pscustomobject]@{ ip = $ip; mask = $mask; gateway = $gateway; dns = $dns }
    }

    'change-employer' {
      Require-PayloadFields $fields @('employerType', 'cnpj', 'cei', 'name', 'address')
      $employerType = Get-WatchCommEnumValue 'org.cesar.dmplight.watchComm.impl.printpoint.EmployeerType' ([string]$fields.employerType)
      $cnpj = [string]$fields.cnpj
      $cei = [string]$fields.cei
      $name = [string]$fields.name
      $address = [string]$fields.address
      $extra = Get-ConfigValue $fields 'extra' $null
      if ($null -ne $extra -and "$extra" -ne '') {
        [void](Invoke-WatchMethod $watch $watchType 'ChangeEmployer' @($employerType, $cnpj, $cei, $name, $address, [string]$extra) 6)
      } else {
        [void](Invoke-WatchMethod $watch $watchType 'ChangeEmployer' @($employerType, $cnpj, $cei, $name, $address) 5)
      }
      $data = [pscustomobject]@{
        employerType = [string]$fields.employerType
        cnpj = $cnpj
        cei = $cei
        name = $name
        address = $address
      }
    }

    default { throw ("Operacao nao implementada: {0}" -f $Operation) }
  }

  Save-Result $true $data
  Write-Host ("WatchComm {0} OK" -f $Operation)
  exit 0
} catch {
  $message = Get-InnerMessage $_.Exception
  Save-Result $false $data $message
  Write-Error $message
  exit 1
} finally {
  if ($null -ne $watch -and $null -ne $watchType) {
    try { $watch.CloseConnection() } catch {}
  }
}
