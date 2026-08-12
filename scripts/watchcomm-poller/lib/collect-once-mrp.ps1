#requires -Version 5.1
<#
.SYNOPSIS
  Coleta MRP (marcacoes) via WatchComm TCP PrintPoint III.
  OpenConnection pode falhar com 1730; depois Reposition + InquiryMRPRecords.
.NOTES
  Rodar PowerShell x86 (SysWOW64).
#>
param(
  [string]$ClockIp = '192.168.15.201',
  [int]$ClockPort = 3000,
  [string]$ModulusHex = '916CA83A303938982FC68C1B158E3DB9E34C2CA294F35251154E9B87BF69F1E82E3E0225CFFBB9632609444DA7977A3633471B536395BBE3533506300E10544EBDCFC33FB484FE4B94FD727FA0E857B1B82EE811D6BE84AEB3B1B66DAA85DB329F5E5E74E9D8EA9F929AE781FBF16430D12229B533BEE3921358F4139E4ADBBF',
  [string]$ExponentHex = '010001',
  [int]$EquipmentId = 1,
  [string]$FirmwareVersion = '03.00.0028',
  [string]$DeviceSerial = '00003004820030709',
  [string]$StartNsr = '000000001',
  [datetime]$StartDate = [datetime]::MinValue,
  [int]$MaxBatches = 200,
  [int]$MaxRecords = 5000,
  [string]$OutJson = '',
  [switch]$ConfirmReceipt
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WatchComm-RsaCore.ps1')
Initialize-WatchCommRsa
$asm = $script:WatchCommAssembly

function Get-EnumValue([string]$TypeName, [string]$Field) {
  $t = $asm.GetType($TypeName)
  return $t.GetField($Field, [Reflection.BindingFlags]'Public,Static').GetValue($null)
}
function Write-Step([string]$Msg) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Msg)
}
function Get-InnerMessage($ex) {
  $e = $ex
  while ($e.InnerException) { $e = $e.InnerException }
  return $e.Message
}
function Convert-MrpToPunch($rec, [string]$Serial) {
  $typeName = $rec.GetType().Name
  $nsr = $(try { [string]$rec.NSR } catch { '' })
  if ($typeName -ne 'MRPRecord_RegistrationMarkingPoint') {
    return [pscustomobject]@{
      kind = 'other'
      type = $typeName
      nsr  = $nsr
      punch = $null
    }
  }
  $pis = ([string]$rec.Pis).Trim()
  $when = [datetime]$rec.DateTimeMarkingPoint
  # REP local America/Sao_Paulo (UTC-3 fixed for store; DST ignored for punch wall-clock)
  $punchedAt = ([DateTimeOffset]::new($when, [TimeSpan]::FromHours(-3))).ToString("yyyy-MM-dd'T'HH:mm:sszzz")
  $punch = [ordered]@{
    employeeId = $pis
    punchedAt  = $punchedAt
    direction  = 'UNKNOWN'
    deviceId   = $Serial
    nsr        = $nsr
    raw        = [ordered]@{
      type   = $typeName
      pis    = $pis
      source = 'watchcomm-tcp'
    }
  }
  return [pscustomobject]@{
    kind  = 'punch'
    type  = $typeName
    nsr   = $nsr
    punch = [pscustomobject]$punch
  }
}

$tcpType = $asm.GetType('org.cesar.dmplight.watchComm.api.TCPComm')
$wcType = $asm.GetType('org.cesar.dmplight.watchComm.impl.WatchComm')
$proto = Get-EnumValue 'org.cesar.dmplight.watchComm.api.WatchProtocolType' 'PrintPointIII'
$conn = Get-EnumValue 'org.cesar.dmplight.watchComm.api.WatchConnectionType' 'ConnectedMode'
$create = $wcType.GetMethods() | Where-Object {
  $_.Name -eq 'CreateWatchCommVB6' -and $_.GetParameters().Count -eq 10
} | Select-Object -First 1
$mrpMethod = $wcType.GetMethods() | Where-Object {
  $_.Name -eq 'InquiryMRPRecords' -and $_.GetParameters().Count -eq 4
} | Select-Object -First 1
$repoMethod = $wcType.GetMethod('RepositioningMRPRecordsPointer', [type[]]@([string]))
$repoDateMethod = $wcType.GetMethod('RepositioningMRPRecordsPointer', [type[]]@([datetime]))

