-- ============================================================
-- Per-employee timesheet review workflow (espelho de ponto)
-- 0026_timesheet_employee_reviews.sql
-- ============================================================

create table if not exists public.timesheet_employee_reviews (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  period_id        uuid not null references public.timesheet_periods(id) on delete cascade,
  employee_id      text not null,
  profile_id       uuid references public.profiles(id) on delete set null,
  status           text not null default 'OPEN'
                   check (status in ('OPEN','IN_REVIEW','APPROVED')),
  submitted_at     timestamptz,
  submitted_by     uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  approved_by      uuid references public.profiles(id) on delete set null,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  unique (period_id, employee_id)
);

create index if not exists idx_timesheet_employee_reviews_period
  on public.timesheet_employee_reviews(period_id);

create index if not exists idx_timesheet_employee_reviews_org
  on public.timesheet_employee_reviews(organization_id, period_id);

alter table public.timesheet_employee_reviews enable row level security;

create policy "timesheet_employee_reviews_select"
  on public.timesheet_employee_reviews for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);

create policy "timesheet_employee_reviews_insert"
  on public.timesheet_employee_reviews for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "timesheet_employee_reviews_update"
  on public.timesheet_employee_reviews for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);

create policy "timesheet_employee_reviews_delete"
  on public.timesheet_employee_reviews for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

grant all on public.timesheet_employee_reviews to anon, authenticated, service_role;
