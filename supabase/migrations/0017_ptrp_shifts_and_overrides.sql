-- ============================================================
-- PTRP Sprint 1 — Extend shifts (normative journey) + persist shift_overrides
-- 0017_ptrp_shifts_and_overrides.sql
-- ============================================================

-- Extend shifts with Portaria 671 / CLT-oriented fields
alter table public.shifts
  add column if not exists code text,
  add column if not exists schedule_type text not null default 'FIXED'
    check (schedule_type in ('FIXED', 'FLEXIBLE', 'SHIFT_12X36', 'SCALE')),
  add column if not exists break_duration_minutes integer not null default 60,
  add column if not exists break_flexible boolean not null default true,
  add column if not exists break_earliest_start time,
  add column if not exists break_latest_end time,
  add column if not exists expected_daily_minutes integer not null default 480,
  add column if not exists expected_weekly_minutes integer not null default 2640,
  add column if not exists night_start time not null default '22:00',
  add column if not exists night_end time not null default '05:00',
  add column if not exists overtime_to_bank boolean not null default true,
  add column if not exists active boolean not null default true;

-- Backfill expected_daily from start/end when possible (gross − default break 60)
update public.shifts
set expected_daily_minutes = greatest(
  0,
  (extract(epoch from (end_time - start_time)) / 60)::integer - coalesce(break_duration_minutes, 60)
)
where expected_daily_minutes = 480
  and end_time is not null
  and start_time is not null
  and end_time > start_time;

-- Temporary shift assignments (was in-memory only)
create table if not exists public.shift_overrides (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     text not null,
  shift_id        uuid not null references public.shifts(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  reason          text,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists idx_shift_overrides_org on public.shift_overrides(organization_id);
create index if not exists idx_shift_overrides_employee_dates
  on public.shift_overrides(organization_id, employee_id, start_date, end_date);

alter table public.shift_overrides enable row level security;

create policy "shift_overrides_select" on public.shift_overrides for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "shift_overrides_insert" on public.shift_overrides for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "shift_overrides_update" on public.shift_overrides for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "shift_overrides_delete" on public.shift_overrides for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

grant all on public.shift_overrides to anon, authenticated, service_role;
