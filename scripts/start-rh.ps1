# Inicia RH Eletropasso após reboot: Docker → Supabase → Edge Functions → dmprep-sync → frontend.
# Logs: E:\RH_eletropasso\logs\

$ErrorActionPreference = 'Continue'

$ProjectRoot = 'C:\xampp\htdocs\RH_eletropasso'
$DataRoot = 'E:\RH_eletropasso'
$LogDir = Join-Path $DataRoot 'logs'
$HostIp = '192.168.15.245'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$transcript = Join-Path $LogDir "start-rh_$stamp.log"
Start-Transcript -Path $transcript -Append | Out-Null

Write-Host "=== RH Eletropasso start $stamp ==="

$env:Path = "C:\Program Files\Docker\Docker\resources\bin;C:\Program Files\nodejs;" + $env:Path

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSec = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch {
      # retry
    }
    Start-Sleep -Seconds 4
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Start-BackgroundProcess(
  [string]$Name,
  [string]$FilePath,
  [string[]]$ArgumentList,
  [string]$WorkingDirectory
) {
  $out = Join-Path $LogDir "$Name.out.log"
  $err = Join-Path $LogDir "$Name.err.log"
  Start-Process -FilePath $FilePath -ArgumentList $ArgumentList `
    -WorkingDirectory $WorkingDirectory -WindowStyle Hidden `
    -RedirectStandardOutput $out -RedirectStandardError $err
  Write-Host "Started $Name (logs: $out)"
}

function Get-NodeProcess([string]$Pattern) {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match $Pattern }
}

# 1) Docker Desktop
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  Write-Host 'Starting Docker Desktop...'
  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
}

$dockerDeadline = (Get-Date).AddMinutes(6)
do {
  Start-Sleep -Seconds 5
  docker info 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'Docker engine ready.'
    break
  }
} while ((Get-Date) -lt $dockerDeadline)

if ($LASTEXITCODE -ne 0) {
  Write-Warning 'Docker not ready - Supabase/Edge Functions may fail. Check Docker Desktop.'
}

# 2) Supabase stack
Set-Location $ProjectRoot
Write-Host 'Starting Supabase (npx supabase start)...'
npx supabase start 2>&1 | Write-Host

if (-not (Wait-HttpOk 'http://127.0.0.1:54321/auth/v1/health' 180)) {
  Write-Warning 'Supabase auth health check timed out.'
}

# 3) Edge Functions (Sincronizar DMPREP + ingest-punches)
if (-not (Get-NodeProcess 'supabase functions serve')) {
  $npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-BackgroundProcess 'edge-functions' $npmCmd @(
    'exec', 'supabase', 'functions', 'serve', '--env-file', 'supabase/functions/.env'
  ) $ProjectRoot
  Start-Sleep -Seconds 8
} else {
  Write-Host 'edge-functions already running - skipped.'
}

# 4) dmprep-sync (:3099)
if (-not (Test-PortListening 3099)) {
  $dmprepDir = Join-Path $ProjectRoot 'services/dmprep-sync'
  $distEntry = Join-Path $dmprepDir 'dist/src/server.js'
  $srcDir = Join-Path $dmprepDir 'src'
  $needsBuild = -not (Test-Path $distEntry)
  if (-not $needsBuild) {
    $distTime = (Get-Item $distEntry).LastWriteTimeUtc
    $newerSrc = Get-ChildItem -Path $srcDir -Recurse -File -Filter '*.ts' |
      Where-Object { $_.LastWriteTimeUtc -gt $distTime } |
      Select-Object -First 1
    if ($newerSrc) { $needsBuild = $true }
  }
  if ($needsBuild) {
    Write-Host 'dmprep-sync: rebuilding dist (src newer or missing)...'
    Push-Location $dmprepDir
    npm run build 2>&1 | Write-Host
    Pop-Location
  }

  $envFile = Join-Path $DataRoot 'config/dmprep-sync.env'
  $dmprepRunner = Join-Path $DataRoot 'scripts/run-dmprep-sync.ps1'
  if (-not (Test-Path $envFile)) {
    Write-Warning "Missing $envFile - dmprep-sync not started."
  } elseif (-not (Test-Path $dmprepRunner)) {
    Write-Warning "Missing $dmprepRunner - dmprep-sync not started."
  } else {
    Start-BackgroundProcess 'dmprep-sync' 'powershell.exe' @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $dmprepRunner
    ) $dmprepDir
  }
} else {
  Write-Host 'dmprep-sync already listening on 3099 - skipped.'
}

