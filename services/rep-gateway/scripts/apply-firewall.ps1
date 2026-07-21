# Restringe a porta 3002 (gateway REP) ao IP do PrintPoint III na LAN.
# Execute UMA vez como Administrador. Requer elevacao (netsh advfirewall).
#
#   powershell -ExecutionPolicy Bypass -File .\apply-firewall.ps1
#
# Defesa em profundidade: o Docker Desktop mascara o IP de origem dentro do
# container, entao o gateway tambem exige o serial na URL. Esta regra bloqueia
# outros hosts da LAN na borda do Windows.

$ErrorActionPreference = 'Stop'

$port = 3002
$repIp = '192.168.15.201'
$allowName = 'rep-gateway-3002-printpoint'
$blockName = 'rep-gateway-3002-block-others'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute este script em um PowerShell aberto como Administrador.'
}

netsh advfirewall firewall delete rule name="$allowName" | Out-Null
netsh advfirewall firewall delete rule name="$blockName" | Out-Null

netsh advfirewall firewall add rule name="$allowName" dir=in action=allow `
    protocol=TCP localport=$port remoteip=$repIp profile=any | Out-Null
netsh advfirewall firewall add rule name="$blockName" dir=in action=block `
    protocol=TCP localport=$port profile=any | Out-Null

Write-Host "Regras aplicadas: somente $repIp pode acessar a porta $port."
netsh advfirewall firewall show rule name="$allowName"
netsh advfirewall firewall show rule name="$blockName"