Write-Step ("collect-once {0}:{1} startNsr={2} startDate={3}" -f $ClockIp, $ClockPort, $StartNsr, $(if ($StartDate -gt [datetime]::MinValue) { $StartDate.ToString('s') } else { '-' }))

$tcp = [Activator]::CreateInstance($tcpType)
$tcpType.GetMethod('CreateTcpComm', [Type[]]@([string], [int])).Invoke($tcp, @($ClockIp, $ClockPort))
try { $tcp.SetTimeOut(20000) } catch {}

$wc = [Activator]::CreateInstance($wcType)
$create.Invoke($wc, @($proto, $tcp, [int]$EquipmentId, '', $conn, $FirmwareVersion, $ModulusHex, $ExponentHex, '', ''))
Write-Step 'CreateWatchComm OK'

$openOk = $false
try {
  $wcType.GetMethod('OpenConnection').Invoke($wc, @())
  $openOk = $true
  Write-Step ("OpenConnection OK Connected={0}" -f $wc.Connected)
} catch {
  Write-Step ("OpenConnection WARN: {0} Connected={1}" -f (Get-InnerMessage $_.Exception), $wc.Connected)
}

$employerCnpj = $null
try {
  $employer = $wcType.GetMethod('InquiryEmployeer').Invoke($wc, @())
  $employerCnpj = [string]$employer.CPF_CNPJ
  Write-Step ("Employer OK {0}" -f $employerCnpj)
} catch {
  Write-Step ("Employer WARN: {0}" -f (Get-InnerMessage $_.Exception))
}

try {
  $repositioned = $false
  $lastRepoError = $null
  for ($attempt = 1; $attempt -le 3 -and -not $repositioned; $attempt++) {
    try {
      if ($StartDate -gt [datetime]::MinValue -and $repoDateMethod) {
        [void]$repoDateMethod.Invoke($wc, @($StartDate))
        Write-Step ("Repositioned to date {0}" -f $StartDate.ToString('s'))
      } else {
        [void]$repoMethod.Invoke($wc, @($StartNsr))
        Write-Step ("Repositioned to NSR {0}" -f $StartNsr)
      }
      $repositioned = $true
    } catch {
      $lastRepoError = Get-InnerMessage $_.Exception
      Write-Step ("Reposition attempt {0}/3 FAIL: {1}" -f $attempt, $lastRepoError)
      if ($attempt -lt 3) { Start-Sleep -Milliseconds 1200 }
    }
  }
  if (-not $repositioned) {
    throw ("Reposition failed: {0}" -f $lastRepoError)
  }
} catch {
  $failMsg = Get-InnerMessage $_.Exception
  if (-not $failMsg) { $failMsg = [string]$_.Exception.Message }
  Write-Step ("collect aborted: {0}" -f $failMsg)
  $failResult = [pscustomobject]@{
    success      = $false
    openOk       = [bool]$openOk
    clockIp      = [string]$ClockIp
    clockPort    = [int]$ClockPort
    deviceSerial = [string]$DeviceSerial
    employerCnpj = [string]$employerCnpj
    startNsr     = [string]$StartNsr
    batches      = 0
    totalNsr     = 0
    punchCount   = 0
    otherCount   = 0
    punches      = @()
    others       = @()
    error        = $failMsg
    collectedAt  = (Get-Date).ToString('o')
  }
  try {
    $wcType.GetMethod('CloseConnection').Invoke($wc, @())
  } catch {}
  if ($OutJson) {
    $dir = Split-Path -Parent $OutJson
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    ($failResult | ConvertTo-Json -Depth 8) | Set-Content -Path $OutJson -Encoding UTF8
    Write-Step ("wrote {0}" -f $OutJson)
  }
  exit 1
}

$punches = New-Object System.Collections.Generic.List[object]
$others = New-Object System.Collections.Generic.List[object]
$seenNsr = New-Object 'System.Collections.Generic.HashSet[string]'
$total = 0
$batches = 0

# Flags: changeEmployee, setClock, registrationMarkingPoint, changeCompany
# Marcacoes (tipo 3) - marking only (all=true devolveu vazio em alguns firmwares)
$flags = @($false, $false, $true, $false)

