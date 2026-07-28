# Garante que dmprep-sync (:3099) esteja no ar. Seguro para Task Scheduler (a cada 5 min).
param(
  [string]$Runner = 'E:\RH_eletropasso\scripts\run-dmprep-sync.ps1',
  [int]$Port = 3099
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\dmprep-sync'
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

Write-WatchLog "Port $Port down - starting dmprep-sync runner"
if (-not (Test-Path -LiteralPath $Runner)) {
  Write-WatchLog "Runner missing: $Runner"
  exit 1
}

Start-Process -FilePath 'powershell.exe' -ArgumentList @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Hidden',
  '-File', $Runner
) -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 4
if (Test-PortOpen $Port) {
  Write-WatchLog "dmprep-sync recovered on :$Port"
  exit 0
}

Write-WatchLog 'dmprep-sync still down after start attempt'
exit 2
