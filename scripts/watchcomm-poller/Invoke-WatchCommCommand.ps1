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
  if (-not $create) { throw 'CreateWatchCommVB6 (10 args) nao encontrado' }

  $tcp = [Activator]::CreateInstance($tcpType)
  $tcpType.GetMethod('CreateTcpComm', [Type[]]@([string], [int])).Invoke($tcp, @($clockIp, $clockPort))
  try { $tcp.SetTimeOut(20000) } catch {}

  $watch = [Activator]::CreateInstance($watchType)
  [void]$create.Invoke($watch, @($protocol, $tcp, $equipmentId, '', $connection, $firmwareVersion, $modulusHex, $exponentHex, '', ''))
  try {
    [void]$watchType.GetMethod('OpenConnection').Invoke($watch, @())
  } catch {
    # Tolerates OpenConnection 1730 (and other soft-open failures), same as Send-WatchCommMasters.
    Write-Warning ("OpenConnection: {0}" -f (Get-InnerMessage $_.Exception))
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
        try {
          $confirmed = @(Invoke-WatchMethod $watch $watchType 'ConfirmationReceiptEmployeeList')
          if ($confirmed.Count -gt 0) { $list = $confirmed }
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
      $add3 = Get-WatchMethod $watchType 'AddEmployee' 3
      $add1 = Get-WatchMethod $watchType 'AddEmployee' 1
      $added = 0
      foreach ($item in $employees) {
        $pis = [string](Get-ConfigValue $item 'pis' '')
        $name = [string](Get-ConfigValue $item 'name' '')
        $credential = [string](Get-ConfigValue $item 'credential' '')
        if (-not $pis) { throw 'Employee.pis e obrigatorio' }
        if ($add3 -and $name) {
          [void]$add3.Invoke($watch, @($pis, $name, $credential))
        } elseif ($add1) {
          [void]$add1.Invoke($watch, @($pis))
        } else {
          throw 'AddEmployee overload nao encontrado'
        }
        $added++
      }
      [void](Invoke-WatchMethod $watch $watchType 'IncludeEmployeesList' @() 0)
      $data = [pscustomobject]@{ added = $added }
    }

    'remove-employee' {
      Require-PayloadFields $fields @('pis')
      $pis = [string]$fields.pis
      $exclude1 = Get-WatchMethod $watchType 'ExcludeEmployeesList' 1
      if ($exclude1 -and $exclude1.GetParameters()[0].ParameterType -eq [string]) {
        [void]$exclude1.Invoke($watch, @($pis))
      } else {
        [void](Invoke-WatchMethod $watch $watchType 'ExcludeEmployeesList' @() 0)
      }
      $data = [pscustomobject]@{ pis = $pis; removed = $true }
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
    try { [void]$watchType.GetMethod('CloseConnection').Invoke($watch, @()) } catch {}
  }
}
