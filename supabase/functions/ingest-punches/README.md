# ingest-punches

Edge Function that receives batches of clock (REP) punches and writes them to `public.punches`.

## Auth

Set secret `PUNCH_INGEST_API_KEY` (or reuse `CRON_SECRET`).

Send either:
- `Authorization: Bearer <key>`
- `x-ingest-key: <key>`

## Body

```json
{
  "organizationId": "<uuid>",
  "punches": [
    {
      "employeeId": "MAT001",
      "punchedAt": "2026-07-15T08:01:00-03:00",
      "direction": "IN",
      "deviceId": "REP-01",
      "nsr": "12345",
      "raw": {}
    }
  ]
}
```

Rows with `deviceId` + `nsr` are upserted (idempotent). Others are inserted.

## After ingest

Call `hrService.recalculateTimesheetDay(employeeId, date)` or `recalculateTimesheetPeriod(year, month)` from the app (RH) or a scheduled job. Do **not** use frozen `workdaySessionManager` / `sessionManager` for this path.

## Deploy

```bash
supabase functions deploy ingest-punches
supabase secrets set PUNCH_INGEST_API_KEY=...
```
