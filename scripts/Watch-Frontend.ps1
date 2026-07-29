# Supervisor contínuo do frontend Vite.
# Mantém um loop: a cada IntervalSec checa HTTP :3000 e chama Ensure-Frontend.ps1 se cair.
# Iniciado pelo start-rh.ps1 (e pode ser iniciado manualmente).
param(
  [int]$IntervalSec = 30,
  [string]$EnsureScript = ''
)

$ErrorActionPreference = 'Continue'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $EnsureScript) {
  $EnsureScript = Join-Path $ScriptDir 'Ensure-Frontend.ps1'
  if (-not (Test-Path $EnsureScript)) {
    $EnsureScript = 'C:\xampp\htdocs\RH_eletropasso\scripts\Ensure-Frontend.ps1'
  }
}

$LogDir = 'E:\RH_eletropasso\logs\frontend'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("supervisor-{0:yyyyMMdd}.log" -f (Get-Date))
$LockFile = Join-Path $LogDir 'supervisor.lock'

function Write-SupLog([string]$Message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}

# Single-instance lock
if (Test-Path $LockFile) {
  $oldPid = 0
  try { $oldPid = [int](Get-Content -LiteralPath $LockFile -ErrorAction SilentlyContinue | Select-Object -First 1) } catch { }
  if ($oldPid -gt 0) {
    $alive = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
    if ($alive) {
      Write-SupLog ("Already running as PID {0} - exit" -f $oldPid)
      exit 0
    }
  }
}
Set-Content -LiteralPath $LockFile -Value $PID -Encoding ascii
Write-SupLog ("Supervisor started PID {0}, interval {1}s" -f $PID, $IntervalSec)

function Invoke-EnsureFrontendSilent {
  # Roda Ensure-Frontend sem abrir janela: processo filho oculto (não & powershell interativo).
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = (Get-Command powershell.exe).Source
  # Sempre preview — vite dev na :3000 quebra LAN ("Banco indisponível" nos clientes).
  $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$EnsureScript`" -Mode preview"
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.WorkingDirectory = Split-Path -Parent $EnsureScript
  $proc = [System.Diagnostics.Process]::Start($psi)
  if (-not $proc) { throw 'Failed to start Ensure-Frontend process' }
  $null = $proc.StandardOutput.ReadToEnd()
  $err = $proc.StandardError.ReadToEnd()
  $proc.WaitForExit()
  if ($err -and $err.Trim().Length -gt 0) {
    Write-SupLog ("Ensure-Frontend stderr: {0}" -f $err.Trim().Substring(0, [Math]::Min(300, $err.Trim().Length)))
  }
  return $proc.ExitCode
}

try {
  while ($true) {
    try {
      $code = Invoke-EnsureFrontendSilent
      if ($code -ne 0) {
        Write-SupLog ("Ensure-Frontend exit {0}" -f $code)
      }
    } catch {
      Write-SupLog ("Ensure-Frontend error: {0}" -f $_.Exception.Message)
    }
    Start-Sleep -Seconds $IntervalSec
  }
} finally {
  if ((Test-Path $LockFile) -and ((Get-Content $LockFile -ErrorAction SilentlyContinue) -eq "$PID")) {
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
  }
  Write-SupLog ("Supervisor stopped PID {0}" -f $PID)
}
