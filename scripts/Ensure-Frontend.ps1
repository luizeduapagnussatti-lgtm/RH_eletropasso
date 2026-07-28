# Garante que o frontend Vite (:3000) esteja no ar.
# Usado pelo Task Scheduler e pelo supervisor contínuo Watch-Frontend.ps1.
# Sem isso, o Nginx Proxy Manager devolve 502 Bad Gateway quando o Vite cai.
param(
  [string]$ProjectRoot = 'C:\xampp\htdocs\RH_eletropasso',
  [int]$Port = 3000,
  [int]$StartupWaitSec = 20,
  [switch]$ForceRestart
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\frontend'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("watchdog-{0:yyyyMMdd}.log" -f (Get-Date))
$PidFile = Join-Path $LogDir 'vite.pid'

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

function Test-FrontendHealthy([int]$ListenPort) {
  if (-not (Test-PortOpen $ListenPort)) { return $false }
  try {
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/" -f $ListenPort) -UseBasicParsing -TimeoutSec 4
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Stop-StaleFrontend([int]$ListenPort) {
  # Free listeners on the Vite port (node/vite leftovers)
  $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    $procId = $c.OwningProcess
    if ($procId -and $procId -gt 0) {
      try {
        $proc = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f $procId) -ErrorAction SilentlyContinue
        $cmd = [string]$proc.CommandLine
        if ($cmd -match 'vite|node') {
          Write-WatchLog ("Stopping stale PID {0}: {1}" -f $procId, $cmd.Substring(0, [Math]::Min(100, $cmd.Length)))
          Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
      } catch { }
    }
  }
  # Also stop npm/vite jobs started for this project
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = [string]$_.CommandLine
    if ($cmd -match 'vite' -and ($cmd -match [regex]::Escape($ProjectRoot) -or $cmd -match 'RH_eletropasso')) {
      Write-WatchLog ("Stopping vite node PID {0}" -f $_.ProcessId)
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 2
}

function Start-ViteFrontend {
  if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "ProjectRoot missing: $ProjectRoot"
  }
  $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npmCmd) { throw 'npm.cmd not found in PATH' }

  $outLog = Join-Path $LogDir 'vite.out.log'
  $errLog = Join-Path $LogDir 'vite.err.log'
  # cmd.exe wraps npm.cmd reliably on Windows (avoids hang with redirected npm.cmd)
  $arg = '/c ""{0}" run dev -- --host 0.0.0.0 --port {1} >> "{2}" 2>> "{3}""' -f $npmCmd, $Port, $outLog, $errLog
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $arg -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  if ($p -and $p.Id) {
    Set-Content -LiteralPath $PidFile -Value $p.Id -Encoding ascii
    Write-WatchLog ("Started cmd/npm PID {0}" -f $p.Id)
  }
}

# --- main ---
$healthy = Test-FrontendHealthy $Port
if ($healthy -and -not $ForceRestart) {
  exit 0
}

if ($ForceRestart -or -not $healthy) {
  if ($ForceRestart) {
    Write-WatchLog 'ForceRestart requested'
    Stop-StaleFrontend $Port
  } elseif (-not (Test-PortOpen $Port)) {
    Write-WatchLog ("Port {0} down - starting Vite frontend" -f $Port)
  } else {
    Write-WatchLog ("Port {0} open but HTTP unhealthy - restarting Vite" -f $Port)
    Stop-StaleFrontend $Port
  }
}

try {
  Start-ViteFrontend
} catch {
  Write-WatchLog ("Start failed: {0}" -f $_.Exception.Message)
  exit 1
}

$deadline = (Get-Date).AddSeconds($StartupWaitSec)
while ((Get-Date) -lt $deadline) {
  if (Test-FrontendHealthy $Port) {
    Write-WatchLog ("frontend recovered on :{0}" -f $Port)
    exit 0
  }
  Start-Sleep -Seconds 2
}

Write-WatchLog 'frontend still down after start attempt'
exit 2
