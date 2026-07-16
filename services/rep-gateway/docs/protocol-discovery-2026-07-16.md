# Descoberta do protocolo — PrintPoint III

Data: 2026-07-16
REP: série `00003004820030709`, firmware `03.00.0028`

## Evidência coletada

- Client Rest foi configurado para `192.168.15.245:3002`.
- O relógio inicia `POST /v1/identification` com `idEquip`, identificador do
  cliente e `sn` na query string.
- O corpo é vazio e o `Content-Type` é `application/octet-stream`.
- Após um ACK não reconhecido, envia `POST /v1/confirmcommand` com
  `command=0&error=1`.
- O ciclo é repetido em aproximadamente 16 segundos.
- O identificador do cliente contém dado pessoal e é censurado antes do log e
  da quarentena.
- No Docker Desktop, o IP observado no container é `172.19.0.1`; o serial na
  query é exigido como vínculo adicional. O Firewall do Windows deve aplicar a
  allowlist pelo IP LAN real `192.168.15.201`.

## Chave RSA

A chave inicialmente fornecida tinha 150 caracteres hexadecimais (600 bits) e
não correspondia à chave ativa do equipamento. A leitura autenticada de
`POST /chave.cgi` retornou uma chave diferente, com 256 caracteres
hexadecimais (1024 bits), expoente `010001`.

O gateway importou e testou a chave ativa. Sondas de descoberta
RSA/PKCS#1 v1.5 com representações seguras de comando zero (vazio, ASCII `0`,
NUL, inteiro zero, JSON e form encoding) produziram sempre
`confirmcommand?command=0&error=1`. Portanto, a captura não comprova o padding,
o framing do comando ou a codificação do ciphertext.

## Marcação controlada

Foi realizada uma marcação física para:

- pessoa informada pelo operador: Gisele Catarina Olibone Ribeiro;
- identificador informado: `026740847000`;
- contador do REP: `53.854` → `53.855`.

Nenhum endpoint de marcação chegou ao gateway. A evidência mostra que o
firmware interrompe o fluxo no handshake inválido; a marcação ficou somente no
armazenamento fiscal/local do REP.

## ACKs testados

1. `200 text/plain` com `OK`;
2. `200 text/plain` vazio;
3. `200 application/octet-stream` com bloco RSA PKCS#1 v1.5 de 128 bytes,
   usando a chave ativa e comandos zero não destrutivos.

Todos foram recusados com `error=1`.

## Conclusão técnica

Ainda faltam evidências do protocolo proprietário:

- framing/canonicalização do comando;
- direção e padding RSA;
- encoding do bloco;
- comando de coleta de marcações;
- ACK de sucesso e política de retry;
- envelope da marcação, NSR, timestamp e identificador do trabalhador.

Não é seguro ativar `REP_SECURITY_MODE=verify`,
`REP_PROTOCOL_PROFILE` ou `REP_FORWARD_ENABLED` até obter o manual/Swagger/SDK
Client Rest da DIMEP ou uma resposta válida capturada de uma implementação
homologada. Nenhuma marcação foi promovida para `punches`.
