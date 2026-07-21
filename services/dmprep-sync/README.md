# dmprep-sync

Importa batidas coletadas pelo **DMP REP** a partir do arquivo `MOVIMENT.txt`
e encaminha para a Edge Function `ingest-punches` do OpenHR.

Este é o caminho **Opção B**: usa o protocolo nativo DIMEP já comprovado pelo
DMPREP (TCP binário relógio ↔ software), sem depender do handshake Client Rest
HTTP do PrintPoint III.

## Formato MOVIMENT.txt

Cada linha tem **28 caracteres**:

```
TTTT + CREDENCIAL(12) + DDMMYYYY(8) + HHMM(4)
0001 + 026740847000   + 26052026    + 0747
```

A credencial de 12 dígitos é o **PIS zero-padded** usado pelo relógio.

## Pré-requisitos

1. DMPREP conectado ao PrintPoint III (coleta periódica funcionando).
2. Acesso SMB de leitura ao `MOVIMENT.txt` no PC do DMPREP (`192.168.15.69`).
3. Secrets Supabase configurados em `ingest-punches`:
   - `PUNCH_INGEST_API_KEY`
   - `PUNCH_INGEST_ORGANIZATION_ID`
   - `PUNCH_INGEST_DEVICE_SERIAL=00003004820030709`
4. Funcionários com `profiles.employee_id` igual à matrícula **ou** PIS
   (11/12 dígitos). O ingest normaliza `026740847000` ↔ `26740847000`.

## Configuração

```powershell
cd services/dmprep-sync
copy .env.example .env
# editar .env com URL/chave/organização Supabase
npm install
npm run build
npm start
```

Para desenvolvimento:

```powershell
npm run dev
```

## Cursor / idempotência

O serviço persiste `{ recordCount, fileSize, lastModifiedMs }` em
`DMPREP_STATE_PATH`. A cada poll:

- parseia o arquivo inteiro e importa apenas registros após `recordCount`;
- gera NSR `{deviceSerial}:{credencial12}:{DDMMYYYYHHMM}`;
- envia lotes de até 100 punches para `ingest-punches`;
- duplicatas são ignoradas pelo índice único `(org, device_id, nsr)`.

Se o arquivo encolher (rotação/truncagem), o cursor é resetado com alerta no log.

## Deploy sugerido

Rodar como **serviço Windows** ou **tarefa agendada** no servidor
`192.168.15.245` (ou no próprio `192.168.15.69`), com conta que tenha leitura
SMB no caminho UNC do MOVIMENT.

Intervalo padrão: **90 segundos** (`DMPREP_POLL_INTERVAL_MS=90000`).

## Relação com rep-gateway

| Componente | Papel |
|------------|-------|
| **dmprep-sync** | Importação via DMPREP/MOVIMENT (**Opção B — ativo**) |
| **rep-gateway** | Client Rest HTTP (**discovery — handshake ainda bloqueado**) |

Não desligue o DMPREP enquanto o sync estiver em produção; ele é quem coleta
as batidas do relógio e atualiza o `MOVIMENT.txt`.

## Testes

```powershell
npm test
```
