#Requires -Version 5.1
<#
.SYNOPSIS
  Watchdog da coleta automatica WatchComm (PrintPoint).

.DESCRIPTION
  Se a ultima coleta bem-sucedida tiver mais de MaxAgeHours, dispara
  Run-WatchCommPoller -Trigger manual. Apos FailuresBeforeNotify ciclos
  consecutivos com falha, cria notificacao SYSTEM para ADMIN via Edge HTTP
  (se CRON_SECRET / URL disponivel) ou registra no log.
#>
[CmdletBinding()]
param(
  [string]$ResultPath = 'E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller\last-cycle-result.json',
  [string]$StatePath = 'E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller\watchdog-state.json',
  [string]$PollerRoot = '',
  [double]$MaxAgeHours = 192,
  [int]$FailuresBeforeNotify = 3,
  [string]$LogDir = 'E:\RH_eletropasso\logs',
  [string]$FunctionsUrl = 'http://127.0.0.1:54321/functions/v1',
  [string]$EnvFile = '',
  [switch]$SkipCollect
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $PollerRoot) {
  $PollerRoot = Join-Path $RepoRoot 'scripts\watchcomm-poller'
}
if (-not $EnvFile) {
  $EnvFile = Join-Path $RepoRoot 'supabase\functions\.env'
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$log = Join-Path $LogDir ("clock-collect-watchdog-{0:yyyyMMdd}.log" -f (Get-Date))
function Write-Log([string]$Msg, [string]$Level = 'INFO') {
  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Msg
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  Write-Host $line
}

function Read-JsonSafe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try { return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}

function Save-Json($Object, [string]$Path) {
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $json = $Object | ConvertTo-Json -Depth 6
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $json, $utf8)
}

$result = Read-JsonSafe $ResultPath
$state = Read-JsonSafe $StatePath
if (-not $state) {
  $state = [pscustomobject]@{ consecutiveFailures = 0; lastNotifyAt = $null }
}

$now = Get-Date
$stale = $true
$lastOk = $null
if ($result -and $result.success -eq $true -and $result.finishedAt) {
  try {
    $lastOk = [datetime]::Parse($result.finishedAt)
    $ageH = ($now - $lastOk).TotalHours
    if ($ageH -le $MaxAgeHours) { $stale = $false }
    Write-Log ("last success age={0:N1}h inserted={1}" -f $ageH, $result.inserted)
  } catch {
    Write-Log 'finishedAt parse failed' 'WARN'
  }
} else {
  Write-Log 'no successful last-cycle-result' 'WARN'
}

$ranCollect = $false
$collectOk = $false

# Sempre aquece ARP/TCP do PrintPoint antes de decidir se a coleta esta stale.
$linkScript = Join-Path $RepoRoot 'scripts\Ensure-PrintPointLink.ps1'
if (Test-Path -LiteralPath $linkScript) {
  Write-Log 'Ensure-PrintPointLink (watchdog)'
  $linkProc = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $linkScript
  ) -Wait -PassThru -NoNewWindow
  Write-Log ("Ensure-PrintPointLink exit={0}" -f $linkProc.ExitCode) $(if ($linkProc.ExitCode -eq 0) { 'INFO' } else { 'WARN' })
}

if ($stale -and -not $SkipCollect) {
  $runner = Join-Path $PollerRoot 'Run-WatchCommPoller.ps1'
  if (-not (Test-Path -LiteralPath $runner)) {
    Write-Log "poller missing: $runner" 'ERROR'
    exit 2
  }
  Write-Log 'triggering manual collect'
  $ranCollect = $true
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass',
    '-File', $runner, '-Trigger', 'manual'
  ) -Wait -PassThru -NoNewWindow
  $collectOk = ($p.ExitCode -eq 0)
  Write-Log ("manual collect exit={0}" -f $p.ExitCode) $(if ($collectOk) { 'INFO' } else { 'ERROR' })
  $result = Read-JsonSafe $ResultPath
  if ($result -and $result.success -eq $true) {
    $collectOk = $true
    $stale = $false
  }
}

if ($stale -or ($ranCollect -and -not $collectOk)) {
  $state.consecutiveFailures = [int]$state.consecutiveFailures + 1
} else {
  $state.consecutiveFailures = 0
}

$shouldNotify = $state.consecutiveFailures -ge $FailuresBeforeNotify
if ($shouldNotify) {
  $lastNotify = $null
  if ($state.lastNotifyAt) {
    try { $lastNotify = [datetime]::Parse([string]$state.lastNotifyAt) } catch {}
  }
  $notifyCooldown = -not $lastNotify -or (($now - $lastNotify).TotalHours -ge 6)
  if ($notifyCooldown) {
    Write-Log ("notifying ADMIN after {0} failures" -f $state.consecutiveFailures) 'WARN'
    $cronSecret = $env:CRON_SECRET
    if (-not $cronSecret -and (Test-Path -LiteralPath $EnvFile)) {
      foreach ($line in Get-Content -LiteralPath $EnvFile) {
        if ($line -match '^\s*CRON_SECRET\s*=\s*(.+)\s*$') {
          $cronSecret = $Matches[1].Trim().Trim('"').Trim("'")
          break
        }
      }
    }
    # Best-effort: insert via local supabase REST if service role available in .env
    $serviceKey = $null
    $supabaseUrl = 'http://127.0.0.1:54321'
    if (Test-Path -LiteralPath $EnvFile) {
      foreach ($line in Get-Content -LiteralPath $EnvFile) {
        if ($line -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)\s*$') {
          $serviceKey = $Matches[1].Trim().Trim('"').Trim("'")
        }
        if ($line -match '^\s*SUPABASE_URL\s*=\s*(.+)\s*$') {
          $supabaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
        }
      }
    }
    if ($serviceKey) {
      try {
        $headers = @{
          apikey = $serviceKey
          Authorization = "Bearer $serviceKey"
          'Content-Type' = 'application/json'
          Prefer = 'return=minimal'
        }
        $admins = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/profiles?role=eq.ADMIN&status=eq.ACTIVE&select=id,organization_id" -Headers $headers
        foreach ($admin in @($admins)) {
          $body = @{
            user_id = $admin.id
            organization_id = $admin.organization_id
            type = 'SYSTEM'
            title = 'Coleta de ponto falhando - verificar relogio'
            message = "A coleta WatchComm falhou em $($state.consecutiveFailures) ciclos consecutivos. Abra Comunicacao > Diagnostico."
            is_read = $false
            priority = 'HIGH'
            action_url = 'comunicacao'
            reference_type = 'CLOCK_COLLECT_WATCHDOG'
            reference_id = ("clock_collect_fail_{0:yyyyMMddHH}" -f $now)
          } | ConvertTo-Json -Compress
          Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/notifications" -Headers $headers -Body $body | Out-Null
        }
        $state.lastNotifyAt = $now.ToString('o')
        Write-Log ("notified {0} ADMIN profile(s)" -f @($admins).Count)
      } catch {
        Write-Log ("notify failed: " + $_.Exception.Message) 'ERROR'
      }
    } else {
      Write-Log 'SUPABASE_SERVICE_ROLE_KEY missing — logged only' 'WARN'
      $state.lastNotifyAt = $now.ToString('o')
    }
  }
}

Save-Json $state $StatePath
Write-Log ("done stale={0} failures={1}" -f $stale, $state.consecutiveFailures)
exit $(if ($stale) { 1 } else { 0 })
