# WatchComm TCP Poller (PrintPoint III)

Coleta batidas via TCP `:3000` (modo Server / Client Rest desligado) usando
`WatchComm.dll` + `InquiryMRPRecords`, e encaminha para `ingest-punches`.

## Pre-requisitos

1. No relógio: **Habilita conexão** desmarcado (porta TCP 3000 aberta).
2. Host `.245` com PowerShell **x86** (SysWOW64) — DLL 32-bit.
3. DLLs em `services/rep-gateway/research/dimep-binaries/`.
4. Chave `ingestApiKey` válida no `config.json`.

## Instalacao

```powershell
cd C:\xampp\htdocs\RH_eletropasso\scripts\watchcomm-poller
copy config.example.json config.json
# editar ingestApiKey / caminhos se necessario
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-WatchCommPoller.ps1
```

A instalacao:

- Cria a tarefa `OpenHR-WatchComm-Poller` (**a cada 1 hora**; ajuste com `-IntervalHours` no Install)
- Com `-Bootstrap`: grava watermark NSR **sem** enviar historico ao RH (so na primeira instalacao)

## Ciclo operacional

1. Conecta WatchComm TCP (`OpenConnection` pode avisar erro **1730** AES — ignoravel)
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
