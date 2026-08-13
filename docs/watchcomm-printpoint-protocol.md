# Protocolo WatchComm — PrintPoint SmartPoint B (Eletropasso)

Fonte operacional do canal relógio ↔ RH. Atualizado em **2026-08-13** após
liquidar o erro **1732** (Invalid Message).

O Client Rest HTTP (`rep-gateway`) **não** é o caminho de produção. Produção
usa **WatchComm.dll** em TCP `:3000` (modo Server).

---

## Equipamento

| Campo | Valor |
|-------|-------|
| Modelo | DIMEP PrintPoint III / SmartPoint B |
| Série | `00003004820030709` |
| Firmware | `03.00.0028` |
| IP | `192.168.15.201` |
| Porta de protocolo | **TCP 3000** |
| Página web | `http://192.168.15.201/` (`repConfig.html`, porta 80) |
| Identificação equipamento | `1` |
| Empregador | ELETROPASSO COMERCIAL ELETRICA LTDA |
| CNPJ | `01267333000144` |
| Servidor RH | `192.168.15.245` |

Config de produção: `E:\RH_eletropasso\config\watchcomm-poller.json`  
DLLs 32-bit: `scripts/watchcomm-poller/lib/dimep-binaries/`  
Scripts: `scripts/watchcomm-poller/` (PowerShell **x86** / SysWOW64).

Não confundir a porta **3000 do servidor RH** (frontend Vite) com a porta
**3000 do relógio**. O WatchComm aponta para `192.168.15.201:3000`.

---

## O protocolo (sim, existe)

Não é REST. É o protocolo proprietário **WatchComm / PrintPoint III**:

```
RH (PowerShell x86)
  → WatchComm.dll  CreateWatchCommVB6 (PrintPointIII, ConnectedMode)
  → TCP 192.168.15.201:3000
  → handshake RSA (módulo 1024 bits / 256 hex + expoente 010001)
  → sessão AES (UpdateAESParameters)
  → comandos binários (frame STX/ETX)
```

Frame PrintPoint III (constantes da DLL):

| Campo | Valor |
|-------|-------|
| START | `0xF8` |
| Protocolo III | `0xA1` |
| STOP | `0xF0` |

Exemplo público (TOTVS / status de comando anterior, não destrutivo):

```
F8 A1 70 01 00 00 D0 F0
```

A criptografia da **comunicação** no firmware atual é **RSA 1024 + AES**,
exposta pela `WatchComm.dll` (`RSAHelper.Encrypt`). O manual antigo cita
curva P-256; isso vale para outras linhas (FaceLock / Inttelix.Crypto),
não para este PrintPoint III.

Construtor usado em produção (10 argumentos):

```text
CreateWatchCommVB6(
  protocolType,      // PrintPointIII
  tcpComm,           // IP + porta 3000
  watchAddress,      // equipmentId = 1
  accessKey,         // em branco (só se o REP tiver chave de acesso)
  connectionType,    // ConnectedMode
  firmwareVersion,   // 03.00.0028
  RSAPublicKey,      // 256 hex
  RSAExponent,       // 010001
  user,              // login  ← obrigatório
  password           // senha  ← obrigatório
)
```

`DisconnectedMode` não abre sessão neste firmware
(`This method can only be used if you use the connected mode`).

### Comandos que o RH usa

| Operação | Método WatchComm |
|----------|------------------|
| Abrir sessão | `OpenConnection` |
| Empregador | `InquiryEmployeer` |
| Status | `GetPrintPointStatus`, `GetImmediateStatus` |
| Coleta | `RepositioningMRPRecordsPointer` + `InquiryMRPRecords` + `ConfirmationReceiptMRPRecords` |
| Empregados | `InquiryEmployeeList`, `AddEmployee` + `IncludeEmployeesList`, `ExcludeEmployeesList` |
| Supervisores | `AddMaster` + `SendMasterList`, `ClearMasterList` |
| Fechar | `CloseConnection` |

`CollectWithoutRemoving` **não** existe neste firmware
(`MessageType not supported`). Coleta = MRP.

`InquirySerialNumber` / `GetFirmwareVersion` / `GetMAC` podem falhar com
“protocol type does not support this function” — **não** indica queda do
canal. Série e firmware ficam no config.

### Dois modos de rede no equipamento

| Modo | Como | Porta | Uso Eletropasso |
|------|------|-------|-----------------|
| **Server** (WatchComm) | **Habilita conexão** desmarcado | TCP **3000** aberta | **Produção** |
| **Client Rest** | **Habilita conexão** marcado | 3000 fecha; relógio inicia HTTP para o servidor | **Não usar** |

