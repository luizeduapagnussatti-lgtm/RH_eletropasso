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

Intervalo padrão: **1 hora** (`DMPREP_POLL_INTERVAL_MS=3600000`).

Como as batidas ocorrem em poucos momentos do dia (entrada, intervalo saída/retorno,
saída), o poll longo reduz carga no servidor. Use o botão **Sincronizar DMPREP**
no OpenHR quando precisar de atualização imediata. Máximo configurável: 4 horas.

## Sincronização manual (botão no OpenHR)

O serviço expõe um **control plane HTTP** local:

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/status` | GET | Cursor + último sync |
| `/sync` | POST | Importa cadastros e/ou batidas |

Autenticação: header `x-dmprep-sync-key` (ou `Authorization: Bearer`).

Corpo JSON opcional: `{ "scope": "all" | "employees" | "punches" }`.

No OpenHR, ADMIN/HR vê o painel **Organização → Sistema → Sincronização DMPREP**.
A Edge Function `dmprep-sync` faz proxy autenticado para este serviço.

Secrets da Edge Function (`supabase/functions/.env`):

```env
# Edge runtime roda em Docker — use host.docker.internal (Windows/macOS Docker Desktop)
DMPREP_SYNC_URL=http://host.docker.internal:3099
DMPREP_SYNC_API_KEY=<same as DMPREP_HTTP_API_KEY>
DMPREP_SYNC_TIMEOUT_MS=120000
```

O serviço local deve escutar em **`DMPREP_HTTP_HOST=0.0.0.0`** (não `127.0.0.1`)
para o container da Edge Function alcançar a porta `3099`.

Com o stack Supabase local, suba também as Edge Functions (o runtime embutido
fica parado por padrão):

```powershell
cd C:\xampp\htdocs\RH_eletropasso
npx supabase functions serve --env-file supabase/functions/.env
```

Requisitos adicionais para import de cadastros:

- `DMPREP_MDB_PATH` apontando para o `DIMEP.MDB`
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` no `.env` do serviço
- Python + `pip install access-parser` no servidor do sync

## Relação com rep-gateway

| Componente | Papel |
|------------|-------|
| **dmprep-sync** | Importação via DMPREP/MOVIMENT (**Opção B — ativo**) |
| **rep-gateway** | Client Rest HTTP (**discovery — handshake ainda bloqueado**) |

Não desligue o DMPREP enquanto o sync estiver em produção; ele é quem coleta
as batidas do relógio e atualiza o `MOVIMENT.txt`.

Documentação de admissão/desligamento e limites de export DIMEP → relógio:
`docs/dmprep-lifecycle.md`.

## Testes

```powershell
npm test
```
