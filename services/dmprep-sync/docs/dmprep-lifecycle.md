# DMPREP ↔ Relógio — fluxo RH-first (2026-07-23)

## Resumo

O **RH_Eletropasso** é a fonte da verdade para cadastro. Dois identificadores distintos:

| Campo RH | Uso |
|----------|-----|
| `employee_id` (PIS) | Folha, eSocial |
| `clock_credential` (Credencial) | Relógio funções **91/92**, coluna **Matrícula/Credencial** no DIMEP.MDB, match de batidas |

O export grava no **DIMEP.MDB** (`PIS` + `Credencial` separados) e **substitui** cadastrar manualmente no software DMP REP.

**Biometria** é cadastrada e excluída **no relógio físico** PrintPoint SmartPoint B (Manual §3.5 e §3.6) — **não** via Operações REP do DMPREP. O teclado do PrintPoint aceita a **Credencial/ID (Matrícula)**, não o PIS.

## Fluxo de admissão

```mermaid
flowchart LR
  RH[RH wizard + PIS + Credencial] --> Export[Enviar para DMPREP]
  Export --> MDB[DIMEP.MDB]
  MDB --> Clock["Relógio função 91"]
  Clock --> Punch[Batida → RH automático]
```

1. Cadastrar colaborador no RH (PIS + Credencial do relógio; se Credencial vazia, usa PIS).
2. **Enviar para DMPREP** — grava no MDB `PIS` e `Credencial` (DMP REP **fechado** durante export).
3. No **PrintPoint SmartPoint B**: F1 → **91** → supervisor → **Credencial/ID** (não PIS) → 2 dedos (2 leituras cada).
4. Primeira batida → status **Pronto** no RH (coleta automática ~1 h).

**Não é necessário** abrir o DMP REP para recadastrar após export bem-sucedido.

## Fluxo de desligamento

```mermaid
flowchart LR
  Clock92["Relógio função 92"] --> MDB[RH remove MDB]
  MDB --> RHDel[Excluir conta RH]
```

1. **Obrigatório:** no relógio, F1 → **92** → supervisor → **Credencial/ID** → «Digital excluída com sucesso» (§3.6).
2. RH remove cadastro do MDB (automático ao excluir conta).
3. (Opcional) Coletar batidas finais.
4. Excluir conta no RH.

**Excluir no RH não apaga biometria do relógio** — faça o passo 1 antes.

## Atalhos no relógio (SmartPoint B)

| Função | Teclas | Manual |
|--------|--------|--------|
| Inclusão de digitais | F1 → 91 → E | §3.5 |
| Exclusão de digitais | F1 → 92 → E | §3.6 |

Sequência: supervisor → **credencial do colaborador (Matrícula)** → operação de dedo(s).

## Coleta de batidas

PrintPoint → WatchComm/poller (servidor .245) → ingest-punches → espelho de ponto.

Handshake, RSA e erro 1732: `docs/watchcomm-printpoint-protocol.md`.

O ingest resolve batidas por `clock_credential` **ou** `employee_id` (PIS), e grava o punch com o PIS canônico.

Import legado DMPREP → RH (`import employees`) lê `PIS` → `employee_id` e `Credencial` → `clock_credential` (inclui backfill para quem já está no RH).

## Supervisores e console do relógio

Em **Comunicação → Relógio de Ponto** (ADMIN):

1. cadastra supervisores (aba Supervisores) — até 5 ativos;
2. **Limpeza** + **Enviar** (masters via WatchComm);
3. diagnostica o equipamento (série, memória, empregador, status);
4. envia/remove empregados e digitais (aba Empregados);
5. ajusta data/hora; configurações sensíveis exigem digitar `ALTERAR`.

Organização → Sistema mantém apenas um atalho para o console.

A senha de supervisor é cifrada na Edge Function com
`CLOCK_SUPERVISOR_ENCRYPTION_KEY` (fallback local: `SUPABASE_SERVICE_ROLE_KEY`),
não volta ao navegador e só é decifrada em `send-masters`. Comandos genéricos
usam `Invoke-WatchCommCommand.ps1` + scope `clock-command`, com auditoria em
`clock_command_log`. Ambos compartilham `withSyncLock` com a coleta.

Recuperação do master biométrico antigo: **Limpeza → Enviar novo
supervisor → F1 → 91 → código → senha**.

## Limitações

- Captura de digital continua no equipamento (função 91); o RH envia a credencial.
- Mensagens de display não são suportadas neste firmware PrintPoint III.
- Até 5 supervisores ativos por organização.
