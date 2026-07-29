-- ============================================================
-- WhatsApp / E-mail messaging bridge (Evolution API + Resend)
-- 0043_messaging_whatsapp.sql
-- ============================================================

alter table public.profiles
  add column if not exists whatsapp_e164 text,
  add column if not exists whatsapp_opt_in boolean not null default false,
  add column if not exists messaging_channel_pref text[] not null default array['APP', 'EMAIL']::text[];

comment on column public.profiles.whatsapp_e164 is 'Normalized E.164 digits (e.g. 5548981159982) for WhatsApp dispatch';
comment on column public.profiles.whatsapp_opt_in is 'LGPD opt-in for WhatsApp notifications from RH';
comment on column public.profiles.messaging_channel_pref is 'Preferred channels: APP, EMAIL, WHATSAPP';

-- Backfill whatsapp_e164 from mobile (Brazil heuristic)
update public.profiles p
set whatsapp_e164 = case
  when regexp_replace(coalesce(p.mobile, ''), '\D', '', 'g') ~ '^55[0-9]{10,11}$'
    then regexp_replace(p.mobile, '\D', '', 'g')
  when length(regexp_replace(coalesce(p.mobile, ''), '\D', '', 'g')) in (10, 11)
    then '55' || regexp_replace(p.mobile, '\D', '', 'g')
  else null
end
where p.whatsapp_e164 is null
  and coalesce(p.mobile, '') <> '';

create table if not exists public.messaging_outbox (
  id                    uuid primary key default uuid_generate_v4(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  channel               text not null check (channel in ('EMAIL', 'WHATSAPP')),
  recipient_profile_id  uuid references public.profiles(id) on delete set null,
  recipient             text not null,
  subject               text,
  body                  text not null,
  media_file_name       text,
  status                text not null default 'PENDING'
    check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  error_message         text,
  reference_type        text,
  reference_id          text,
  sent_at               timestamptz,
  created               timestamptz not null default now(),
  updated               timestamptz not null default now()
);

create index if not exists idx_messaging_outbox_org_created
  on public.messaging_outbox(organization_id, created desc);

create index if not exists idx_messaging_outbox_ref
  on public.messaging_outbox(organization_id, reference_type, reference_id);

create index if not exists idx_messaging_outbox_status
  on public.messaging_outbox(organization_id, status);

alter table public.messaging_outbox enable row level security;

create policy "messaging_outbox_select" on public.messaging_outbox for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
  )
);

create policy "messaging_outbox_insert" on public.messaging_outbox for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR')
  )
);

create policy "messaging_outbox_update" on public.messaging_outbox for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR')
  )
);

grant all on public.messaging_outbox to anon, authenticated, service_role;
