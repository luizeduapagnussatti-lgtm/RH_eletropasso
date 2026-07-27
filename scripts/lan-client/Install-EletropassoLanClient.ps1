#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Prepara um PC da loja para abrir https://rh.eletropasso.local (DNS hosts + certificado).

.NOTES
  Certificado SOZINHO nao basta — sem entrada no hosts o Windows nao sabe onde e 192.168.15.245.
#>
$ErrorActionPreference = 'Stop'

$RhIp = '192.168.15.245'
$RhHost = 'rh.eletropasso.local'
$ApiHost = 'api-rh.eletropasso.local'
$HostsPath = Join-Path $env:Windir 'System32\drivers\etc\hosts'

function Write-Step($msg, $color = 'White') { Write-Host $msg -ForegroundColor $color }

Write-Step '=== RH Eletropasso — preparo LAN ===' Cyan
Write-Step "Servidor RH: $RhIp`n"

# --- hosts: remove linhas antigas erradas e garante entradas corretas ---
$lines = Get-Content -Path $HostsPath -Encoding UTF8 -ErrorAction SilentlyContinue
if (-not $lines) { $lines = @() }

$filtered = [System.Collections.Generic.List[string]]::new()
foreach ($line in $lines) {
  if ($line -match 'rh\.eletropasso\.local|api-rh\.eletropasso\.local') { continue }
  $filtered.Add($line)
}

while ($filtered.Count -gt 0 -and [string]::IsNullOrWhiteSpace($filtered[$filtered.Count - 1])) {
  $filtered.RemoveAt($filtered.Count - 1)
}

$filtered.Add('')
$filtered.Add('# RH Eletropasso — LAN (Install-EletropassoLanClient.ps1)')
$filtered.Add("$RhIp $RhHost")
$filtered.Add("$RhIp $ApiHost")

Set-Content -Path $HostsPath -Value ($filtered -join "`r`n") -Encoding UTF8
Write-Step '[OK] Arquivo hosts atualizado' Green

ipconfig /flushdns | Out-Null
Write-Step '[OK] Cache DNS limpo (ipconfig /flushdns)' Green

# --- certificado opcional ---
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CerPath = Join-Path $ScriptDir 'eletropasso-lan-ca.cer'

if (Test-Path -LiteralPath $CerPath) {
  Import-Certificate -FilePath $CerPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
  Write-Step "[OK] Certificado raiz importado: $CerPath" Green
} else {
  Write-Step '[AVISO] Sem eletropasso-lan-ca.cer — HTTPS pode avisar "conexao nao privada".' Yellow
  Write-Step "        Coloque o .cer exportado da maquina .57 em: $ScriptDir" Yellow
}

Write-Step ''

# --- diagnostico ---
Write-Step '--- Diagnostico ---' Cyan

try {
  $resolved = [System.Net.Dns]::GetHostAddresses($RhHost) | ForEach-Object { $_.IPAddressToString }
  Write-Step "DNS $RhHost -> $($resolved -join ', ')" $(if ($resolved -contains $RhIp) { 'Green' } else { 'Red' })
} catch {
  Write-Step "DNS $RhHost -> FALHOU ($($_.Exception.Message))" Red
}

$pingOk = (Test-Connection -ComputerName $RhIp -Count 1 -Quiet -ErrorAction SilentlyContinue)
Write-Step "Ping $RhIp -> $(if ($pingOk) { 'OK' } else { 'SEM RESPOSTA (firewall ou rede diferente)' })" $(if ($pingOk) { 'Green' } else { 'Yellow' })

try {
  $tcp = Test-NetConnection -ComputerName $RhIp -Port 443 -WarningAction SilentlyContinue -ErrorAction Stop
  $portOk = $tcp.TcpTestSucceeded
} catch {
  $portOk = $false
}
Write-Step "Porta 443 em $RhIp -> $(if ($portOk) { 'ABERTA (NPM/HTTPS)' } else { 'FECHADA ou bloqueada' })" $(if ($portOk) { 'Green' } else { 'Red' })

Write-Step ''
if ($resolved -contains $RhIp -and $portOk) {
  Write-Step 'Pronto. Abra: https://rh.eletropasso.local' Green
} elseif ($resolved -contains $RhIp -and -not $portOk) {
  Write-Step 'Hosts OK, mas servidor .245 nao responde na 443.' Yellow
  Write-Step 'Confirme NPM no servidor e firewall Windows (entrada HTTPS).' Yellow
} else {
  Write-Step 'Hosts/DNS ainda incorreto. Rode este script como Administrador.' Red
}

Write-Step ''
Read-Host 'Pressione Enter para fechar'
