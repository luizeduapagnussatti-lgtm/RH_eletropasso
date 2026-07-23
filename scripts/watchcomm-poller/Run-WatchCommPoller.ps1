#Requires -Version 5.1
<#
.SYNOPSIS
  Poller WatchComm TCP — coleta MRP no PrintPoint (:3000) e envia ao ingest-punches.

  Deve rodar sob PowerShell x86 (SysWOW64) por causa do WatchComm.dll 32-bit.
  Agendado tipicamente a cada 1 hora via Task Scheduler.
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json'),
  [switch]$Bootstrap
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([IntPtr]::Size -ne 4) {
  $x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
  if (-not (Test-Path -LiteralPath $x86)) { throw 'PowerShell x86 (SysWOW64) nao encontrado' }
  $argList = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath,
    '-ConfigPath', $ConfigPath
  )
  if ($Bootstrap) { $argList += '-Bootstrap' }
  $p = Start-Process -FilePath $x86 -ArgumentList $argList -Wait -PassThru -NoNewWindow
  exit $p.ExitCode
}

function Write-Log {
  param([string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR')]$Level = 'INFO')
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  Write-Host $line
  if ($script:LogFile) {
    Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8
  }
}

function Read-JsonFile([string]$Path) {
  Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Save-JsonFile($Object, [string]$Path) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  ($Object | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Write-CycleResult(
  [string]$ResultPath,
  [bool]$Success,
  [int]$ExitCode,
  [int]$Collected,
  [int]$Forwarded,
  [int]$Inserted,
  [int]$LastNsr,
  [string]$ErrorMessage = ''
) {
  if (-not $ResultPath) { return }
  $duplicates = [Math]::Max(0, $Forwarded - $Inserted)
  Save-JsonFile ([pscustomobject]@{
    success   = $Success
    exitCode  = $ExitCode
    collected = $Collected
    forwarded = $Forwarded
    inserted  = $Inserted
    duplicates = $duplicates
    skippedPunches = 0
    skippedEmployeeIds = @()
    lastNsr   = $LastNsr
    finishedAt = (Get-Date).ToString('o')
    error     = $(if ($ErrorMessage) { $ErrorMessage } else { $null })
  }) $ResultPath
}

function Ensure-TrustAllCerts {
  if (-not ('TrustAllCertsPolicy' -as [type])) {
    Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p) { return true; }
}
"@
  }
  [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
}

function Send-Ingest([object]$Config, [array]$Punches) {
  if (-not $Punches -or $Punches.Count -eq 0) {
    return [pscustomobject]@{ success = $true; inserted = 0; upserted = 0 }
  }
  $payload = @{
    organizationId = $Config.organizationId
    deviceSerial   = $Config.deviceSerial
    punches        = @(
      $Punches | ForEach-Object {
        @{
          employeeId = $_.employeeId
          punchedAt  = $_.punchedAt
          direction  = $(if ($_.direction) { $_.direction } else { 'UNKNOWN' })
          source     = 'CLOCK'
          deviceId   = $Config.deviceSerial
          nsr        = $_.nsr
          raw        = @{
            agent  = 'watchcomm-poller'
            origin = 'watchcomm-tcp'
            detail = $_.raw
          }
        }
      }
    )
  }
  $body = $payload | ConvertTo-Json -Depth 8 -Compress
  $headers = @{
    'Content-Type' = 'application/json'
    'x-ingest-key' = $Config.ingestApiKey
  }
  $timeout = [int]$Config.timeoutSeconds
  if ($timeout -lt 15) { $timeout = 15 }
  Ensure-TrustAllCerts
  return Invoke-RestMethod -Uri $Config.ingestUrl -Method Post -Headers $headers -Body $body -TimeoutSec $timeout
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config nao encontrado: $ConfigPath (copie config.example.json)"
}

$Config = Read-JsonFile $ConfigPath
$logDir = [string]$Config.logDir
if (-not $logDir) { $logDir = Join-Path $PSScriptRoot 'logs' }
if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$script:LogFile = Join-Path $logDir ("poller-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))

$statePath = [string]$Config.statePath
if (-not $statePath) { $statePath = Join-Path $logDir 'state.json' }
$resultPath = [string]$Config.resultPath
if (-not $resultPath) { $resultPath = Join-Path $logDir 'last-cycle-result.json' }

$state = [pscustomobject]@{
  lastNsr     = 0
  lastRunAt   = $null
  bootstrapped = $false
  lastPunchCount = 0
  lastIngestInserted = 0
}
if (Test-Path -LiteralPath $statePath) {
  $loaded = Read-JsonFile $statePath
  if ($null -ne $loaded.lastNsr) { $state.lastNsr = [int]$loaded.lastNsr }
  if ($null -ne $loaded.bootstrapped) { $state.bootstrapped = [bool]$loaded.bootstrapped }
  if ($loaded.lastRunAt) { $state.lastRunAt = [string]$loaded.lastRunAt }
}

$collectScript = [string]$Config.collectScript
if (-not $collectScript) {
  $collectScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\services\rep-gateway\research\collect-once-mrp.ps1'))
}
if (-not (Test-Path -LiteralPath $collectScript)) {
  throw "collect-once-mrp.ps1 nao encontrado: $collectScript"
}

$doBootstrap = $Bootstrap -or (-not $state.bootstrapped)
$startNsrNum = if ($state.lastNsr -gt 0) { $state.lastNsr + 1 } else { 1 }
$startNsr = $startNsrNum.ToString('0000000000')

$outJson = Join-Path $logDir ('collect-{0}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$maxBatches = [int]$Config.maxBatchesPerCycle
if ($maxBatches -le 0) { $maxBatches = 80 }
$maxRecords = [int]$Config.maxRecordsPerCycle
if ($maxRecords -le 0) { $maxRecords = 200 }

Write-Log ("cycle start startNsr={0} bootstrap={1} forward={2}" -f $startNsr, $doBootstrap, [bool]$Config.forwardEnabled)

$selfX86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
$collectArgList = New-Object System.Collections.Generic.List[string]
@(
  '-NoProfile', '-ExecutionPolicy', 'Bypass',
  '-File', $collectScript,
  '-ClockIp', ([string]$Config.clockIp),
  '-ClockPort', ([string][int]$Config.clockPort),
  '-DeviceSerial', ([string]$Config.deviceSerial),
  '-FirmwareVersion', ([string]$Config.firmwareVersion),
  '-EquipmentId', ([string][int]$Config.equipmentId),
  '-ModulusHex', ([string]$Config.modulusHex),
  '-ExponentHex', ([string]$Config.exponentHex),
  '-MaxBatches', ([string]$maxBatches),
  '-MaxRecords', ([string]$maxRecords),
  '-OutJson', $outJson
) | ForEach-Object { [void]$collectArgList.Add($_) }

if ($doBootstrap) {
  # Bootstrap: so a partir de ontem (evita dump de anos de historico)
  $bootDate = (Get-Date).Date.AddDays(-1)
  [void]$collectArgList.Add('-StartDate')
  [void]$collectArgList.Add($bootDate.ToString('yyyy-MM-dd'))
  Write-Log ("bootstrap reposition date={0}" -f $bootDate.ToString('yyyy-MM-dd'))
} else {
  [void]$collectArgList.Add('-StartNsr')
  [void]$collectArgList.Add($startNsr)
}

$collectProc = Start-Process -FilePath $selfX86 -ArgumentList $collectArgList.ToArray() -Wait -PassThru -NoNewWindow
$collectExit = $collectProc.ExitCode
if ($null -eq $collectExit) { $collectExit = -1 }

if (-not (Test-Path -LiteralPath $outJson)) {
  Write-Log ("collect nao gerou JSON (exit={0})" -f $collectExit) 'ERROR'
  Write-CycleResult -ResultPath $resultPath -Success $false -ExitCode 1 `
    -Collected 0 -Forwarded 0 -Inserted 0 -LastNsr ([int]$state.lastNsr) `
    -ErrorMessage ("collect failed exit={0}" -f $collectExit)
  exit 1
}

$result = Read-JsonFile $outJson
$punches = @()
if ($result.punches) { $punches = @($result.punches) }

$maxSeen = [int]$state.lastNsr
foreach ($p in $punches) {
  $n = 0
  if ([int]::TryParse([string]$p.nsr, [ref]$n) -and $n -gt $maxSeen) { $maxSeen = $n }
}

Write-Log ("collect exit={0} punches={1} maxNsr={2}" -f $collectExit, $punches.Count, $maxSeen)

if ($doBootstrap) {
  if ($maxSeen -le 0) {
    Write-Log 'bootstrap janela recente vazia - Find-MaxNsr para watermark' 'WARN'
    $findScript = Join-Path $PSScriptRoot 'Find-MaxNsr.ps1'
    $findOut = & $selfX86 -NoProfile -ExecutionPolicy Bypass -File $findScript `
      -ClockIp ([string]$Config.clockIp) `
      -ClockPort ([int]$Config.clockPort) `
      -ModulusHex ([string]$Config.modulusHex) `
      -FirmwareVersion ([string]$Config.firmwareVersion)
    $maxLine = @($findOut | Where-Object { $_ -match 'MAX_NSR=(\d+)' } | Select-Object -Last 1)
    if ($maxLine -match 'MAX_NSR=(\d+)') {
      $maxSeen = [int]$Matches[1]
    } else {
      $jsonLine = @($findOut | Where-Object { $_ -match 'maxNsr' } | Select-Object -Last 1)
      if ($jsonLine) {
        try {
          $parsed = $jsonLine | ConvertFrom-Json
          if ($parsed.maxNsr) { $maxSeen = [int]$parsed.maxNsr }
        } catch {}
      }
    }
    Write-Log ("bootstrap Find-MaxNsr maxNsr={0}" -f $maxSeen)
  }
  # Primeira execucao: marca watermark sem reenviar historico antigo ao RH.
  $state.lastNsr = $maxSeen
  $state.bootstrapped = $true
  $state.lastRunAt = (Get-Date).ToString('o')
  $state.lastPunchCount = $punches.Count
  $state.lastIngestInserted = 0
  Save-JsonFile $state $statePath
  Write-Log ("bootstrap OK watermark lastNsr={0} (historico nao enviado)" -f $state.lastNsr)
  Write-CycleResult -ResultPath $resultPath -Success $true -ExitCode 0 `
    -Collected $punches.Count -Forwarded 0 -Inserted 0 -LastNsr ([int]$state.lastNsr)
  exit 0
}

$toSend = @($punches | Where-Object {
  $n = 0
  [void][int]::TryParse([string]$_.nsr, [ref]$n)
  $n -gt [int]$state.lastNsr
})

$inserted = 0
if ($Config.forwardEnabled -and $toSend.Count -gt 0) {
  if (-not $Config.ingestApiKey -or $Config.ingestApiKey -eq 'CHANGE_ME') {
    Write-Log 'ingestApiKey nao configurado - pulando forward' 'WARN'
  } else {
    try {
      $resp = Send-Ingest -Config $Config -Punches $toSend
      if ($null -ne $resp.inserted) { $inserted = [int]$resp.inserted }
      Write-Log ("ingest ok sent={0} inserted={1}" -f $toSend.Count, $inserted)
    } catch {
      Write-Log ("ingest FAIL: {0}" -f $_.Exception.Message) 'ERROR'
      Write-CycleResult -ResultPath $resultPath -Success $false -ExitCode 2 `
        -Collected $punches.Count -Forwarded $toSend.Count -Inserted 0 -LastNsr ([int]$state.lastNsr) `
        -ErrorMessage $_.Exception.Message
      exit 2
    }
  }
} else {
  Write-Log ("nada novo para enviar (toSend={0})" -f $toSend.Count)
}

if ($maxSeen -gt [int]$state.lastNsr) {
  $state.lastNsr = $maxSeen
}
$state.bootstrapped = $true
$state.lastRunAt = (Get-Date).ToString('o')
$state.lastPunchCount = $punches.Count
$state.lastIngestInserted = $inserted
Save-JsonFile $state $statePath
Write-CycleResult -ResultPath $resultPath -Success $true -ExitCode 0 `
  -Collected $punches.Count -Forwarded $toSend.Count -Inserted $inserted -LastNsr ([int]$state.lastNsr)

# limpa JSON intermediario antigo (mantem o ultimo)
Get-ChildItem -LiteralPath $logDir -Filter 'collect-*.json' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 5 |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit 0
