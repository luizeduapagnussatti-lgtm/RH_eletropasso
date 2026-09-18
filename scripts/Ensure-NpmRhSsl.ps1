# Garante que rh/api-rh no NPM usem o certificado mkcert (CA em scripts/lan-client/eletropasso-lan-ca.crt).
# O certificado autoassinado antigo (CN=eletropasso.local) quebra PWA/celular após instalar a CA mkcert.
# NPM não deve voltar ao .pem legado — este script restaura a cópia ouro e recarrega o nginx.
param(
  [string]$NpmContainer = 'eletropasso_npm',
  [string]$SslSlot = 'npm-5',
  [string]$GoldenDir = 'E:\RH_eletropasso\certs\npm-mkcert',
  [string]$ExpectedIssuer = 'mkcert development CA'
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\npm'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $GoldenDir | Out-Null
$LogFile = Join-Path $LogDir ("ssl-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-Log([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Test-NpmRunning {
  try {
    docker inspect -f '{{.State.Running}}' $NpmContainer 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0 -and (docker inspect -f '{{.State.Running}}' $NpmContainer 2>$null) -eq 'true')
  } catch {
    return $false
  }
}

function Get-CertIssuerInContainer([string]$CertPath) {
  $out = docker exec $NpmContainer sh -c "openssl x509 -in '$CertPath' -noout -issuer 2>/dev/null" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
  return [string]$out
}

function Get-LiveCertIssuer {
  $out = docker exec $NpmContainer sh -c "echo | openssl s_client -connect 127.0.0.1:443 -servername rh.eletropasso.local 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
  return [string]$out
}

function Test-IssuerIsMkcert([string]$IssuerLine) {
  return ($IssuerLine -and $IssuerLine -match [regex]::Escape($ExpectedIssuer))
}

function Copy-FromContainer([string]$RemotePath, [string]$LocalPath) {
  docker cp "${NpmContainer}:${RemotePath}" $LocalPath 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed: $RemotePath" }
}

function Copy-ToContainer([string]$LocalPath, [string]$RemotePath) {
  docker cp $LocalPath "${NpmContainer}:${RemotePath}" 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed: $LocalPath -> $RemotePath" }
}

function Seed-GoldenCopyIfMissing {
  $goldenChain = Join-Path $GoldenDir 'fullchain.pem'
  $goldenKey = Join-Path $GoldenDir 'privkey.pem'
  if ((Test-Path $goldenChain) -and (Test-Path $goldenKey)) { return }

  $slotPath = "/data/custom_ssl/$SslSlot/fullchain.pem"
  $slotIssuer = Get-CertIssuerInContainer $slotPath
  if (Test-IssuerIsMkcert $slotIssuer) {
    Write-Log 'Seeding golden copy from active npm-5 mkcert'
    Copy-FromContainer $slotPath $goldenChain
    Copy-FromContainer "/data/custom_ssl/$SslSlot/privkey.pem" $goldenKey
    return
  }

  $backupList = docker exec $NpmContainer sh -c "ls -d /data/custom_ssl/${SslSlot}.bak-mkcert-* 2>/dev/null | tail -1" 2>$null
  $backupDir = ([string]$backupList).Trim()
  if ($backupDir) {
    Write-Log ("Seeding golden copy from container backup: {0}" -f $backupDir)
    Copy-FromContainer "$backupDir/fullchain.pem" $goldenChain
    Copy-FromContainer "$backupDir/privkey.pem" $goldenKey
    return
  }

  throw 'Golden mkcert copy missing and no npm-5 mkcert backup found in NPM volume.'
}

function Restore-MkcertToNpm {
  $goldenChain = Join-Path $GoldenDir 'fullchain.pem'
  $goldenKey = Join-Path $GoldenDir 'privkey.pem'
  if (-not (Test-Path $goldenChain) -or -not (Test-Path $goldenKey)) {
    throw "Missing golden files in $GoldenDir"
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $slotDir = "/data/custom_ssl/$SslSlot"
  docker exec $NpmContainer sh -c "cp '$slotDir/fullchain.pem' '$slotDir/fullchain.pem.bak-wrong-$stamp' 2>/dev/null; cp '$slotDir/privkey.pem' '$slotDir/privkey.pem.bak-wrong-$stamp' 2>/dev/null; true" | Out-Null

  Copy-ToContainer $goldenChain "$slotDir/fullchain.pem"
  Copy-ToContainer $goldenKey "$slotDir/privkey.pem"
  docker exec $NpmContainer nginx -s reload 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'nginx reload failed after SSL restore' }
}

if (-not (Test-NpmRunning)) {
  Write-Log 'NPM container not running — skipped'
  exit 0
}

try {
  Seed-GoldenCopyIfMissing
} catch {
  Write-Log ("Seed failed: {0}" -f $_.Exception.Message)
  exit 2
}

$slotChain = "/data/custom_ssl/$SslSlot/fullchain.pem"
$fileIssuer = Get-CertIssuerInContainer $slotChain
$liveIssuer = Get-LiveCertIssuer

$fileOk = Test-IssuerIsMkcert $fileIssuer
$liveOk = Test-IssuerIsMkcert $liveIssuer

if ($fileOk -and $liveOk) { exit 0 }

Write-Log ("Wrong SSL issuer fileOk={0} liveOk={1} file=[{2}] live=[{3}]" -f $fileOk, $liveOk, $fileIssuer, $liveIssuer)

try {
  Restore-MkcertToNpm
  Start-Sleep -Seconds 2
  $liveIssuer2 = Get-LiveCertIssuer
  if (-not (Test-IssuerIsMkcert $liveIssuer2)) {
    Write-Log ("Restore finished but live issuer still wrong: {0}" -f $liveIssuer2)
    exit 2
  }
  Write-Log 'mkcert SSL restored and nginx reloaded'
  exit 0
} catch {
  Write-Log ("Restore failed: {0}" -f $_.Exception.Message)
  exit 2
}
