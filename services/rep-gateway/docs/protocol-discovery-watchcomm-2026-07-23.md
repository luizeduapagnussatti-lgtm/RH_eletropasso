# Descoberta WatchComm.dll — DMPREP (.69)

Data: 2026-07-23  
Origem: `\\192.168.15.69\C$\Program Files (x86)\Dimep\DMPREP\`  
Análise: strings + reflexão .NET (**PowerShell x86** — DLL é 32-bit)

## Resumo executivo

| Item | Achado |
|------|--------|
| **Inttelix.Crypto.dll** | AES-128 / EC P-256 / Rijndael — biometria FaceLock, **não** RSA PrintPoint |
| **WatchComm.dll** | Protocolo PrintPoint TCP + **`RSAHelper.Encrypt`** — alvo principal |
| **HTTP Client Rest** | **Nenhuma** string `/v1/identification`, `confirmcommand`, `ClientRest` |
| **Envelope TCP→HTTP** | Hipótese forte mantida: mesmo frame binário cifrado no corpo HTTP |

## Constantes de frame PrintPoint III (runtime)

Extraídas de `PrintPointPacket` via reflexão:

| Campo | Valor |
|-------|-------|
| `START_ID` | **0xF8** |
| `STOP_ID` | **0xF0** |
| `PRINTPOINTIII_PROTOCOL_TYPE` | **0xA1** |
| `PRINTPOINTII_MINIPRINT_PROTOCOL_TYPE` | **0xA0** |
| `PRINTPOINT_PACKET_SIZE` | 8 |

Confirma que o frame de teste `F8 A1 70 01 00 00 D0 F0` segue o esqueleto oficial (STX + tipo III + payload + ETX).

## RSA — descoberta crítica

Classe: `org.cesar.dmplight.watchComm.encryption.RSAHelper`

```csharp
static byte[] Encrypt(byte[] data, string exponentHex, string modulusHex)
static RSAParameters ConstructRSAParameters(string exponentHex, string modulusHex)
```

**Ordem dos parâmetros:** expoente **primeiro**, módulo **depois** — o oposto do que assumíamos no gateway.

`ConstructRSAParameters('010001', modulus256hex)` → Modulus=128 bytes, Exponent=3 bytes ✓

### Ciphertext gerado (modulus ativo PrintPoint, expoente 010001)

| Plaintext | WatchComm `RSAHelper` (128 B) | Node `encryptRsaProbe` PKCS#1 |
|-----------|------------------------------|-------------------------------|
| vazio (0 B) | `5f68a6bd…` | `6b20a955…` |
| frame `F8 A1 70…` (8 B) | `4463c426…` | `60c0b0f6…` |

**Conclusão:** o gateway Node estava testando **padding/implementação errados**. O DMPREP usa a rotina proprietária `RSAHelper`, não PKCS#1 v1.5 puro do Node `publicEncrypt`.

Scripts de reprodução: `research/encrypt-test.ps1` (x86).

## API TCP relevante (WatchComm)

| Tipo | Método / campo |
|------|----------------|
| `AbstractProtocol` | `SendReceiveData`, **`EncryptData`**, **`DecryptData`** |
| `PrintPointPacket` | `GetPacket`, `UpdateCheckSum`, `PacketFactory` |
| `PrintPointDateTimeMessage` | `GetData()` — monta payload de data/hora |
| `MessageType` | `StatusInquiry`, `CollectWithoutRemoving`, `SetDateAndDST`, `Punch`, … |

Coleta manual DMPREP = `CollectWithoutRemoving` sobre TCP, não HTTP.

## O que ainda falta

1. **Decompilar** corpo de `RSAHelper.Encrypt` (dnSpy no `.69` ou notebook) — padding exato
2. Montar pacote completo via `PrintPointPacket.GetPacket()` + mensagem válida (ex. `StatusInquiry`)
3. **Teste live:** relógio → gateway; responder `/v1/identification` com ciphertext do `RSAHelper` (replay ou gerado)
4. Se `error=0`, repetir para comando **`CollectWithoutRemoving`**
5. Camada REST pura: se ausente no WatchComm, pode estar no **`DMPREP.exe` nativo** ou software terceiro (Secullum)

## Plano B (inalterado)

Captura/replay de software homologado (Secullum trial) se `RSAHelper` TCP ≠ envelope HTTP Client Rest.

## Arquivos locais (gitignored)

- `research/dimep-binaries/` — DLLs copiadas do .69
- `research/analysis-output/` — strings, reflexão, runtime-probe
- Scripts: `copy-dimep-binaries.ps1`, `analyze-dimep-dlls.ps1`, `reflect-watchcomm.ps1`, `encrypt-test.ps1`

## Próximo passo imediato

1. Instalar **dnSpy** numa máquina com acesso às DLLs
2. Abrir `WatchComm.dll` → `RSAHelper.Encrypt`
3. Portar lógica para `services/rep-gateway/src/security/rsa.ts` como perfil `watchcomm` **ou** usar bridge (`research/watchcomm-bridge.ps1`) + `REP_ACK_MODE=watchcomm-rsa` (implementado em 2026-07-23).

## Modo watchcomm-rsa (gateway)

1. Subir bridge no host Windows: `research/watchcomm-bridge.ps1` (porta 3003).
2. Configurar `E:/RH_eletropasso/config/rep-gateway.env`:
   - `REP_ACK_MODE=watchcomm-rsa`
   - `REP_WATCHCOMM_BRIDGE_URL=http://host.docker.internal:3003`
   - `REP_ACK_WATCHCOMM_PROBES=status-inquiry,inquiry-immediate-status,empty,frame70`
