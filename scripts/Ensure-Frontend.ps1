# Garante que o frontend Vite (:3000) esteja no ar. Seguro para Task Scheduler (a cada 5 min).
# Sem isso, o Nginx Proxy Manager devolve 502 Bad Gateway quando o Vite cai.
param(
  [string]$ProjectRoot = 'C:\xampp\htdocs\RH_eletropasso',
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\frontend'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("watchdog-{0:yyyyMMdd}.log" -f (Get-Date))

function Write-WatchLog([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

function Test-PortOpen([int]$ListenPort) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', $ListenPort, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

if (Test-PortOpen $Port) {
  exit 0
}

Write-WatchLog "Port $Port down - starting Vite frontend"
if (-not (Test-Path -LiteralPath $ProjectRoot)) {
  Write-WatchLog "ProjectRoot missing: $ProjectRoot"
  exit 1
}

$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd) {
  Write-WatchLog 'npm.cmd not found in PATH'
  exit 1
}

$outLog = Join-Path $LogDir 'vite.out.log'
$errLog = Join-Path $LogDir 'vite.err.log'

Start-Process -FilePath $npmCmd -ArgumentList @(
  'run', 'dev', '--', '--host', '0.0.0.0', '--port', "$Port"
) -WorkingDirectory $ProjectRoot -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog | Out-Null

Start-Sleep -Seconds 8
if (Test-PortOpen $Port) {
  Write-WatchLog "frontend recovered on :$Port"
  exit 0
}

Write-WatchLog 'frontend still down after start attempt'
exit 2
