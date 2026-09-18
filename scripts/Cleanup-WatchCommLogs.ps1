#Requires -Version 5.1
<#
.SYNOPSIS
  Poda segura de logs antigos do poller WatchComm / PrintPoint.

.DESCRIPTION
  Remove apenas arquivos de log/JSON de coleta antigos em
  E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller\

  PRESERVA sempre:
    state.json, last-cycle-result.json, watchdog-state.json, config.json

  Nao chama WatchComm, nao mexe em ARP/rede.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [string]$LogDir = 'E:\RH_eletropasso\logs\rep-gateway\watchcomm-poller',
  [int]$CollectJsonDays = 14,
  [int]$LogDays = 30,
  [switch]$Silent
)

$ErrorActionPreference = 'Continue'
$Report = [System.Collections.Generic.List[object]]::new()
$Freed = 0L

$PreserveNames = @(
  'state.json',
  'last-cycle-result.json',
  'watchdog-state.json',
  'config.json',
  'watchdog-state.json'
)

function Write-Out([string]$Msg) {
  if (-not $Silent) { Write-Host $Msg }
}

function Format-Size([int64]$Bytes) {
  if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
  if ($Bytes -ge 1MB) { return ('{0:N1} MB' -f ($Bytes / 1MB)) }
  if ($Bytes -ge 1KB) { return ('{0:N0} KB' -f ($Bytes / 1KB)) }
  return "$Bytes B"
}

if (-not (Test-Path -LiteralPath $LogDir)) {
  Write-Out "LogDir missing: $LogDir"
  exit 0
}

$now = Get-Date
$collectCutoff = $now.AddDays(-$CollectJsonDays)
$logCutoff = $now.AddDays(-$LogDays)

$patterns = @(
  @{ Glob = 'collect-*.json'; Cutoff = $collectCutoff; Reason = "collect json > $CollectJsonDays d" },
  @{ Glob = 'printpoint-link-*.log'; Cutoff = $logCutoff; Reason = "printpoint-link log > $LogDays d" },
  @{ Glob = 'validate-weekly-silent-*.txt'; Cutoff = $logCutoff; Reason = "validate report > $LogDays d" },
  @{ Glob = 'poller-*.log'; Cutoff = $logCutoff; Reason = "poller log > $LogDays d" },
  @{ Glob = 'watchcomm-*.log'; Cutoff = $logCutoff; Reason = "watchcomm log > $LogDays d" },
  @{ Glob = 'reschedule-*.txt'; Cutoff = $logCutoff; Reason = "reschedule note > $LogDays d" },
  @{ Glob = 'install-*.txt'; Cutoff = $logCutoff; Reason = "install note > $LogDays d" },
  @{ Glob = 'schtasks-*.txt'; Cutoff = $logCutoff; Reason = "schtasks note > $LogDays d" },
  @{ Glob = 'remove-*.txt'; Cutoff = $logCutoff; Reason = "remove note > $LogDays d" }
)

Write-Out "Cleanup-WatchCommLogs dir=$LogDir"

foreach ($p in $patterns) {
  Get-ChildItem -LiteralPath $LogDir -Filter $p.Glob -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LastWriteTime -lt $p.Cutoff -and
      ($PreserveNames -notcontains $_.Name)
    } |
    ForEach-Object {
      $bytes = [int64]$_.Length
      $label = Format-Size $bytes
      if ($PSCmdlet.ShouldProcess($_.FullName, "Remover ($($p.Reason))")) {
        try {
          Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
          $script:Freed += $bytes
          $Report.Add([pscustomobject]@{ Status = 'OK'; Path = $_.Name; Size = $label; Reason = $p.Reason })
        } catch {
          $Report.Add([pscustomobject]@{ Status = 'FAIL'; Path = $_.Name; Size = $label; Reason = $_.Exception.Message })
        }
      } else {
        $Report.Add([pscustomobject]@{ Status = 'WHATIF'; Path = $_.Name; Size = $label; Reason = $p.Reason })
        $script:Freed += $bytes
      }
    }
}

# Also age daily named logs like 20260901.log if present
Get-ChildItem -LiteralPath $LogDir -Filter '*.log' -File -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '^\d{8}' -and
    $_.LastWriteTime -lt $logCutoff -and
    ($PreserveNames -notcontains $_.Name)
  } |
  ForEach-Object {
    $bytes = [int64]$_.Length
    $label = Format-Size $bytes
    $reason = "dated log > $LogDays d"
    if ($PSCmdlet.ShouldProcess($_.FullName, "Remover ($reason)")) {
      try {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
        $script:Freed += $bytes
        $Report.Add([pscustomobject]@{ Status = 'OK'; Path = $_.Name; Size = $label; Reason = $reason })
      } catch {
        $Report.Add([pscustomobject]@{ Status = 'FAIL'; Path = $_.Name; Size = $label; Reason = $_.Exception.Message })
      }
    } else {
      $Report.Add([pscustomobject]@{ Status = 'WHATIF'; Path = $_.Name; Size = $label; Reason = $reason })
      $script:Freed += $bytes
    }
  }

$summary = "removed={0} freed~{1}" -f @($Report | Where-Object Status -in @('OK', 'WHATIF')).Count, (Format-Size $Freed)
Write-Out $summary

$reportPath = Join-Path $LogDir ("cleanup-watchcomm-logs-{0:yyyyMMdd-HHmmss}.txt" -f $now)
@(
  "=== Cleanup-WatchCommLogs $(Get-Date -Format o) ==="
  $summary
  ($Report | ForEach-Object { "{0}`t{1}`t{2}`t{3}" -f $_.Status, $_.Size, $_.Reason, $_.Path })
) | Set-Content -LiteralPath $reportPath -Encoding UTF8

if ($Report | Where-Object Status -eq 'FAIL') { exit 1 }
exit 0
