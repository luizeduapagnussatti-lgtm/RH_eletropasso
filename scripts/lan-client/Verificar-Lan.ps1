Write-Host "=== Verificar acesso RH (rh + API) ===" -ForegroundColor Cyan
$RhIp = '192.168.15.245'
$RhHost = 'rh.eletropasso.local'
$ApiHost = 'api-rh.eletropasso.local'

foreach ($hostName in @($RhHost, $ApiHost)) {
  try {
    $resolved = [System.Net.Dns]::GetHostAddresses($hostName) | ForEach-Object { $_.IPAddressToString }
    Write-Host "DNS $hostName -> $($resolved -join ', ')"
    if ($resolved -notcontains $RhIp) {
      Write-Host "  PROBLEMA: deveria ser $RhIp (falta ou hosts errado)" -ForegroundColor Red
    }
  } catch {
    Write-Host "DNS $hostName -> FALHOU (falta linha no hosts)" -ForegroundColor Red
  }
}

Write-Host ''
Write-Host 'Teste HTTPS API (login depende disso):' -ForegroundColor Cyan
try {
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  $api = Invoke-WebRequest -Uri "https://$ApiHost/auth/v1/health" -UseBasicParsing -TimeoutSec 8
  Write-Host "  https://$ApiHost/auth/v1/health -> $($api.StatusCode) OK" -ForegroundColor Green
} catch {
  Write-Host "  https://$ApiHost -> FALHOU: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '  Sem API o login sempre falha (mesmo com senha certa).' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'No login do RH: canto superior direito = Banco conectado (verde).' -ForegroundColor DarkGray
Read-Host 'Enter para fechar'
