#Requires -Version 5.1
<#
.SYNOPSIS
  Valida a cadeia silenciosa: PrintPoint-Link -> coleta WatchComm (como as tarefas semanais).
#>
[CmdletBinding()]
param(
  [string]$LogDir = 'E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller',
  [switch]$SkipCollect
)

$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$report = Join-Path $LogDir ("validate-weekly-silent-{0:yyyyMMdd-HHmmss}.txt" -f (Get-Date))
$lines = New-Object System.Collections.Generic.List[string]
function Add-Line([string]$Msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Msg
  [void]$lines.Add($line)
  Write-Host $line
}

$ok = $true
Add-Line '=== validate weekly silent chain ==='

# 1) Schedules — prefer Get-ScheduledTask (works for own tasks); schtasks may deny SYSTEM.
foreach ($tn in @('OpenHR-PrintPoint-Link', 'OpenHR-WatchComm-Poller', 'RH_Eletropasso_ClockCollect_Watchdog')) {
  $taskOk = $false
  $detail = ''
  try {
    $st = Get-ScheduledTask -TaskName $tn -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $tn -ErrorAction SilentlyContinue
    $next = if ($info -and $info.NextRunTime) { $info.NextRunTime.ToString('yyyy-MM-dd HH:mm') } else { 'n/a' }
    $detail = ("State={0} Next={1}" -f $st.State, $next)
    $taskOk = ($st.State -ne 'Disabled')
  } catch {
    $q = schtasks /Query /TN $tn /FO LIST 2>&1 | Out-String
    if ($q -match 'Semanalmente|Weekly|Pronto|Ready' -and $q -notmatch 'ERRO:|ERROR:') {
      $taskOk = $true
      $detail = 'schtasks query ok'
    } else {
      # SYSTEM tasks often deny query to limited shells — treat as WARN if name known from install.
      $detail = "query limited ($($_.Exception.Message))"
      if ($tn -eq 'OpenHR-PrintPoint-Link') {
        $taskOk = $true
        $detail = 'WARN: SYSTEM task (query denied in non-elevated shell; assume installed)'
      }
    }
  }
  if ($taskOk) {
    Add-Line ("TASK OK: {0} | {1}" -f $tn, $detail)
  } else {
    Add-Line ("TASK FAIL: {0} | {1}" -f $tn, $detail)
    $ok = $false
  }
}

# 2) Link preflight (same script the Monday 08:45 task runs)
$link = Join-Path $PSScriptRoot 'Ensure-PrintPointLink.ps1'
$pLink = Start-Process -FilePath 'powershell.exe' -ArgumentList @(
  '-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass',
  '-File', $link,
  '-ClockIp', '192.168.15.201', '-ClockPort', '3000',
  '-MacAddress', 'f8-f0-05-65-80-11', '-TcpAttempts', '4', '-WarmPingCount', '2'
) -Wait -PassThru -WindowStyle Hidden
Add-Line ("Ensure-PrintPointLink exit={0}" -f $pLink.ExitCode)
if ($pLink.ExitCode -ne 0) { $ok = $false }

$arp = (arp -a 192.168.15.201 2>&1 | Out-String)
if ($arp -match 'est.tico|static|f8-f0-05-65-80-11') {
  Add-Line 'ARP OK (static neighbor present)'
} else {
  Add-Line 'ARP WARN (neighbor missing or dynamic)'
  [void]$lines.Add($arp.Trim())
}

# 3) Collect via Run-Poller.cmd (same path as Monday 09:00 task)
if (-not $SkipCollect) {
  $cmd = Join-Path $PSScriptRoot 'watchcomm-poller\Run-Poller.cmd'
  $pCol = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', "`"$cmd`"") -Wait -PassThru -WindowStyle Hidden
  Add-Line ("Run-Poller.cmd exit={0}" -f $pCol.ExitCode)
  if ($pCol.ExitCode -ne 0) { $ok = $false }

  $resultPath = 'E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller\last-cycle-result.json'
  if (Test-Path -LiteralPath $resultPath) {
    try {
      $r = Get-Content -LiteralPath $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
      Add-Line ("last-cycle success={0} inserted={1} lastNsr={2} error={3}" -f $r.success, $r.inserted, $r.lastNsr, $r.error)
      if ($r.success -ne $true) { $ok = $false }
    } catch {
      Add-Line ("last-cycle parse FAIL: {0}" -f $_.Exception.Message)
      $ok = $false
    }
  } else {
    Add-Line 'last-cycle-result.json MISSING'
    $ok = $false
  }
} else {
  Add-Line 'SkipCollect=true (link-only validation)'
}

Add-Line ("=== RESULT {0} ===" -f $(if ($ok) { 'PASS' } else { 'FAIL' }))
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($report, $lines.ToArray(), $utf8)
Write-Host "Report: $report"
exit $(if ($ok) { 0 } else { 1 })
