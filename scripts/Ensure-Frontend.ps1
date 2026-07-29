# Garante que o frontend RH (:3000) esteja no ar em modo PRODUÇÃO (vite preview).
# NÃO usa `vite dev` no caminho padrão — modo dev quebra LAN (clientes veem "Banco indisponível").
# Usado pelo Task Scheduler e pelo supervisor contínuo Watch-Frontend.ps1.
param(
  [string]$ProjectRoot = 'C:\xampp\htdocs\RH_eletropasso',
  [int]$Port = 3000,
  [int]$StartupWaitSec = 25,
  [ValidateSet('auto', 'preview', 'dev')]
  [string]$Mode = 'preview',
  [switch]$ForceRestart,
  [switch]$Rebuild,
  # Só use em debug local explícito. Nunca no autostart/LAN.
  [switch]$AllowDevFallback
)

$ErrorActionPreference = 'Stop'
$LogDir = 'E:\RH_eletropasso\logs\frontend'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("watchdog-{0:yyyyMMdd}.log" -f (Get-Date))
$PidFile = Join-Path $LogDir 'vite.pid'
$ModeFile = Join-Path $LogDir 'frontend.mode'

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

function Get-FrontendHtml([int]$ListenPort) {
  try {
    $r = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}/" -f $ListenPort) -UseBasicParsing -TimeoutSec 4
    return [string]$r.Content
  } catch {
    return $null
  }
}

function Test-FrontendIsViteDev([string]$Html) {
  if (-not $Html) { return $false }
  return ($Html -match '/@vite/client' -or $Html -match '/src/index\.(tsx|jsx|ts|js)' -or $Html -match 'react-refresh')
}

function Test-FrontendIsPreview([string]$Html) {
  if (-not $Html) { return $false }
  if (Test-FrontendIsViteDev $Html) { return $false }
  return ($Html -match 'assets/index-[^"\s>]+\.js' -or $Html -match '/assets/')
}

function Test-FrontendHealthy([int]$ListenPort) {
  if (-not (Test-PortOpen $ListenPort)) { return $false }
  $html = Get-FrontendHtml $ListenPort
  if (-not $html) { return $false }
  # Dev no ar NÃO conta como saudável para LAN — força troca para preview.
  if (Test-FrontendIsViteDev $html) { return $false }
  return $true
}

