-- ============================================================
-- Work rosters — who works on Saturdays / optional holidays
-- 0024_work_rosters.sql
-- ============================================================

create table if not exists public.work_roster_assignments (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_date       date not null,
  employee_id     text not null,
  status          text not null default 'WORK'
    check (status in ('WORK', 'OFF')),
  day_kind        text not null default 'SATURDAY'
    check (day_kind in ('SATURDAY', 'HOLIDAY')),
  notes           text,
  created_by      text,
  created         timestamptz not null default now(),
  updated         timestamptz not null default now(),
  unique (organization_id, work_date, employee_id)
);

create index if not exists idx_work_roster_org_date
  on public.work_roster_assignments(organization_id, work_date);
create index if not exists idx_work_roster_employee
  on public.work_roster_assignments(organization_id, employee_id, work_date);

alter table public.work_roster_assignments enable row level security;

-- Everyone in the org can read (employees may see their own Saturday later)
create policy "work_roster_select" on public.work_roster_assignments for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);

-- Admin, HR, and Managers can create/update/delete
create policy "work_roster_insert" on public.work_roster_assignments for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN', 'HR', 'MANAGER'))
);
create policy "work_roster_update" on public.work_roster_assignments for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN', 'HR', 'MANAGER'))
);
create policy "work_roster_delete" on public.work_roster_assignments for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN', 'HR', 'MANAGER'))
);

grant all on public.work_roster_assignments to anon, authenticated, service_role;
