# API payroll-export (OpenHR)

Edge Function: `GET /functions/v1/payroll-export`

Retorna o JSON v1 da pré-folha consolidada (mesmo formato do botão **Exportar JSON** na UI).

## Autenticação

Uma das opções:

1. **Bearer JWT** — usuário ADMIN/HR autenticado (header `Authorization: Bearer <access_token>`).
2. **API key org** — header `x-payroll-api-key: <key>` (tabela `org_api_keys`, scope `payroll:read`).

## Query params

| Param | Obrigatório | Descrição |
|-------|-------------|-----------|
| `periodId` | sim* | UUID do `timesheet_periods` |
| `organizationId` | sim* | UUID da org (com year+month) |
| `year` | com orgId | Ano competência |
| `month` | com orgId | Mês competência (1–12) |

\* Informe `periodId` **ou** (`organizationId` + `year` + `month`).

## Exemplo

```bash
curl -sS \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://<project>.supabase.co/functions/v1/payroll-export?periodId=<uuid>"
```

Com API key:

```bash
curl -sS \
  -H "x-payroll-api-key: $PAYROLL_API_KEY" \
  "https://<project>.supabase.co/functions/v1/payroll-export?organizationId=<uuid>&year=2026&month=7"
```

## Respostas

| Código | Significado |
|--------|-------------|
| 200 | JSON v1 (`version`, `competencia`, `empregador`, `colaboradores`) |
| 400 | Parâmetros inválidos |
| 401 | Não autenticado |
| 403 | Sem permissão / org mismatch |
| 404 | Período ou consolidação não encontrada |
| 409 | Período não APPROVED/LOCKED |

## Pré-requisitos

1. CNPJ configurado em Organização → Sistema → Dados eSocial.
2. Competência **APPROVED** ou **LOCKED**.
3. Pré-folha gerada (`payroll_consolidations` populada) — a API tenta ler consolidações existentes.

Ver também: [esocial-processo-eletropasso.md](./esocial-processo-eletropasso.md)
