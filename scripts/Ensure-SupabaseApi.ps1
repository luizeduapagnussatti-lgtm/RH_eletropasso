# Health check leve da API/banco RH (Supabase via Kong).
# Não reinicia o Docker Desktop inteiro (evita derrubar Chatwoot/Evolution).
param()

$ErrorActionPreference = 'Continue'
$LogDir = 'E:\RH_eletropasso\logs\supabase'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("health-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Test-Url([string]$Url) {
  try {
    $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

$localOk = Test-Url 'http://127.0.0.1:54321/auth/v1/health'
$proxyOk = Test-Url 'https://api-rh.eletropasso.local/auth/v1/health'
$dbOk = $false
try {
  docker exec supabase_db_RH_eletropasso pg_isready -U postgres 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $dbOk = $true }
} catch { }

if ($localOk -and $proxyOk -and $dbOk) { exit 0 }

Write-Log ("Unhealthy local={0} proxy={1} db={2}" -f $localOk, $proxyOk, $dbOk)

# Soft recovery: restart only RH API containers (not chat / not Docker Desktop)
if (-not $dbOk -or -not $localOk) {
  Write-Log 'Restarting supabase_kong + auth + rest + db (soft)'
  docker restart supabase_db_RH_eletropasso supabase_kong_RH_eletropasso supabase_auth_RH_eletropasso supabase_rest_RH_eletropasso 2>&1 | ForEach-Object { Write-Log $_ }
  Start-Sleep -Seconds 8
}

# Fix NPM upstream if local API is up but proxy fails
if ((Test-Url 'http://127.0.0.1:54321/auth/v1/health') -and -not (Test-Url 'https://api-rh.eletropasso.local/auth/v1/health')) {
  Write-Log 'Proxy failing while local OK — running Ensure-NpmRhUpstream'
  $npmFix = 'C:\xampp\htdocs\RH_eletropasso\scripts\Ensure-NpmRhUpstream.ps1'
  if (Test-Path $npmFix) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $npmFix
  }
}

$localOk2 = Test-Url 'http://127.0.0.1:54321/auth/v1/health'
$proxyOk2 = Test-Url 'https://api-rh.eletropasso.local/auth/v1/health'
Write-Log ("After recovery local={0} proxy={1}" -f $localOk2, $proxyOk2)
if ($localOk2 -and $proxyOk2) { exit 0 }
exit 2