Estado cgi lido em 2026-08-13 (`POST /conexaoClient.cgi`):

```
ccHab=false          ← Server / WatchComm (correto)
ccTipo=1             ← Client Rest (valor guardado, inerte enquanto Hab=false)
ccEndIP=192.168.15.245
ccPorta=80
ccIdentEquip=1
ccIdentCliente=01267333000144
ccUrlConex=192.168.15.245
```

Marcações (`POST /configMarcacoes.cgi`): teclado + cartão habilitados,
código **Credencial** (`mtTipo=0`), autenticação **biometria ou senha**.

---

## Handshake: RSA + usuário/senha

### Chave RSA (pública do relógio)

Lida ao vivo em 2026-08-13 via `POST /chave.cgi` (o firmware responde
**HTTP/0.9**, sem status line — `curl --http0.9` ou TCP cru na porta 80):

```
ccChave=916CA83A303938982FC68C1B158E3DB9E34C2CA294F35251154E9B87BF69F1E82E3E0225CFFBB9632609444DA7977A3633471B536395BBE3533506300E10544EBDCFC33FB484FE4B94FD727FA0E857B1B82EE811D6BE84AEB3B1B66DAA85DB329F5E5E74E9D8EA9F929AE781FBF16430D12229B533BEE3921358F4139E4ADBBF
ccExpoente=010001
```

256 caracteres hex = RSA 1024 bits. **Idêntica** a `modulusHex` /
`exponentHex` em `watchcomm-poller.json` (arquivo datado 24/07/2026).
A chave **não** havia sido regenerada.

Como reler (fechar o browser em seguida):

```powershell
curl.exe -sS -m 12 --http0.9 -X POST --data-raw '@#$Obter$#@=true' `
  -H 'Content-Type: application/x-www-form-urlencoded' `
  http://192.168.15.201/chave.cgi
```

No equipamento: **F1 → 45** exporta a chave para pen drive; **F1 → 46**
**gera um par novo**. Se alguém rodar F1+46 sem atualizar `modulusHex`,
o canal quebra de novo.

### Usuário e senha de comunicação (causa do 1732)

Documentação DIMEP / integradores (Viasoft, TOTVS, Secullum):

| Campo | Padrão de fábrica |
|-------|-------------------|
| Usuário | `login` |
| Senha | `senha` |
| Access Key | vazio (só se cadastrada no REP) |

Esses **não** são o supervisor biométrico (F1 → 91). São o par do
handshake AES (`UpdateCommunicationUser` na UI do RH).

Até 2026-08-13 o RH chamava `CreateWatchCommVB6` com `user=""` e
`password=""`. A TCP subia (`Connected=True`), mas o AES falhava.

---

## Erros WatchComm

| Código | Nome na DLL | Significado operacional |
|--------|-------------|-------------------------|
| **1730** | (AES / UpdateAESParameters) | Handshake AES recusado. Quase sempre **credencial de comunicação vazia ou errada**. |
| **1732** | `InvalidMessageException` (“Watch has returned an Invalid Message response”) | Comando recusado **depois** de sessão AES inválida, menu aberto, página web ocupando o canal, ou RSA errada. |
| — | `This protocol type does not support this function` | Método inexistente neste firmware. Ignorar para série/MAC. |

### Matriz ao vivo (2026-08-13, relógio na tela inicial, browser fechado)

| Sessão | OpenConnection | Status / Empregador / Coleta |
|--------|----------------|------------------------------|
| `user=""`, `password=""` | **1730**, `Connected=True` | **1732** em tudo |
| `login` / `senha` | **OK**, sem 1730 | **OK** (CNPJ, MRP, lista) |
| `admin` / `admin` | 1730, Connected=True | Status/empregador OK neste teste (não usar em produção) |
| `DisconnectedMode` + login/senha | “only connected mode” | Não é o caminho |

Conclusão: produção = **ConnectedMode + `login` / `senha` + RSA atual**.
O 1730 **não** deve mais ser tratado como “aviso ignorável” se vier
acompanhado de 1732 nos comandos seguintes.

Nota histórica (2026-07-23): com a DLL 2015 do DMPREP o 1730 às vezes
deixava a sessão “andando” e a coleta MRP funcionava mesmo assim. Em
agosto/2026 isso deixou de ser verdade — o relógio passou a recusar
todo comando sem o par login/senha.

