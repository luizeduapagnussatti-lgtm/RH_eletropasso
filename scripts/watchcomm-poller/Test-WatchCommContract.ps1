#Requires -Version 5.1
<#
.SYNOPSIS
  Contract checks for Invoke-WatchCommCommand.ps1 against WatchComm.dll.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -ne 4) {
  $x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  if (-not (Test-Path -LiteralPath $x86)) { throw 'PowerShell x86 (SysWOW64) nao encontrado' }
  $process = Start-Process -FilePath $x86 -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath
  ) -Wait -PassThru -NoNewWindow
  exit $process.ExitCode
}

$failures = New-Object System.Collections.Generic.List[string]

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { [void]$failures.Add($Message) }
}

function Assert-HasMethod([Type]$Type, [string]$Name, [int]$MinOverloads = 1) {
  $methods = @($Type.GetMethods() | Where-Object { $_.Name -eq $Name })
  Assert-True ($methods.Count -ge $MinOverloads) ("Missing method: {0} (found {1})" -f $Name, $methods.Count)
}

$rsaCore = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\services\rep-gateway\research\WatchComm-RsaCore.ps1'))
. $rsaCore
Initialize-WatchCommRsa

$assembly = $script:WatchCommAssembly
$watchType = $assembly.GetType('org.cesar.dmplight.watchComm.impl.WatchComm')
Assert-True ($null -ne $watchType) 'WatchComm type not found'

# READ
Assert-HasMethod $watchType 'GetPrintPointStatus'
Assert-HasMethod $watchType 'GetImmediateStatus'
Assert-HasMethod $watchType 'InquirySerialNumber'
Assert-HasMethod $watchType 'GetFirmwareVersion'
Assert-HasMethod $watchType 'GetMAC'
Assert-HasMethod $watchType 'InquirySerialNumberOfREPAndMemory'
Assert-HasMethod $watchType 'InquiryEmployeer'
Assert-HasMethod $watchType 'InquiryEmployeeList'
Assert-HasMethod $watchType 'ConfirmationReceiptEmployeeList'
Assert-HasMethod $watchType 'InquiryFingerPrint'
Assert-HasMethod $watchType 'ConfirmationReceiptFingerPrint'

# WRITES
Assert-HasMethod $watchType 'SetDateTime'
Assert-HasMethod $watchType 'SetDST'
Assert-HasMethod $watchType 'RemoveDST'
Assert-HasMethod $watchType 'IncludeHolidaysList'
Assert-HasMethod $watchType 'SendDisplayMessage'
Assert-HasMethod $watchType 'ClearDisplayMessage'

# EMPLOYEES
Assert-HasMethod $watchType 'AddEmployee'
Assert-HasMethod $watchType 'IncludeEmployeesList'
Assert-HasMethod $watchType 'ExcludeEmployeesList'
Assert-HasMethod $watchType 'ExcludeFingerPrint'
Assert-HasMethod $watchType 'ExcludeFingerPrintWithoutEmployee'

# SETTINGS
Assert-HasMethod $watchType 'ProgramBiometricReaderUse'
Assert-HasMethod $watchType 'ProgramTriggerType'
Assert-HasMethod $watchType 'UpdateCommunicationUser'
Assert-HasMethod $watchType 'SetNetInfo'
Assert-HasMethod $watchType 'ChangeEmployer'

# Connection boilerplate
Assert-HasMethod $watchType 'CreateWatchCommVB6'
Assert-HasMethod $watchType 'OpenConnection'
Assert-HasMethod $watchType 'CloseConnection'
$create10 = @($watchType.GetMethods() | Where-Object {
  $_.Name -eq 'CreateWatchCommVB6' -and $_.GetParameters().Count -eq 10
})
Assert-True ($create10.Count -ge 1) 'CreateWatchCommVB6 10-arg overload missing'

$employerEnum = $assembly.GetType('org.cesar.dmplight.watchComm.impl.printpoint.EmployeerType')
Assert-True ($null -ne $employerEnum) 'EmployeerType enum missing'

$denied = @(
  'UpdateFirmware',
  'ActivateBootLoader',
  'EraseMarkingPoints',
  'ReplaceMRP',
  'ClearAllRegisters',
  'CleanEssentialVariables',
  'ExchangeSealREP'
)

foreach ($name in $denied) {
  Assert-HasMethod $watchType $name
}

$invokePath = Join-Path $PSScriptRoot 'Invoke-WatchCommCommand.ps1'
Assert-True (Test-Path -LiteralPath $invokePath) 'Invoke-WatchCommCommand.ps1 missing'
$invokeText = Get-Content -LiteralPath $invokePath -Raw -Encoding UTF8

# Extract ValidateSet block contents
$validateMatch = [regex]::Match(
  $invokeText,
  '(?s)\[ValidateSet\((?<body>.*?)\)\]',
  [Text.RegularExpressions.RegexOptions]::IgnoreCase
)
Assert-True $validateMatch.Success 'Could not parse ValidateSet from Invoke-WatchCommCommand.ps1'
$validateBody = if ($validateMatch.Success) { $validateMatch.Groups['body'].Value } else { '' }

foreach ($name in $denied) {
  $inValidate = $validateBody -match ("['`"]{0}['`"]" -f [regex]::Escape($name))
  Assert-True (-not $inValidate) ("Denylist method '{0}' must NOT appear in ValidateSet" -f $name)

  $hasDenyLiteral = $invokeText -match ("['`"]{0}['`"]" -f [regex]::Escape($name))
  Assert-True $hasDenyLiteral ("Denylist method '{0}' should be referenced in Invoke-WatchCommCommand.ps1" -f $name)
}

if ($failures.Count -gt 0) {
  Write-Host 'FAIL'
  $failures | ForEach-Object { Write-Host (" - {0}" -f $_) }
  exit 1
}

Write-Host 'PASS'
Write-Host 'WatchComm command contract OK'
exit 0
