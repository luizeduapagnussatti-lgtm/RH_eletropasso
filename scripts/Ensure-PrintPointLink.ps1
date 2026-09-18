#Requires -Version 5.1
<#
.SYNOPSIS
  Estabiliza o link LAN com o PrintPoint (IP fixo) antes da coleta WatchComm.

.DESCRIPTION
  1) Ping curto para aquecer ARP
  2) Grava ARP estatico (evita perda intermitente quando o cache dinamico expira)
  3) Preflight TCP na porta do relogio (padrao 3000) com retentativas

  Uso:
    powershell -File Ensure-PrintPointLink.ps1
    powershell -File Ensure-PrintPointLink.ps1 -ClockIp 192.168.15.201 -ClockPort 3000
#>
[CmdletBinding()]
param(
  [string]$ClockIp = '192.168.15.201',
  [int]$ClockPort = 3000,
  [string]$MacAddress = '',
  [string]$InterfaceAlias = 'Ethernet',
  [int]$TcpAttempts = 6,
  [int]$TcpTimeoutMs = 3000,
  [int]$WarmPingCount = 2,
  [string]$LogDir = 'E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller',
  [switch]$SkipStaticArp
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$log = Join-Path $LogDir ("printpoint-link-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Msg, [string]$Level = 'INFO') {
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Msg
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  Write-Host $line
}

function Normalize-Mac([string]$Mac) {
  if (-not $Mac) { return '' }
  $hex = ($Mac -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
  if ($hex.Length -ne 12) { return '' }
  return ($hex -replace '(.{2})(?=.)', '$1-')
}

function Get-ArpMac([string]$Ip) {
  $lines = & arp -a $Ip 2>$null
  foreach ($line in @($lines)) {
    if ($line -match [regex]::Escape($Ip) + '\s+([0-9a-fA-F\-]{17})') {
      return Normalize-Mac $Matches[1]
    }
  }
  return ''
}

function Test-TcpPort([string]$Ip, [int]$Port, [int]$TimeoutMs) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect($Ip, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
    if (-not $ok) { return $false }
    $client.EndConnect($iar)
    return $client.Connected
  } catch {
    return $false
  } finally {
    try { $client.Close() } catch {}
  }
}

Write-Log ("Ensure-PrintPointLink {0}:{1}" -f $ClockIp, $ClockPort)

# 1) Warm ARP / ICMP
if ($WarmPingCount -gt 0) {
  $ping = Test-Connection -ComputerName $ClockIp -Count $WarmPingCount -Quiet -ErrorAction SilentlyContinue
  Write-Log ("warm ping ok={0}" -f [bool]$ping)
}

# 2) Resolve MAC
$mac = Normalize-Mac $MacAddress
if (-not $mac) { $mac = Get-ArpMac $ClockIp }
if (-not $mac) {
  # one more ping then re-read ARP
  [void](Test-Connection -ComputerName $ClockIp -Count 1 -Quiet -ErrorAction SilentlyContinue)
  Start-Sleep -Milliseconds 400
  $mac = Get-ArpMac $ClockIp
}
Write-Log ("mac={0}" -f $(if ($mac) { $mac } else { '(unknown)' }))

# 3) Static ARP (requires elevation; soft-fail if denied)
if (-not $SkipStaticArp -and $mac) {
  $macSlash = ($mac -replace '-', '/')
  try {
    $existing = Get-NetNeighbor -IPAddress $ClockIp -ErrorAction SilentlyContinue |
      Where-Object { $_.AddressFamily -eq 'IPv4' } |
      Select-Object -First 1
    if ($existing -and $existing.LinkLayerAddress -and ((Normalize-Mac $existing.LinkLayerAddress) -eq $mac) -and $existing.State -match 'Permanent|Reachable') {
      Write-Log ("ARP neighbor already present state={0}" -f $existing.State)
    } else {
      # Prefer netsh static entry on the LAN interface used by .245
      $iface = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -like '192.168.15.*' } |
        Select-Object -First 1
      $ifIndex = if ($iface) { [int]$iface.InterfaceIndex } else { $null }
      if ($ifIndex) {
        try {
          Remove-NetNeighbor -IPAddress $ClockIp -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
        } catch {}
        New-NetNeighbor -IPAddress $ClockIp -LinkLayerAddress $mac -InterfaceIndex $ifIndex -State Permanent -ErrorAction Stop | Out-Null
        Write-Log ("ARP permanent set ifIndex={0} mac={1}" -f $ifIndex, $mac)
      } else {
        $null = & netsh interface ipv4 add neighbors $InterfaceAlias $ClockIp $macSlash 2>&1
        Write-Log ("ARP via netsh alias={0} mac={1}" -f $InterfaceAlias, $mac)
      }
    }
  } catch {
    Write-Log ("ARP static WARN (rode como Admin se persistir): {0}" -f $_.Exception.Message) 'WARN'
  }
}

# 4) TCP preflight with backoff
$tcpOk = $false
for ($i = 1; $i -le $TcpAttempts; $i++) {
  $tcpOk = Test-TcpPort -Ip $ClockIp -Port $ClockPort -TimeoutMs $TcpTimeoutMs
  Write-Log ("tcp preflight {0}/{1} ok={2}" -f $i, $TcpAttempts, $tcpOk)
  if ($tcpOk) { break }
  Start-Sleep -Seconds ([Math]::Min(20, 2 * $i))
}

if (-not $tcpOk) {
  Write-Log ("FAIL TCP {0}:{1} inacessivel apos {2} tentativas" -f $ClockIp, $ClockPort, $TcpAttempts) 'ERROR'
  exit 1
}

Write-Log 'PrintPoint link OK'
exit 0
