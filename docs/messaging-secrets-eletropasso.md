# Messaging — Secrets e deploy (Eletropasso)

## Remetentes

| Canal | Valor |
|-------|-------|
| E-mail | `suporte@eletropasso.com.br` |
| WhatsApp | `54981159982` (Evolution / chat_eletropasso) |

## Supabase Edge Function secrets

Configure no projeto Supabase (Settings → Edge Functions → Secrets):

```
RESEND_API_KEY=<sua chave Resend>
MESSAGING_FROM_EMAIL=Eletropasso RH <suporte@eletropasso.com.br>
WHATSAPP_FROM=54981159982
EVOLUTION_API_URL=http://<host-vm>:8080
EVOLUTION_API_KEY=<apikey do Evolution>
EVOLUTION_INSTANCE=eletropasso
```

> Extrair `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCE` do compose em `C:\eletropasso-infra\atendimento\`.

## Resend

- Verificar domínio `eletropasso.com.br` no Resend antes do go-live.
- Sender padrão: `suporte@eletropasso.com.br`.

## Evolution API (não-oficial)

- Instância deve estar conectada (QR escaneado) antes de enviar.
- Endpoint usado: `POST {EVOLUTION_API_URL}/message/sendText/{instance}` e `sendMedia`.
- Rate limit recomendado: ~1 msg/s em lotes grandes.

## Deploy

```powershell
# Aplicar migration
.\scripts\Apply-SupabaseMigrations.ps1

# Deploy Edge Function
supabase functions deploy messaging-dispatch
```

## Health-check

`POST /functions/v1/messaging-dispatch` com body `{ "action": "health" }` (JWT ADMIN/HR).