while ($batches -lt $MaxBatches -and $total -lt $MaxRecords) {
  $batches++
  $batch = $null
  try {
    $batch = $mrpMethod.Invoke($wc, $flags)
  } catch {
    Write-Step ("Inquiry batch $batches FAIL: {0}" -f (Get-InnerMessage $_.Exception))
    break
  }
  if ($null -eq $batch) {
    Write-Step ("batch $batches empty (null) - done")
    break
  }
  $arr = @($batch)
  if ($arr.Count -eq 0) {
    Write-Step ("batch $batches empty (0) - done")
    break
  }
  $newInBatch = 0
  foreach ($rec in $arr) {
    $mapped = Convert-MrpToPunch $rec $DeviceSerial
    if (-not $seenNsr.Add([string]$mapped.nsr)) { continue }
    $newInBatch++
    $total++
    if ($mapped.kind -eq 'punch') {
      $punches.Add($mapped.punch) | Out-Null
    } else {
      $others.Add([pscustomobject]@{ type = $mapped.type; nsr = $mapped.nsr }) | Out-Null
    }
    if ($total -ge $MaxRecords) { break }
  }
  Write-Step ("batch $batches got={0} new={1} punches={2}" -f $arr.Count, $newInBatch, $punches.Count)

  # Avanca ponteiro: confirma recibo + reposiciona para NSR+1 do maior NSR do lote
  $maxNsr = 0
  foreach ($rec in $arr) {
    $n = 0
    [void][int]::TryParse(([string]$rec.NSR), [ref]$n)
    if ($n -gt $maxNsr) { $maxNsr = $n }
  }
  try {
    [void]$wcType.GetMethod('ConfirmationReceiptMRPRecords').Invoke($wc, @())
  } catch {
    Write-Step ("ConfirmReceipt WARN: {0}" -f (Get-InnerMessage $_.Exception))
  }
  if ($maxNsr -gt 0) {
    $nextNsr = ($maxNsr + 1).ToString('0000000000')
    try {
      [void]$repoMethod.Invoke($wc, @($nextNsr))
      Write-Step ("advanced pointer to NSR {0}" -f $nextNsr)
    } catch {
      Write-Step ("advance WARN: {0}" -f (Get-InnerMessage $_.Exception))
    }
  }

  if ($newInBatch -eq 0) {
    Write-Step 'no new NSR in batch - stop (pointer stall)'
    break
  }
}

Write-Step ("DONE totalNsr={0} punches={1} other={2} batches={3}" -f $total, $punches.Count, $others.Count, $batches)
$punches | Select-Object -First 8 | ForEach-Object {
  Write-Host ("  punch nsr={0} pis={1} at={2}" -f $_.nsr, $_.employeeId, $_.punchedAt)
}
if ($punches.Count -eq 0 -and $others.Count -gt 0) {
  $others | Select-Object -First 8 | ForEach-Object {
    Write-Host ("  other type={0} nsr={1}" -f $_.type, $_.nsr)
  }
}

$punchArr = @($punches.ToArray())
$otherArr = @($others.ToArray() | Select-Object -First 50)
$result = [pscustomobject]@{
  success      = ($punchArr.Count -gt 0)
  openOk       = [bool]$openOk
  clockIp      = [string]$ClockIp
  clockPort    = [int]$ClockPort
  deviceSerial = [string]$DeviceSerial
  employerCnpj = [string]$employerCnpj
  startNsr     = [string]$StartNsr
  batches      = [int]$batches
  totalNsr     = [int]$total
  punchCount   = [int]$punchArr.Count
  otherCount   = [int]$others.Count
  punches      = $punchArr
  others       = $otherArr
  collectedAt  = (Get-Date).ToString('o')
}

try {
  $wcType.GetMethod('CloseConnection').Invoke($wc, @())
  Write-Step 'CloseConnection OK'
} catch {
  Write-Step ("CloseConnection WARN: {0}" -f (Get-InnerMessage $_.Exception))
}

if ($OutJson) {
  $dir = Split-Path -Parent $OutJson
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  ($result | ConvertTo-Json -Depth 8) | Set-Content -Path $OutJson -Encoding UTF8
  Write-Step ("wrote {0}" -f $OutJson)
}

if ($result.success) { exit 0 }
if ($total -gt 0) { exit 0 }
exit 2
