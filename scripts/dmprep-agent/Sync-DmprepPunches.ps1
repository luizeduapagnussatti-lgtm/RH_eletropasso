#Requires -Version 5.1
<#
.SYNOPSIS
  Agente DMPREP (PC relógio) — envia batidas ao OpenHR silenciosamente.

  1) Lê novas linhas do MOVIMENT.txt (exportação DMPREP)
  2) Fallback: lê Marcacao no DIMEP.MDB (OleDb ACE/Jet)
  3) POST ingest-punches + opcional sync no servidor RH (.245)
#>
[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot 'config.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log {
  param([string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR')]$Level = 'INFO')
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
  if ($script:LogFile) {
    Add-Content -Path $script:LogFile -Value $line -Encoding UTF8
  }
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo não encontrado: $Path"
  }
  Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Save-State {
  param($State, [string]$Path)
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  ($State | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Pad-Pis12 {
  param([string]$Value)
  $digits = ($Value -replace '\D', '')
  if (-not $digits) { return $null }
  if ($digits.Length -gt 12) { $digits = $digits.Substring($digits.Length - 12) }
  return $digits.PadLeft(12, '0')
}

function Format-PunchFromParts {
  param(
    [string]$Credential12,
    [datetime]$When,
    [string]$DeviceSerial,
    [string]$Prefix = '0001'
  )
  $dd = $When.ToString('dd')
  $mm = $When.ToString('MM')
  $yyyy = $When.ToString('yyyy')
  $hh = $When.ToString('HH')
  $min = $When.ToString('mm')
  $ddmmyyyy = "$dd$mm$yyyy"
  $hhmm = "$hh$min"
  $line = "{0}{1}{2}{3}" -f $Prefix, $Credential12, $ddmmyyyy, $hhmm
  if ($line.Length -ne 28) { return $null }
  $offset = [TimeZoneInfo]::FindSystemTimeZoneById('E. South America Standard Time').GetUtcOffset($When)
  $punchedAt = ([DateTimeOffset]::new($When, $offset)).ToString("yyyy-MM-dd'T'HH:mm:sszzz")
  $nsr = "{0}:{1}:{2}{3}" -f $DeviceSerial, $Credential12, $ddmmyyyy, $hhmm
  return [PSCustomObject]@{
    line       = $line
    credential = $Credential12
    punchedAt  = $punchedAt
    nsr        = $nsr
    source     = 'UNKNOWN'
  }
}

function Parse-MovimentLine {
  param([string]$Line, [string]$DeviceSerial)
  $trimmed = $Line.Trim()
  if ($trimmed.Length -ne 28) { return $null }
  if ($trimmed -notmatch '^(\d{4})(\d{12})(\d{8})(\d{4})$') { return $null }
  $prefix = $Matches[1]
  $credential = $Matches[2]
  $ddmmyyyy = $Matches[3]
  $hhmm = $Matches[4]
  $day = $ddmmyyyy.Substring(0, 2)
  $month = $ddmmyyyy.Substring(2, 2)
  $year = $ddmmyyyy.Substring(4, 4)
  $hour = $hhmm.Substring(0, 2)
  $minute = $hhmm.Substring(2, 2)
  try {
    $when = Get-Date -Year ([int]$year) -Month ([int]$month) -Day ([int]$day) -Hour ([int]$hour) -Minute ([int]$minute) -Second 0
  } catch {
    return $null
  }
  $punch = Format-PunchFromParts -Credential12 $credential -When $when -DeviceSerial $DeviceSerial -Prefix $prefix
  if ($punch) { $punch.source = 'MOVIMENT' }
  return $punch
}

function Get-PunchesFromMoviment {
  param($Config, $State)
  $path = $Config.movimentPath
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Log "MOVIMENT.txt não encontrado: $path" 'WARN'
    return @(), $State
  }
  $item = Get-Item -LiteralPath $path
  $lines = Get-Content -LiteralPath $path -Encoding Default
  $total = $lines.Count
  $truncated = ($item.Length -lt $State.movimentFileSize) -or ($item.LastWriteTimeUtc.Ticks -lt $State.movimentLastModifiedTicks)
  $start = if ($truncated) { 0 } else { [int]$State.movimentRecordCount }
  if ($truncated) {
    Write-Log ("MOVIMENT encolheu ou foi substituido - releitura completa ({0} linhas)." -f $total) 'WARN'
  }
  $records = @()
  for ($i = $start; $i -lt $total; $i++) {
    $parsed = Parse-MovimentLine -Line $lines[$i] -DeviceSerial $Config.deviceSerial
    if ($parsed) { $records += $parsed }
  }
  $State.movimentRecordCount = $total
  $State.movimentFileSize = $item.Length
  $State.movimentLastModifiedTicks = $item.LastWriteTimeUtc.Ticks
  Write-Log "MOVIMENT: $($records.Count) linha(s) nova(s) (total arquivo: $total)."
  return $records, $State
}

function Get-OleDbConnection {
  param([string]$MdbPath)
  $providers = @(
    'Provider=Microsoft.ACE.OLEDB.12.0;Data Source={0};Persist Security Info=False;'
    'Provider=Microsoft.Jet.OLEDB.4.0;Data Source={0};'
  )
  foreach ($template in $providers) {
    $cs = $template -f $MdbPath
    try {
      $conn = New-Object System.Data.OleDb.OleDbConnection($cs)
      $conn.Open()
      Write-Log "MDB OleDb OK: $($template.Split(';')[0])"
      return $conn
    } catch {
      Write-Log "OleDb falhou ($($template.Split(';')[0])): $($_.Exception.Message)" 'WARN'
    }
  }
  return $null
}

function Get-PunchesFromMdb {
  param($Config, [datetime]$Since)
  $path = $Config.mdbPath
  if (-not (Test-Path -LiteralPath $path)) {
    Write-Log "DIMEP.MDB não encontrado: $path" 'WARN'
    return @()
  }
  $conn = Get-OleDbConnection -MdbPath $path
  if (-not $conn) {
    Write-Log 'Nenhum provider OleDb (ACE/Jet). Instale "Microsoft Access Database Engine" ou use exportação MOVIMENT.' 'WARN'
    return @()
  }
  try {
    $sinceText = $Since.ToString('yyyy-MM-dd HH:mm:ss')
    $query = @"
SELECT Data_Hora, PIS, NSR, Cracha
FROM Marcacao
WHERE Data_Hora > #$sinceText#
ORDER BY Data_Hora ASC
"@
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $query
    $reader = $cmd.ExecuteReader()
    $records = @()
    while ($reader.Read()) {
      $rawDate = $reader['Data_Hora']
      if ($null -eq $rawDate -or [string]::IsNullOrWhiteSpace("$rawDate")) { continue }
      $when = [datetime]$rawDate
      $pis = Pad-Pis12 ("" + $reader['PIS'])
      if (-not $pis) {
        $pis = Pad-Pis12 ("" + $reader['Cracha'])
      }
      if (-not $pis) { continue }
      $punch = Format-PunchFromParts -Credential12 $pis -When $when -DeviceSerial $Config.deviceSerial -Prefix $Config.movimentPrefix
      if ($punch) {
        $punch.source = 'MDB'
        $records += $punch
      }
    }
    $reader.Close()
    Write-Log "MDB Marcacao: $($records.Count) registro(s) desde $sinceText."
    return $records
  } finally {
    $conn.Close()
  }
}

function Merge-PunchesByNsr {
  param([array]$Items)
  $map = @{}
  if ($Items) {
    foreach ($p in $Items) {
      if ($p -and $p.nsr) { $map[$p.nsr] = $p }
    }
  }
  if ($map.Count -eq 0) { return @() }
  return @($map.Values | Sort-Object { $_.punchedAt })
}

function Send-IngestBatch {
  param($Config, [array]$Batch)
  $body = @{
    organizationId = $Config.organizationId
    deviceSerial   = $Config.deviceSerial
    punches        = @(
      $Batch | ForEach-Object {
        @{
          employeeId = $_.credential
          punchedAt  = $_.punchedAt
          direction  = 'UNKNOWN'
          source     = 'CLOCK'
          deviceId   = $Config.deviceSerial
          nsr        = $_.nsr
          raw        = @{ agent = 'dmprep-agent'; origin = $_.source }
        }
      }
    )
  } | ConvertTo-Json -Depth 6 -Compress

  $headers = @{
    'Content-Type' = 'application/json'
    'x-ingest-key' = $Config.ingestApiKey
  }
  $timeoutSec = [int]$Config.timeoutSeconds
  if ($timeoutSec -lt 15) { $timeoutSec = 15 }

  # Ignora certificado autoassinado na LAN (NPM local).
  if (-not ('TrustAllCertsPolicy' -as [type])) {
    Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class TrustAllCertsPolicy : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint srvPoint, X509Certificate certificate, WebRequest request, int certificateProblem) { return true; }
}
"@
  }
  [System.Net.ServicePointManager]::CertificatePolicy = New-Object TrustAllCertsPolicy
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $response = Invoke-RestMethod -Uri $Config.ingestUrl -Method Post -Headers $headers -Body $body -TimeoutSec $timeoutSec
  return $response
}

function Invoke-RemoteDmprepSync {
  param($Config)
  if (-not $Config.triggerRemoteSync) { return $null }
  $url = ($Config.syncServerUrl.TrimEnd('/')) + '/sync'
  $headers = @{
    'Content-Type'     = 'application/json'
    'x-dmprep-sync-key' = $Config.syncApiKey
  }
  $body = '{"scope":"punches"}'
  try {
    $result = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -TimeoutSec ([int]$Config.timeoutSeconds)
    $remoteSkipped = 0
    if ($result.punches -and $null -ne $result.punches.skippedPunches) {
      $remoteSkipped = [int]$result.punches.skippedPunches
    }
    Write-Log ("Sync remoto .245: inserted={0} duplicates={1} skipped={2}" -f $result.punches.inserted, $result.punches.duplicates, $remoteSkipped)
    return $result
  } catch {
    Write-Log "Sync remoto .245 falhou (não crítico): $($_.Exception.Message)" 'WARN'
    return $null
  }
}

function Append-LinesToMoviment {
  param($Config, [array]$Punches, [hashtable]$ExistingLines)
  if (-not $Config.appendMdbToMoviment) { return 0 }
  $path = $Config.movimentPath
  $added = 0
  $toAppend = New-Object System.Collections.Generic.List[string]
  foreach ($p in $Punches) {
    if ($p.source -ne 'MDB') { continue }
    if ($ExistingLines.ContainsKey($p.line)) { continue }
    $toAppend.Add($p.line)
    $ExistingLines[$p.line] = $true
    $added++
  }
  if ($added -gt 0) {
    Add-Content -LiteralPath $path -Value $toAppend -Encoding Default
    Write-Log "MOVIMENT.txt: $added linha(s) append (origem MDB)."
  }
  return $added
}

# --- Main ---
try {
  $config = Read-JsonFile -Path $ConfigPath
  $logDir = $config.logDir
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $script:LogFile = Join-Path $logDir ("sync-{0}.log" -f (Get-Date -Format 'yyyyMMdd'))
  Write-Log '=== DMPREP agent start ==='

  $statePath = $config.statePath
  $defaultSince = (Get-Date).Date.AddDays(-1 * [int]$config.lookbackDays)
  $state = if (Test-Path -LiteralPath $statePath) {
    Read-JsonFile -Path $statePath
  } else {
    [PSCustomObject]@{
      movimentRecordCount       = 0
      movimentFileSize          = 0
      movimentLastModifiedTicks = 0
      mdbWatermark            = $defaultSince.ToString('o')
      lastSuccessAt           = $null
      lastInserted            = 0
    }
  }

  $mdbSince = [datetime]$state.mdbWatermark
  $movimentPunches, $state = Get-PunchesFromMoviment -Config $config -State $state
  $mdbPunches = Get-PunchesFromMdb -Config $config -Since $mdbSince

  $allPunches = Merge-PunchesByNsr -Items (@($movimentPunches) + @($mdbPunches))
  if (-not $allPunches -or @($allPunches).Count -eq 0) {
    Write-Log 'Nenhuma batida nova encontrada.'
    $state.lastSuccessAt = (Get-Date).ToString('o')
    Save-State -State $state -Path $statePath
    exit 0
  }

  $existingMoviment = @{}
  if (Test-Path -LiteralPath $config.movimentPath) {
    Get-Content -LiteralPath $config.movimentPath -Encoding Default | ForEach-Object {
      $t = $_.Trim()
      if ($t) { $existingMoviment[$t] = $true }
    }
  }
  [void](Append-LinesToMoviment -Config $config -Punches $allPunches -ExistingLines $existingMoviment)

  $batchSize = [int]$config.batchSize
  if ($batchSize -lt 1) { $batchSize = 100 }
  if ($batchSize -gt 100) { $batchSize = 100 }

  $totalInserted = 0
  $totalDuplicates = 0
  $totalSkipped = 0
  $maxPunchedAt = $mdbSince

  for ($offset = 0; $offset -lt $allPunches.Count; $offset += $batchSize) {
    $batch = $allPunches[$offset..([Math]::Min($offset + $batchSize - 1, $allPunches.Count - 1))]
    try {
      $result = Send-IngestBatch -Config $config -Batch $batch
      $ins = if ($null -ne $result.inserted) { [int]$result.inserted } else { 0 }
      $dup = if ($null -ne $result.duplicates) { [int]$result.duplicates } elseif ($null -ne $result.upserted) { [int]$result.upserted } else { 0 }
      $skp = if ($null -ne $result.skipped) { [int]$result.skipped } else { 0 }
      $totalInserted += $ins
      $totalDuplicates += $dup
      $totalSkipped += $skp
      Write-Log ("Lote {0}: inserted={1} duplicates={2} skipped={3}" -f ($offset / $batchSize + 1), $ins, $dup, $skp)
      if ($result.skippedEmployeeIds) {
        Write-Log ("PIS ignorados: {0}" -f (($result.skippedEmployeeIds | ForEach-Object { $_ }) -join ', ')) 'WARN'
      }
    } catch {
      Write-Log "Falha no lote $($offset / $batchSize + 1): $($_.Exception.Message)" 'ERROR'
      throw
    }
    foreach ($p in $batch) {
      $dt = [datetimeoffset]::Parse($p.punchedAt).UtcDateTime
      if ($dt -gt $maxPunchedAt) { $maxPunchedAt = $dt }
    }
  }

  $state.mdbWatermark = $maxPunchedAt.AddSeconds(1).ToString('o')
  $state.lastSuccessAt = (Get-Date).ToString('o')
  $state.lastInserted = $totalInserted
  Save-State -State $state -Path $statePath

  Write-Log ("Concluído: enviadas={0} duplicatas={1} ignoradas={2} total_candidatas={3}" -f $totalInserted, $totalDuplicates, $totalSkipped, $allPunches.Count)

  Invoke-RemoteDmprepSync -Config $config | Out-Null
  Write-Log '=== DMPREP agent OK ==='
  exit 0
} catch {
  Write-Log ("FATAL: {0}" -f $_.Exception.Message) 'ERROR'
  exit 1
}