# 5) Frontend (:3000) — SEMPRE vite preview (produção). Dev quebra LAN nos clientes.
$ensureFrontend = Join-Path $PSScriptRoot 'Ensure-Frontend.ps1'
if (-not (Test-Path $ensureFrontend)) {
  $ensureFrontend = Join-Path $ProjectRoot 'scripts\Ensure-Frontend.ps1'
}
if (Test-Path $ensureFrontend) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensureFrontend -Mode preview
} elseif (-not (Test-PortListening 3000)) {
  $npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
  Start-BackgroundProcess 'frontend' $npmCmd @(
    'run', 'preview', '--', '--host', '0.0.0.0', '--port', '3000'
  ) $ProjectRoot
} else {
  Write-Host 'frontend already listening on 3000 - skipped.'
}

# 5b) Supervisor contínuo — reinicia Vite sozinho se cair
$frontendWatch = Join-Path $PSScriptRoot 'Watch-Frontend.ps1'
if (-not (Test-Path $frontendWatch)) {
  $frontendWatch = Join-Path $ProjectRoot 'scripts\Watch-Frontend.ps1'
}
$lockFile = Join-Path $DataRoot 'logs\frontend\supervisor.lock'
$supervisorRunning = $false
if (Test-Path $lockFile) {
  $oldPid = 0
  try { $oldPid = [int](Get-Content $lockFile -ErrorAction SilentlyContinue | Select-Object -First 1) } catch { }
  if ($oldPid -gt 0 -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
    $supervisorRunning = $true
  }
}
if (-not $supervisorRunning -and (Test-Path $frontendWatch)) {
  # VBS com shell.Run(..., 0) = sem janela de prompt (mais confiável que WindowStyle Hidden)
  $frontendWatchVbs = Join-Path $PSScriptRoot 'Run-WatchFrontend.vbs'
  if (-not (Test-Path $frontendWatchVbs)) {
    $frontendWatchVbs = Join-Path $ProjectRoot 'scripts\Run-WatchFrontend.vbs'
  }
  if (Test-Path $frontendWatchVbs) {
    $wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
    Start-Process -FilePath $wscript -ArgumentList "`"$frontendWatchVbs`"" -WindowStyle Hidden
    Write-Host "Started frontend-watch via VBS (silent). Logs: E:\RH_eletropasso\logs\frontend\"
  } else {
    Start-BackgroundProcess 'frontend-watch' 'powershell.exe' @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
      '-File', $frontendWatch, '-IntervalSec', '30'
    ) $ProjectRoot
  }
} else {
  Write-Host 'frontend supervisor already running - skipped.'
}

Start-Sleep -Seconds 6

Write-Host '--- Health ---'
foreach ($check in @(
  @{ Name = 'frontend'; Url = 'http://127.0.0.1:3000' },
  @{ Name = 'supabase-auth'; Url = 'http://127.0.0.1:54321/auth/v1/health' },
  @{ Name = 'dmprep-sync'; Url = 'http://127.0.0.1:3099/health' }
)) {
  try {
    $r = Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 8
    Write-Host ("OK  {0} -> {1}" -f $check.Name, $r.StatusCode)
  } catch {
    Write-Warning ("FAIL {0} -> {1}" -f $check.Name, $check.Url)
  }
}

Write-Host "App: http://${HostIp}:3000"
Write-Host 'Credenciais: E:\RH_eletropasso\credenciais.txt'
Write-Host 'Relogio: Organizacao > Sistema > Sincronizacao relogio de ponto'
Write-Host "Log: $transcript"

Stop-Transcript | Out-Null
