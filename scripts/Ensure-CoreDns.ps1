# Garante o DNS Split Tailscale (eletropasso.local) via CoreDNS.
# - Bind só no IP Tailscale :53 (ICS/SharedAccess já ocupa 0.0.0.0:53 na LAN).
# - Respostas A apontam para o IP Tailscale, para o PWA abrir no overlay sem depender de subnet route.
# Usado por start-rh.ps1 e pelo watchdog RH_Eletropasso_CoreDns_Watchdog.

$ErrorActionPreference = "Continue"

$ProjectRoot = "C:\xampp\htdocs\RH_eletropasso"
$CoreDir = Join-Path $ProjectRoot "scripts\lan-client\coredns"
$Corefile = Join-Path $CoreDir "Corefile"
$Container = "eletropasso-coredns"
$Image = "coredns/coredns:1.11.3"

function Get-TailscaleIPv4 {
  try {
    $raw = & tailscale ip -4 2>$null | Select-Object -First 1
    $ip = ([string]$raw).Trim()
    if ($ip -match '^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$') { return $ip }
  } catch {}
  return $null
}

function New-CorefileContent([string]$AnswerIp) {
  return @"
eletropasso.local:53 {
    errors
    log
    hosts {
        $AnswerIp rh.eletropasso.local
        $AnswerIp api-rh.eletropasso.local
        $AnswerIp atendimento.eletropasso.local
        $AnswerIp evolution.eletropasso.local
        $AnswerIp proxy.eletropasso.local
        fallthrough
    }
}
.:53 {
    errors
    forward . 8.8.8.8 1.1.1.1
}
"@
}

function Test-DnsA([string]$ServerIp, [string]$Name, [string]$ExpectIp) {
  if (-not $ServerIp -or -not $ExpectIp) { return $false }
  try {
    $ans = Resolve-DnsName -Name $Name -Server $ServerIp -Type A -DnsOnly -NoHostsFile -ErrorAction Stop
    return [bool]($ans | Where-Object { $_.IPAddress -eq $ExpectIp })
  } catch {
    $out = & nslookup.exe $Name $ServerIp 2>&1 | Out-String
    return ($out -match [regex]::Escape($ExpectIp))
  }
}

function Get-PublishedBinds {
  $raw = docker inspect $Container --format '{{range $p, $conf := .HostConfig.PortBindings}}{{$p}}={{(index $conf 0).HostIp}}:{{(index $conf 0).HostPort}};{{end}}' 2>$null
  return [string]$raw
}

function Try-AllowDnsFirewall {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) { return }
  foreach ($proto in @('UDP', 'TCP')) {
    $name = "RH Eletropasso CoreDNS $proto 53"
    if (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue) { continue }
    try {
      New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol $proto -LocalPort 53 |
        Out-Null
      Write-Host "Firewall: allowed inbound $proto/53"
    } catch {
      Write-Host "Firewall skip (${proto}/53): $($_.Exception.Message)"
    }
  }
}

$TsIp = Get-TailscaleIPv4
if (-not $TsIp) {
  Write-Warning "Tailscale IPv4 not ready — skipping CoreDNS ensure."
  exit 0
}

New-Item -ItemType Directory -Force -Path $CoreDir | Out-Null
$desired = New-CorefileContent -AnswerIp $TsIp
$current = ""
if (Test-Path $Corefile) {
  $current = [System.IO.File]::ReadAllText($Corefile)
}
$corefileChanged = ($current.Trim() -ne $desired.Trim())
if ($corefileChanged) {
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Corefile, $desired, $utf8)
  Write-Host "Updated $Corefile (A -> $TsIp)"
}

$running = docker ps --filter "name=^/${Container}$" --format "{{.Names}}" 2>$null
$exists = docker ps -a --filter "name=^/${Container}$" --format "{{.Names}}" 2>$null
$binds = ""
if ($exists -eq $Container) { $binds = Get-PublishedBinds }

$needTs = $binds -notmatch [regex]::Escape("${TsIp}:53")
$healthyTs = $false
if ($running -eq $Container -and -not $needTs) {
  $healthyTs = Test-DnsA -ServerIp $TsIp -Name "rh.eletropasso.local" -ExpectIp $TsIp
}

$recreate = $false
if ($exists -ne $Container) { $recreate = $true }
elseif ($corefileChanged) { $recreate = $true }
elseif ($needTs) { $recreate = $true }
elseif ($running -ne $Container) { $recreate = $true }
elseif (-not $healthyTs) { $recreate = $true }

if (-not $recreate) {
  docker update --restart unless-stopped $Container 2>$null | Out-Null
  Write-Host ("eletropasso-coredns healthy (A={0} via {0}:53)." -f $TsIp)
  Try-AllowDnsFirewall
  exit 0
}

Write-Host ("Recreating eletropasso-coredns (ts={0})..." -f $TsIp)
if ($exists -eq $Container) {
  docker rm -f $Container 2>&1 | Out-Host
}

# Só o IP Tailscale: ICS (SharedAccess) já ocupa 0.0.0.0:53 na LAN; bind extra em
# 192.168.15.245:53 quebra o userland-proxy do Docker Desktop (127.0.0.1:ephemeral).
docker run -d --name $Container --restart unless-stopped `
  -p "${TsIp}:53:53/udp" -p "${TsIp}:53:53/tcp" `
  -v "${CoreDir}/Corefile:/Corefile" `
  $Image -conf /Corefile 2>&1 | Out-Host

Start-Sleep -Seconds 2
$okTs = Test-DnsA -ServerIp $TsIp -Name "rh.eletropasso.local" -ExpectIp $TsIp
Write-Host ("DNS health ts:{0} (expect A={1})" -f $okTs, $TsIp)
if (-not $okTs) {
  Write-Warning ("CoreDNS on {0}:53 did not return {0} for rh.eletropasso.local" -f $TsIp)
}
Try-AllowDnsFirewall