---

## Cronologia do incidente (ago/2026)

| Quando | O que aconteceu |
|--------|-----------------|
| 2026-08-06 09:00 | Última coleta boa (10 batidas, lastNsr **54952**) |
| 2026-08-06 15:00 em diante | Poller falha (`collect nao gerou JSON` / depois `Reposition failed: 1732`) |
| 2026-08-12 | UI passou a gravar o 1732 em vez de esconder o erro |
| 2026-08-13 manhã | TCP 201:3000 aberta; RSA no cgi = RSA no config; **Habilita conexão** off; browser da config ocupava o canal |
| 2026-08-13 09:22 | Handshake com `login`/`senha`: OpenConnection limpo, empregador OK, coleta OK |
| 2026-08-13 09:24 | Fila drenada: **207** batidas (06/08–12/08) ingeridas; lastNsr **55167** |

Hipótese do “funcionava há poucos dias”: a sessão AES ainda era aceita
com user vazio (ou o 1730 era tolerado). Depois o firmware passou a
exigir o handshake completo → 1732 em InquiryEmployeer / Reposition /
lista.

---

## Regras operacionais (não quebrar de novo)

1. **Habilita conexão** desmarcado (modo Server). Não ligar Client Rest.
2. Relógio na **tela de ponto** (hora / passe o dedo). Sem menu supervisor.
3. **Não deixar** `http://192.168.15.201` aberto no browser — a página web
   usa o mesmo canal TCP e provoca 1732.
4. Não rodar **F1+46** (gerar RSA) sem atualizar `modulusHex` + `exponentHex`.
5. Não alterar usuário/senha de comunicação na UI do RH sem gravar
   `commUser` / `commPassword` no config do poller.
6. Um cliente de cada vez na porta 3000 do relógio (`dmprep-sync` e o
   poller compartilham lock).
7. PowerShell **x86**. A DLL é 32-bit.
8. Envio de empregado: **PIS 12 dígitos** + **credencial curta** (teclado).
   O relógio autentica por **Credencial**, não por PIS.

Config esperado:

```json
"commUser": "login",
"commPassword": "senha",
"accessKey": "",
"modulusHex": "<256 hex do /chave.cgi>",
"exponentHex": "010001"
```

---

## Como testar o canal

```powershell
$x86 = "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
$cfg  = "E:\RH_eletropasso\config\watchcomm-poller.json"
$inv  = "C:\xampp\htdocs\RH_eletropasso\scripts\watchcomm-poller\Invoke-WatchCommCommand.ps1"

# 1) empregador (prova o handshake)
& $x86 -NoProfile -ExecutionPolicy Bypass -File $inv `
  -Operation employer-read -ConfigPath $cfg

# 2) coleta + ingest (produção)
& $x86 -NoProfile -ExecutionPolicy Bypass `
  -File C:\xampp\htdocs\RH_eletropasso\scripts\watchcomm-poller\Run-WatchCommPoller.ps1 `
  -ConfigPath $cfg
```

Sucesso: `OpenConnection OK Connected=True` **sem** 1730, empregador com
CNPJ `01267333000144`, JSON da coleta com `"success": true`.

Na UI: **Comunicação → Relógio de Ponto → Diagnóstico / Coletar batidas**.

---

## Referências

- Manual PrintPoint III: comunicação TCP porta 3000; F1+45 exporta RSA;
  F1+46 gera chave; sem a chave correta não há comunicação.
- [TOTVS TSA — PrintPoint III](https://tdn.totvs.com/display/TSA/DT_Integracao_REP_DIMEP_PrintPoint_III):
  módulo RSA + expoente `010001` (base 16); login/senha padrão.
- Integradores (Viasoft / Secullum): `login` / `senha`, firmware
  `03.00.xxxx`, chave RSA 256 hex.
- Histórico interno (git): `services/rep-gateway/docs/protocol-discovery-2026-07-16.md`
  (Client Rest — abandonado) e `protocol-discovery-watchcomm-2026-07-23.md`
  (TCP MRP; 1730 então tolerado). Arquivos removidos com o gateway;
  o conteúdo vigente está neste documento.
- Código: `scripts/watchcomm-poller/lib/collect-once-mrp.ps1`,
  `Invoke-WatchCommCommand.ps1`, `lib/WatchComm-RsaCore.ps1`.
- Commit da correção: `4e5078d` (`fix(clock): handshake WatchComm com login/senha elimina o erro 1732`).
