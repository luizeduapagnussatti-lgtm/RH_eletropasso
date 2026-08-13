# WatchComm TCP Poller (PrintPoint III)

Coleta batidas via TCP `:3000` (modo Server / Client Rest desligado) usando
`WatchComm.dll` + `InquiryMRPRecords`, e encaminha para `ingest-punches`.

Protocolo, handshake RSA/AES, erros **1730/1732** e incidente de ago/2026:
[`docs/watchcomm-printpoint-protocol.md`](../../docs/watchcomm-printpoint-protocol.md).

## Pre-requisitos

1. No relógio: **Habilita conexão** desmarcado (porta TCP 3000 aberta).
2. Host `.245` com PowerShell **x86** (SysWOW64) — DLL 32-bit.
3. DLLs em `scripts/watchcomm-poller/lib/dimep-binaries/`.
4. Chave `ingestApiKey` válida no `config.json`.

## Instalacao

```powershell
cd C:\xampp\htdocs\RH_eletropasso\scripts\watchcomm-poller
copy config.example.json config.json
# editar ingestApiKey / caminhos se necessario
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-WatchCommPoller.ps1
```

A instalacao:

- Cria a tarefa `OpenHR-WatchComm-Poller` (**segunda-feira 09:00** por padrao)
- Legado diario: `Install-WatchCommPoller.ps1 -ScheduleHours 9,15,19`
- Legado horario: `Install-WatchCommPoller.ps1 -IntervalHours 1`
- Com `-Bootstrap`: grava watermark NSR **sem** enviar historico ao RH (so na primeira instalacao)

> O watchdog `RH_Eletropasso_DmprepSync_Watchdog` (a cada 5 min) **nao coleta batidas** —
> so reinicia o servico dmprep-sync se a porta 3099 cair.

## Ciclo operacional

1. Conecta WatchComm TCP com protocolo **PrintPoint III**, RSA (256 hex) e
   usuario/senha de comunicacao (padrao de fabrica **`login` / `senha`**).
   Sem essas credenciais o `OpenConnection` falha com **1730** (AES) e os
   comandos seguintes com **1732** (Invalid Message).
2. `RepositioningMRPRecordsPointer` a partir de `lastNsr+1`
3. `InquiryMRPRecords` (marcacoes) em lotes + `ConfirmationReceiptMRPRecords`
4. POST `ingest-punches` (idempotente por NSR)
5. Atualiza `state.json`

## Rollback Client Rest

No browser do REP (`:80`): marcar de novo **Habilita conexão**.
A porta 3000 fecha; o poller passa a falhar ate religar o modo Server.

## Teste manual

```powershell
& "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" `
  -NoProfile -ExecutionPolicy Bypass `
  -File .\Run-WatchCommPoller.ps1 -ConfigPath .\config.json
```

## Modificações Gerais — supervisores

O RH usa as mesmas operações do menu DMP REP:

- **Enviar Supervisores:** `AddMaster(...)` + `SendMasterList()`
- **Limpeza de Supervisores:** `ClearMasterList()`

Os comandos passam pelo `dmprep-sync` e pelo mesmo lock da coleta de
batidas, portanto nunca concorrem no canal TCP.

UI: **Comunicação → Relógio de Ponto → Supervisores** (Organização → Sistema
só mantém um atalho).

```powershell
& "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" `
  -NoProfile -ExecutionPolicy Bypass `
  -File .\Send-WatchCommMasters.ps1 `
  -Action Send -PayloadPath .\masters-temporario.json `
  -ConfigPath .\config.json

# Destrutivo: remove todos os masters do equipamento
& "$env:WINDIR\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" `
  -NoProfile -ExecutionPolicy Bypass `
  -File .\Send-WatchCommMasters.ps1 `
  -Action Clear -ConfigPath .\config.json
```

Fluxo seguro de recuperação: cadastrar no RH → **Limpeza** → **Enviar** →
no relógio, `F1` → `91` → código → senha.

## Dispatcher genérico (`Invoke-WatchCommCommand.ps1`)

Operações allowlisted (diagnóstico, data/hora, empregados, biometria,
configurações, empregador) via scope `clock-command` no `dmprep-sync` e
Edge Function `clock-command`. Denylist permanente: firmware, erase MRP,
ClearAllRegisters, etc.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\Test-WatchCommContract.ps1
```

Mensagens de display (`SendDisplayMessage`) retornam `supported=false` no
PrintPoint III atual (`PPIII_UnknownFunction`) — a UI trata como aviso.
