#requires -Version 5.1
# Encontra o maior NSR de marcacao (probe exponencial + drain linear).
param(
  [string]$ClockIp = '192.168.15.201',
  [int]$ClockPort = 3000,
  [string]$ModulusHex = '916CA83A303938982FC68C1B158E3DB9E34C2CA294F35251154E9B87BF69F1E82E3E0225CFFBB9632609444DA7977A3633471B536395BBE3533506300E10544EBDCFC33FB484FE4B94FD727FA0E857B1B82EE811D6BE84AEB3B1B66DAA85DB329F5E5E74E9D8EA9F929AE781FBF16430D12229B533BEE3921358F4139E4ADBBF',
  [string]$FirmwareVersion = '03.00.0028'
)
$ErrorActionPreference = 'Stop'
$core = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\services\rep-gateway\research\WatchComm-RsaCore.ps1'))
. $core
Initialize-WatchCommRsa
$asm = $script:WatchCommAssembly
function EnumV($tn,$f){ $asm.GetType($tn).GetField($f,'Public,Static').GetValue($null) }

$tcpType=$asm.GetType('org.cesar.dmplight.watchComm.api.TCPComm')
$wcType=$asm.GetType('org.cesar.dmplight.watchComm.impl.WatchComm')
$proto=EnumV 'org.cesar.dmplight.watchComm.api.WatchProtocolType' 'PrintPointIII'
$conn=EnumV 'org.cesar.dmplight.watchComm.api.WatchConnectionType' 'ConnectedMode'
$create=$wcType.GetMethods()|?{ $_.Name -eq 'CreateWatchCommVB6' -and $_.GetParameters().Count -eq 10 }|select -First 1
$mrp=$wcType.GetMethods()|?{ $_.Name -eq 'InquiryMRPRecords' -and $_.GetParameters().Count -eq 4 }|select -First 1
$repo=$wcType.GetMethod('RepositioningMRPRecordsPointer',[type[]]@([string]))

$tcp=[Activator]::CreateInstance($tcpType)
$tcpType.GetMethod('CreateTcpComm',[type[]]@([string],[int])).Invoke($tcp,@($ClockIp,$ClockPort))
try{$tcp.SetTimeOut(8000)}catch{}
$wc=[Activator]::CreateInstance($wcType)
$create.Invoke($wc,@($proto,$tcp,1,'',$conn,$FirmwareVersion,$ModulusHex,'010001','',''))
try{[void]$wcType.GetMethod('OpenConnection').Invoke($wc,@())}catch{}

function Get-NextMarkingNsr([int]$from) {
  $nsr = $from.ToString('0000000000')
  [void]$repo.Invoke($wc,@($nsr))
  $batch = $mrp.Invoke($wc,@($false,$false,$true,$false))
  if ($null -eq $batch) { return 0 }
  $arr = @($batch)
  if ($arr.Count -eq 0) { return 0 }
  $n = 0
  [void][int]::TryParse([string]$arr[0].NSR, [ref]$n)
  try { [void]$wcType.GetMethod('ConfirmationReceiptMRPRecords').Invoke($wc,@()) } catch {}
  # Se voltou NSR menor que o pedido, ponteiro nao avancou / fim da memoria
  if ($n -lt $from) { return 0 }
  return $n
}

$best = 0
$n = Get-NextMarkingNsr 1
if ($n -gt 0) { $best = $n; Write-Host "first=$n" }

# Exponential growth while results keep advancing
$step = 100
$probe = $best + $step
while ($probe -gt 0) {
  $n = Get-NextMarkingNsr $probe
  Write-Host ("probe {0} -> {1}" -f $probe, $n)
  if ($n -le 0) { break }
  $best = $n
  $step = [Math]::Min(50000, $step * 2)
  $probe = $best + $step
}

# Binary refine between best and best+step (last failed region)
$lo = $best + 1
$hi = $best + $step
while ($lo -le $hi) {
  $mid = [int](($lo + $hi) / 2)
  $n = Get-NextMarkingNsr $mid
  Write-Host ("bin {0} -> {1}" -f $mid, $n)
  if ($n -le 0) {
    $hi = $mid - 1
  } else {
    $best = $n
    $lo = $n + 1
  }
}

# Short linear drain
$from = $best + 1
for ($i = 0; $i -lt 50; $i++) {
  $n = Get-NextMarkingNsr $from
  if ($n -le 0) { break }
  $best = $n
  $from = $n + 1
}

try{[void]$wcType.GetMethod('CloseConnection').Invoke($wc,@())}catch{}
Write-Host ("MAX_NSR=$best")
# Also write to stdout object for poller
[pscustomobject]@{ maxNsr = $best } | ConvertTo-Json
exit 0