3. Reiniciar container `rep_gateway_printpoint`.
4. Sucesso = log `REP handshake probe result` com `deviceError=0`.

Probes gerados via `PacketFactory` (StatusInquiry = `F8A18001000020F0`, InquiryImediateStatus = `F8A18102000022F0`).
4. Testar ACK no relógio (`confirmcommand error=0`)

## Pivot TCP (2026-07-23, após desligar Client Rest)

Estado do relógio com **Habilita conexão = false**:

| Item | Resultado |
|------|-----------|
| Modo na UI | `Server` (não Client Rest) |
| TCP `:3000` | **OPEN** |
| Firmware app | `03.00.0028` |
| `CreateWatchCommVB6` (10 args) | OK com `firmwareVersion=03.00.0028` + RSA |
| `OpenConnection` + `PrintPointIII` | Envia `UpdateAESParameters` (**0xF7**); relógio responde **erro 1730**; `Connected=True` mesmo assim |
| Pós-1730 | **`InquiryEmployeer` OK**; **`InquiryMRPRecords(false,false,true,false)` OK** após `RepositioningMRPRecordsPointer` |
| `CollectWithoutRemoving` | `MessageType not supported` neste firmware/DLL — usar MRP |

### Caminho operacional (poller)

1. Ignorar falha 1730 do `OpenConnection` (AES Update).
2. `RepositioningMRPRecordsPointer(startNsr|date)`.
3. Loop: `InquiryMRPRecords` (só marcações) → mapear `MRPRecord_RegistrationMarkingPoint` → `ConfirmationReceiptMRPRecords` → avançar NSR.
4. Forward para `ingest-punches` (formato `NormalizedPunch`).

Scripts:

| Script | Uso |
|--------|-----|
| `research/prove-tcp-connect.ps1` | Prova TCP + CreateWatchComm |
| `research/collect-once-mrp.ps1` | Coleta única MRP → JSON punches |
| `scripts/watchcomm-poller/Run-WatchCommPoller.ps1` | Ciclo horario + ingest |
| `scripts/watchcomm-poller/Install-WatchCommPoller.ps1` | Task Scheduler |
| `scripts/watchcomm-poller/Find-MaxNsr.ps1` | Watermark bootstrap |

Client Rest permanece em **hold** (config cgi preservada). Rollback: religar **Habilita conexão** no browser `:80` (porta 3000 fecha).

### Nota sobre DLL 2015 / erro 1730

A `WatchComm.dll` do DMPREP (2015) não enumera o código 1730; Senior recomenda driver ≥ 5.0.0.12. **Não bloqueia** coleta MRP: employer + marcações funcionam sem AES negociado com sucesso.
