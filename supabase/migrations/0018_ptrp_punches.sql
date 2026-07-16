-- ============================================================
-- PTRP Sprint 2 — punches (REP / clock source of truth)
-- 0018_ptrp_punches.sql
-- ============================================================

create table if not exists public.punches (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  employee_id      text not null,
  punched_at       timestamptz not null,
  direction        text not null default 'UNKNOWN'
                   check (direction in ('IN','OUT','BREAK_START','BREAK_END','UNKNOWN')),
  source           text not null default 'CLOCK'
                   check (source in ('CLOCK','MANUAL','IMPORT','SYSTEM')),
  device_id        text,
  nsr              text,
  raw_payload      jsonb,
  timesheet_day_id uuid,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now()
);

create index if not exists idx_punches_org_employee_time
  on public.punches(organization_id, employee_id, punched_at);
create index if not exists idx_punches_org_date
  on public.punches(organization_id, punched_at);

create unique index if not exists idx_punches_org_device_nsr
  on public.punches(organization_id, device_id, nsr)
  where nsr is not null and device_id is not null;

alter table public.punches enable row level security;

create policy "punches_select" on public.punches for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "punches_insert" on public.punches for insert with check (
  public.is_super_admin()
  or organization_id = public.auth_org_id()
);
create policy "punches_update" on public.punches for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "punches_delete" on public.punches for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

grant all on public.punches to anon, authenticated, service_role;
