-- ============================================================
-- PTRP Sprint 3 — timesheet periods/days + hour bank ledger
-- 0019_ptrp_timesheet_and_bank.sql
-- ============================================================

create table if not exists public.timesheet_periods (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  year             integer not null,
  month            integer not null check (month between 1 and 12),
  start_date       date not null,
  end_date         date not null,
  status           text not null default 'OPEN'
                   check (status in ('OPEN','IN_REVIEW','APPROVED','LOCKED')),
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  notes            text,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  unique (organization_id, year, month)
);

create index if not exists idx_timesheet_periods_org
  on public.timesheet_periods(organization_id);

create table if not exists public.timesheet_days (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  period_id           uuid not null references public.timesheet_periods(id) on delete cascade,
  employee_id         text not null,
  work_date           date not null,
  shift_id            uuid references public.shifts(id) on delete set null,
  expected_minutes    integer not null default 0,
  worked_minutes      integer not null default 0,
  break_minutes       integer not null default 0,
  late_minutes        integer not null default 0,
  early_out_minutes   integer not null default 0,
  overtime_minutes    integer not null default 0,
  night_minutes       integer not null default 0,
  absence_minutes     integer not null default 0,
  status              text not null default 'INCOMPLETE'
                      check (status in ('OK','LATE','ABSENT','LEAVE','HOLIDAY','INCOMPLETE','ADJUSTED')),
  leave_request_id    text,
  first_punch_at      timestamptz,
  last_punch_at       timestamptz,
  calc_version        integer not null default 1,
  manual_adjustment   jsonb,
  employee_ack        boolean not null default false,
  manager_ack         boolean not null default false,
  remarks             text,
  created             timestamptz not null default now(),
  updated             timestamptz not null default now(),
  unique (organization_id, employee_id, work_date)
);

create index if not exists idx_timesheet_days_period
  on public.timesheet_days(period_id);
create index if not exists idx_timesheet_days_employee
  on public.timesheet_days(organization_id, employee_id, work_date);

-- Link punches → day after consolidation
alter table public.punches
  drop constraint if exists fk_punches_timesheet_day;
alter table public.punches
  add constraint fk_punches_timesheet_day
  foreign key (timesheet_day_id) references public.timesheet_days(id) on delete set null;

create table if not exists public.hour_bank_ledger (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  employee_id       text not null,
  entry_date        date not null,
  minutes_delta     integer not null,
  entry_type        text not null
                    check (entry_type in ('OT_CREDIT','ABSENCE_DEBIT','COMPENSATION','MANUAL','PERIOD_CLOSE')),
  timesheet_day_id  uuid references public.timesheet_days(id) on delete set null,
  period_id         uuid references public.timesheet_periods(id) on delete set null,
  balance_after     integer,
  created_by        text,
  notes             text,
  created           timestamptz not null default now()
);

create index if not exists idx_hour_bank_employee
  on public.hour_bank_ledger(organization_id, employee_id, entry_date);

-- Stub eSocial events (Sprint 5) — create early so export can land
create table if not exists public.esocial_events (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  period_id        uuid references public.timesheet_periods(id) on delete set null,
  event_type       text not null,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'DRAFT'
                   check (status in ('DRAFT','READY','EXPORTED')),
  created          timestamptz not null default now(),
  updated          timestamptz not null default now()
);

create index if not exists idx_esocial_events_org
  on public.esocial_events(organization_id);

-- RLS
alter table public.timesheet_periods enable row level security;
alter table public.timesheet_days enable row level security;
alter table public.hour_bank_ledger enable row level security;
alter table public.esocial_events enable row level security;

create policy "timesheet_periods_select" on public.timesheet_periods for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "timesheet_periods_insert" on public.timesheet_periods for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "timesheet_periods_update" on public.timesheet_periods for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "timesheet_periods_delete" on public.timesheet_periods for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "timesheet_days_select" on public.timesheet_days for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "timesheet_days_insert" on public.timesheet_days for insert with check (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "timesheet_days_update" on public.timesheet_days for update using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "timesheet_days_delete" on public.timesheet_days for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "hour_bank_ledger_select" on public.hour_bank_ledger for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "hour_bank_ledger_insert" on public.hour_bank_ledger for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "hour_bank_ledger_update" on public.hour_bank_ledger for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "hour_bank_ledger_delete" on public.hour_bank_ledger for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "esocial_events_select" on public.esocial_events for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "esocial_events_insert" on public.esocial_events for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "esocial_events_update" on public.esocial_events for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "esocial_events_delete" on public.esocial_events for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

grant all on public.timesheet_periods to anon, authenticated, service_role;
grant all on public.timesheet_days to anon, authenticated, service_role;
grant all on public.hour_bank_ledger to anon, authenticated, service_role;
grant all on public.esocial_events to anon, authenticated, service_role;
