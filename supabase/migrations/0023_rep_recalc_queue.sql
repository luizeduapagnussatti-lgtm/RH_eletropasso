-- ============================================================
-- REP gateway — asynchronous timesheet recalculation queue
-- One pending job per organization/employee/local work date.
-- ============================================================

create table if not exists public.timesheet_recalc_queue (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  employee_id      text not null,
  work_date        date not null,
  status           text not null default 'PENDING'
                   check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts         integer not null default 0,
  last_error       text,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  processed_at     timestamptz,
  unique (organization_id, employee_id, work_date)
);

create index if not exists idx_timesheet_recalc_queue_pending
  on public.timesheet_recalc_queue(status, created)
  where status in ('PENDING', 'FAILED');

alter table public.timesheet_recalc_queue enable row level security;

create policy "timesheet_recalc_queue_select"
  on public.timesheet_recalc_queue for select using (
    public.is_super_admin()
    or (
      organization_id = public.auth_org_id()
      and public.auth_role() in ('ADMIN', 'HR')
    )
  );

grant all on public.timesheet_recalc_queue to service_role;
grant select on public.timesheet_recalc_queue to authenticated;

-- Clock writes use service_role inside ingest-punches. Direct browser inserts
-- are limited to HR/Admin manual adjustments instead of every org member.
drop policy if exists "punches_insert" on public.punches;
create policy "punches_insert" on public.punches for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR')
  )
);
