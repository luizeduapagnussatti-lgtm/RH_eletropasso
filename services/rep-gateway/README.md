# Gateway REP — PrintPoint III (Client Rest)

Serviço isolado que recebe os POSTs iniciados pelo relógio, preserva o corpo
HTTP original e responde rapidamente ao firmware. O AFD não faz parte deste
fluxo.

## Estado do protocolo

O modo inicial é **discovery**. A documentação pública não informa rota,
payload, ACK, retry, padding/hash RSA ou qual lado usa a chave privada.
Portanto, o gateway captura sem promover eventos ao banco até uma requisição
real comprovar o protocolo.

## Endereços

- Gateway: `http://192.168.15.245:3002`
- Health: `http://192.168.15.245:3002/health`
- Métricas: `http://192.168.15.245:3002/metrics`
- REP autorizado: `192.168.15.201`
- Série esperada: `00003004820030709`

A porta `3000` do equipamento é a porta do próprio REP. O destino Client Rest
na VM usa `3002`, pois o frontend RH já usa `3000`.

## Executar localmente

```powershell
cd C:\xampp\htdocs\RH_eletropasso\services\rep-gateway
copy .env.example .env
npm install
npm run dev
```

Para testar o catch-all:

```powershell
Invoke-WebRequest `
  -Method Post `
  -Uri http://127.0.0.1:3002/rota/desconhecida `
  -ContentType application/octet-stream `
  -Body ([byte[]](0,1,2,255))
```

Em desenvolvimento, inclua `127.0.0.1` em `REP_ALLOWED_IPS`.

## Executar no Docker

O compose lê configuração de:

`E:\RH_eletropasso\config\rep-gateway.env`

E grava dados somente em `E:`:

- Capturas: `E:\RH_eletropasso\data\rep-gateway`
- Logs JSONL: `E:\RH_eletropasso\logs\rep-gateway\gateway.jsonl`

```powershell
cd C:\xampp\htdocs\RH_eletropasso\services\rep-gateway
docker compose up -d --build
docker compose logs -f rep-gateway
```

## Primeira captura

1. Mantenha `REP_SECURITY_MODE=discovery`,
   `REP_PROTOCOL_PROFILE=discovery` e `REP_FORWARD_ENABLED=false`.
2. No PrintPoint III, configure Client Rest para `192.168.15.245`, porta
   `3002`, temporização `5`.
3. Faça uma marcação de teste.
4. Observe o log:

   ```powershell
   docker logs rep_gateway_printpoint
   Get-ChildItem E:\RH_eletropasso\data\rep-gateway -Recurse
   ```

Cada requisição gera:

- `.bin`: bytes exatos recebidos;
- `.json`: rota, IP, headers sanitizados, SHA-256, Base64 e preview textual.

Credenciais, cookies e cabeçalhos de autorização são censurados. O diretório
de captura deve permanecer restrito aos administradores da VM.
Capturas acima de `REP_RETENTION_DAYS` ou do limite
`REP_MAX_CAPTURE_FILES` são removidas em pares `.json`/`.bin`.

No Docker Desktop para Windows, o container vê conexões LAN pelo IP da bridge
(atualmente `172.19.0.1`). Configure esse endereço em `REP_NAT_IPS`: o gateway
só o aceita quando a URL também contém o serial esperado. Como o NAT elimina
o IP original dentro do container, a regra do Firewall do Windows por
`remoteip=192.168.15.201` continua obrigatória para bloquear outros hosts LAN.

## RSA

O módulo/expoente é importado como JWK por `src/security/rsa.ts`. A função
`verifyRsaSignature()` valida os bytes exatos usando algoritmo e padding
configurados, mas o modo `verify` só pode ser ativado quando a captura ou o
fabricante confirmar:

- onde está a assinatura;
- quais bytes foram assinados;
- encoding;
- hash;
- padding (PKCS#1 v1.5 ou PSS);
- formato exato do ACK.

Ativar RSA sem essas informações rejeitaria pacotes legítimos ou criaria uma
validação falsa. Durante a descoberta, a chave inicialmente informada (600
bits) não correspondeu à chave ativa retornada por `/chave.cgi`. A chave ativa
tem 1024 bits e também é legado abaixo da recomendação moderna de 2048 bits;
allowlist de IP e isolamento na LAN continuam obrigatórios.

Os resultados da captura controlada de 2026-07-16 estão em
`docs/protocol-discovery-2026-07-16.md`. O handshake proprietário ainda não foi
comprovado; o encaminhamento deve permanecer desligado até obter documentação
Client Rest/SDK da DIMEP ou uma captura homologada.

## Encaminhamento ao RH

Depois de comprovado o protocolo:

```env
REP_SECURITY_MODE=verify
REP_PROTOCOL_PROFILE=<perfil PrintPoint implementado>
REP_FORWARD_ENABLED=true
PUNCH_INGEST_URL=http://host.docker.internal:54321/functions/v1/ingest-punches
PUNCH_INGEST_API_KEY=<segredo exclusivo>
PUNCH_INGEST_ORGANIZATION_ID=<uuid da Eletropasso>
```

O gateway envia somente eventos validados com `deviceId` e `nsr`. O endpoint
`ingest-punches` verifica funcionário/organização e mantém idempotência por
organização + equipamento + NSR.

## Testes e build

```powershell
npm test
npm run typecheck
npm run build
```
