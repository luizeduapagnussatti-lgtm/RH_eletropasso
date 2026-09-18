#Requires -Version 5.1
param(
  [string]$FunctionsUrl,
  [string]$CronSecret,
  [string]$LogDir = "E:\RH_eletropasso\logs"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$log = Join-Path $LogDir ("missing-punches-alert-{0:yyyyMMdd}.log" -f (Get-Date))
function Write-Log([string]$Msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Msg
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
  Write-Host $line
}
try {
  $headers = @{
    Authorization = "Bearer $CronSecret"
    "Content-Type" = "application/json"
  }
  $resp = Invoke-RestMethod -Method Post -Uri $FunctionsUrl -Headers $headers -Body "{}" -TimeoutSec 120
  Write-Log ("OK " + ($resp | ConvertTo-Json -Compress))
  exit 0
} catch {
  Write-Log ("FAIL " + $_.Exception.Message)
  exit 1
}
