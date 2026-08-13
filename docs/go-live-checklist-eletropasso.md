# Checklist go-live — RH Eletropasso (~1–2 h)

Use após merge na `dev` e antes de promover para `master`.

## Relógio / DMPREP

- [ ] `dmprep-sync` responde em `:3099` (`/health`)
- [ ] Poller WatchComm coleta batidas e `ingest-punches` grava no Supabase
- [ ] Handshake WatchComm usa `login`/`senha` + RSA do `/chave.cgi` (sem 1732) — ver `docs/watchcomm-printpoint-protocol.md`
- [ ] UI **Comunicação** envia comando ao relógio sem erro
- [ ] Toast/aviso se `:3099` estiver offline

## Autenticação / sessão

- [ ] Login → dashboard sem banner trial/upgrade
- [ ] Rede offline ~60 s **não** desloga (reconexão OK)
- [ ] Token inválido (401) **desloga** corretamente
- [ ] Sessão de ontem sem check-out é auto-fechada (toast + remark)

## Espelho PTRP

- [ ] Jornada completa (≥6 h) exige 4 batidas para aprovar
- [ ] PDF bloqueado até todos os dias aprovados
- [ ] Bulk aprovar/desaprovar no Resumo e Espelho didático

## RH operacional

- [ ] Férias: submit → e-mail pt-BR (webhook `leave-notifications`)
- [ ] Relatório diário cron → assunto/corpo pt-BR
- [ ] Relatório da UI Reports não fica `PENDING` (cron `cron-process-reports-queue`)
- [ ] Pré-folha: período APPROVED → ZIP contabilidade sem erro

## SaaS removido

- [ ] `/blog`, `/features`, `/about` redirecionam para login
- [ ] Tutoriais abrem autenticados (menu **Ajuda**)
- [ ] Super Admin: org única, sem ads/upgrade/blog

## Validação automatizada

```powershell
npm run test:rh
npm run build
```

## Deploy

- [ ] Edge Functions: `cron-daily-report`, `cron-process-reports-queue`, `leave-notifications`
- [ ] Cron `cron-process-reports-queue`: `*/2 * * * *`
- [ ] Webhook DB `public.leaves` → `leave-notifications`
- [ ] `CRON_SECRET` + `RESEND_API_KEY` configurados