function Stop-StaleFrontend([int]$ListenPort) {
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
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | ForEach-Object {
    $cmd = [string]$_.CommandLine
    if ($cmd -match 'vite' -and ($cmd -match [regex]::Escape($ProjectRoot) -or $cmd -match 'RH_eletropasso')) {
      Write-WatchLog ("Stopping vite node PID {0}" -f $_.ProcessId)
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
  Start-Sleep -Seconds 2
}

function Resolve-FrontendMode {
  # Default operacional: sempre preview quando há dist (ou ForceRebuild cria).
  # `dev` só se -Mode dev explícito (e preferencialmente com AllowDevFallback).
  if ($Mode -eq 'dev') {
    if (-not $AllowDevFallback) {
      Write-WatchLog 'Mode=dev requested without -AllowDevFallback; forcing preview for LAN safety'
      return 'preview'
    }
    return 'dev'
  }
  if ($Mode -eq 'preview') { return 'preview' }
  # auto
  $distIndex = Join-Path $ProjectRoot 'dist\index.html'
  if (Test-Path -LiteralPath $distIndex) { return 'preview' }
  Write-WatchLog 'dist/ missing — will build for preview (dev not used in auto)'
  return 'preview'
}

function Import-ProjectEnv {
  # Vite: variáveis já definidas no processo têm prioridade sobre .env.
  # Força os valores do projeto para o build (evita VITE_SUPABASE_URL=127.0.0.1 herdado).
  foreach ($name in @('.env', '.env.production', '.env.local')) {
    $path = Join-Path $ProjectRoot $name
    if (-not (Test-Path -LiteralPath $path)) { continue }
    Get-Content -LiteralPath $path -Encoding UTF8 | ForEach-Object {
      $line = $_.Trim()
      if (-not $line -or $line.StartsWith('#')) { return }
      $eq = $line.IndexOf('=')
      if ($eq -lt 1) { return }
      $key = $line.Substring(0, $eq).Trim()
      $val = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
      if ($key -match '^VITE_') {
        Set-Item -Path ("Env:{0}" -f $key) -Value $val
      }
    }
  }
  Write-WatchLog ("Build env VITE_SUPABASE_URL={0}" -f $env:VITE_SUPABASE_URL)
}

function Ensure-ProductionBuild {
  $distIndex = Join-Path $ProjectRoot 'dist\index.html'
  if ((Test-Path -LiteralPath $distIndex) -and -not $Rebuild) { return }
  Write-WatchLog 'Building production dist for vite preview...'
  Import-ProjectEnv
  $npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
  $buildLog = Join-Path $LogDir 'build.out.log'
  $buildErr = Join-Path $LogDir 'build.err.log'
  # Pass VITE_* explicitly so cmd child does not inherit a stale 127.0.0.1 from the machine/session.
  $envAssign = @(
    ('set "VITE_SUPABASE_URL={0}"' -f $env:VITE_SUPABASE_URL),
    ('set "VITE_SUPABASE_ANON_KEY={0}"' -f $env:VITE_SUPABASE_ANON_KEY),
    ('set "VITE_LAN_SHARE_URL={0}"' -f $env:VITE_LAN_SHARE_URL)
  ) -join ' && '
  $cmdLine = '{0} && "{1}" run build > "{2}" 2> "{3}"' -f $envAssign, $npmCmd, $buildLog, $buildErr
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmdLine) `
    -WorkingDirectory $ProjectRoot -WindowStyle Hidden -Wait -PassThru
  if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $distIndex)) {
    throw ("npm run build failed (exit {0}). See {1}" -f $p.ExitCode, $buildErr)
  }
  Write-WatchLog 'Production build ready'
}

function Start-ViteFrontend([string]$RunMode) {
  if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "ProjectRoot missing: $ProjectRoot"
  }
  $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
  if (-not $npmCmd) { throw 'npm.cmd not found in PATH' }

  $outLog = Join-Path $LogDir 'vite.out.log'
  $errLog = Join-Path $LogDir 'vite.err.log'
  if ($RunMode -eq 'preview') {
    Ensure-ProductionBuild
    $npmArgs = 'run preview -- --host 0.0.0.0 --port {0}' -f $Port
  } else {
    $npmArgs = 'run dev -- --host 0.0.0.0 --port {0}' -f $Port
  }
  $arg = '/c ""{0}" {1} >> "{2}" 2>> "{3}""' -f $npmCmd, $npmArgs, $outLog, $errLog
  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList $arg -WorkingDirectory $ProjectRoot -WindowStyle Hidden -PassThru
  if ($p -and $p.Id) {
    Set-Content -LiteralPath $PidFile -Value $p.Id -Encoding ascii
    Set-Content -LiteralPath $ModeFile -Value $RunMode -Encoding ascii
    Write-WatchLog ("Started {0} via cmd/npm PID {1}" -f $RunMode, $p.Id)
  }
}

# --- main ---
$runMode = Resolve-FrontendMode
Write-WatchLog ("Mode={0} (requested={1})" -f $runMode, $Mode)

# Se já está em preview saudável, ok — a menos que ForceRestart.
$htmlNow = $null
if (Test-PortOpen $Port) {
  $htmlNow = Get-FrontendHtml $Port
}

$servingDev = Test-FrontendIsViteDev $htmlNow
$servingPreview = Test-FrontendIsPreview $htmlNow

if ($servingDev -and $runMode -eq 'preview') {
  Write-WatchLog 'Detected vite DEV on :3000 while preview required — forcing switch'
  $ForceRestart = $true
}

if ((Test-FrontendHealthy $Port) -and -not $ForceRestart) {
  if ($runMode -eq 'preview' -and -not $servingPreview -and $htmlNow) {
    Write-WatchLog 'HTTP up but not production assets — restarting as preview'
  } else {
    exit 0
  }
}

if ($ForceRestart -or $servingDev -or -not (Test-FrontendHealthy $Port)) {
  if ($ForceRestart) {
    Write-WatchLog 'ForceRestart requested'
  } elseif ($servingDev) {
    Write-WatchLog 'Replacing vite DEV with preview'
  } elseif (-not (Test-PortOpen $Port)) {
    Write-WatchLog ("Port {0} down - starting frontend ({1})" -f $Port, $runMode)
  } else {
    Write-WatchLog ("Port {0} open but HTTP unhealthy - restarting ({1})" -f $Port, $runMode)
  }
  Stop-StaleFrontend $Port
}

try {
  Start-ViteFrontend $runMode
} catch {
  Write-WatchLog ("Start failed: {0}" -f $_.Exception.Message)
  if ($runMode -eq 'preview' -and $AllowDevFallback) {
    Write-WatchLog 'AllowDevFallback: trying vite dev (LAN clients may break)'
    try { Start-ViteFrontend 'dev' } catch {
      Write-WatchLog ("Fallback also failed: {0}" -f $_.Exception.Message)
      exit 1
    }
  } else {
    # Sem AllowDevFallback: tenta rebuild+preview uma vez
    try {
      Write-WatchLog 'Retry preview with -Rebuild'
      $Rebuild = $true
      Start-ViteFrontend 'preview'
    } catch {
      Write-WatchLog ("Retry failed: {0}" -f $_.Exception.Message)
      exit 1
    }
  }
}

$deadline = (Get-Date).AddSeconds($StartupWaitSec)
while ((Get-Date) -lt $deadline) {
  $html = Get-FrontendHtml $Port
  if ($runMode -eq 'preview') {
    if (Test-FrontendIsPreview $html) {
      Write-WatchLog ("frontend preview recovered on :{0}" -f $Port)
      exit 0
    }
    if (Test-FrontendIsViteDev $html) {
      Write-WatchLog 'Still serving DEV after start — abort'
      exit 3
    }
  } elseif (Test-FrontendHealthy $Port) {
    Write-WatchLog ("frontend recovered on :{0}" -f $Port)
    exit 0
  }
  Start-Sleep -Seconds 2
}

Write-WatchLog 'frontend still down after start attempt'
exit 2
