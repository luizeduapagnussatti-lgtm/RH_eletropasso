# Mantém upstream IPv4 do RH no Nginx Proxy Manager.
# host.docker.internal às vezes resolve só em IPv6 inacessível → "Banco indisponível".
param(
  [string]$HostIp = '192.168.15.245'
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\npm'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("upstream-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

$scriptInRepo = 'C:\xampp\htdocs\RH_eletropasso\scripts\fix-npm-rh-ipv4.py'
if (-not (Test-Path $scriptInRepo)) {
  Write-Log "Missing $scriptInRepo"
  exit 1
}

# Quick check: if conf already IPv4 and API healthy, exit
$confOk = $false
try {
  $s = docker exec eletropasso_npm sh -c "grep -F '192.168.15.245' /data/nginx/proxy_host/2.conf" 2>$null
  if ($s) { $confOk = $true }
} catch { }

$apiOk = $false
try {
  $r = Invoke-WebRequest -Uri 'https://api-rh.eletropasso.local/auth/v1/health' -UseBasicParsing -TimeoutSec 5
  if ($r.StatusCode -eq 200) { $apiOk = $true }
} catch { }

if ($confOk -and $apiOk) { exit 0 }

Write-Log ("Repair needed confOk={0} apiOk={1}" -f $confOk, $apiOk)
docker cp $scriptInRepo 'eletropasso_npm:/tmp/fix-npm-rh-ipv4.py' | Out-Null
docker exec eletropasso_npm python3 /tmp/fix-npm-rh-ipv4.py | ForEach-Object { Write-Log $_ }
docker exec eletropasso_npm nginx -s reload 2>$null | Out-Null
Start-Sleep -Seconds 2

try {
  $r2 = Invoke-WebRequest -Uri 'https://api-rh.eletropasso.local/auth/v1/health' -UseBasicParsing -TimeoutSec 5
  Write-Log ("API health after fix -> {0}" -f $r2.StatusCode)
  exit 0
} catch {
  Write-Log ("API still failing: {0}" -f $_.Exception.Message)
  exit 2
}
