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

Em 2026-07-17 foi testado um frame DIMEP documentado publicamente pela TOTVS:
`F8 A1 70 01 00 00 D0 F0`. A função `0x70` apenas consulta o estado de um
comando anterior e, portanto, não altera dados do REP. O mesmo frame foi
testado com PKCS#1 v1.5, ciphertext invertido, OAEP-SHA1, OAEP-SHA256, RSA sem
padding com alinhamento à esquerda/direita e saídas binária, hexadecimal e
Base64. Todas as variantes foram recusadas com `command=0&error=1`.

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

## Modelo de comunicação comprovado

O Client Rest não envia espontaneamente o envelope da marcação logo após a
batida. O relógio consulta periodicamente `/v1/identification`; o servidor deve
responder com um comando proprietário válido para solicitar a coleta. O REP
confirma o comando em `/v1/confirmcommand` e somente depois publica o resultado
em outra rota. Assim, trata-se de polling comandado pelo servidor, ainda que a
conexão HTTP seja sempre iniciada pelo equipamento.

O endpoint oficial `equipamentos.dimepkairos.com.br` respondeu `400` com corpo
vazio para a série/identificador de teste, indicando que o equipamento não está
provisionado numa conta Kairos que permita usar o servidor oficial como
oráculo controlado.

## Conclusão técnica

Ainda faltam evidências do protocolo proprietário:

- framing/canonicalização do comando;
- direção e padding RSA;
- encoding do bloco;
- comando de coleta de marcações;
- ACK de sucesso e política de retry;
- envelope da marcação, NSR, timestamp e identificador do trabalhador.
- formato do handshake/licença que antecede os frames `0xA1`.

Não é seguro ativar `REP_SECURITY_MODE=verify`,
`REP_PROTOCOL_PROFILE` ou `REP_FORWARD_ENABLED` até obter o manual/Swagger/SDK
Client Rest da DIMEP ou uma resposta válida capturada de uma implementação
homologada. Nenhuma marcação foi promovida para `punches`.
