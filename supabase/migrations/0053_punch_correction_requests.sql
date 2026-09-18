-- ============================================================
-- Employee punch correction requests (ajuste de ponto)
-- 0053_punch_correction_requests.sql
-- ============================================================

create table if not exists public.punch_correction_requests (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  employee_id         text not null,
  profile_id          uuid references public.profiles(id) on delete cascade,
  work_date           date not null,
  reason              text not null,
  status              text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid references public.profiles(id) on delete set null,
  resolver_comment    text
);

create index if not exists idx_punch_corr_org_status
  on public.punch_correction_requests(organization_id, status);

create index if not exists idx_punch_corr_employee
  on public.punch_correction_requests(organization_id, employee_id);

create index if not exists idx_punch_corr_profile
  on public.punch_correction_requests(organization_id, profile_id);

create index if not exists idx_punch_corr_work_date
  on public.punch_correction_requests(organization_id, work_date);

-- One active request per employee/day
create unique index if not exists idx_punch_corr_active_day
  on public.punch_correction_requests(organization_id, employee_id, work_date)
  where status = 'PENDING';

alter table public.punch_correction_requests enable row level security;

create policy "punch_corr_select" on public.punch_correction_requests for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD')
      or profile_id = auth.uid()
      or employee_id = (select employee_id from public.profiles where id = auth.uid())
    )
  )
);

create policy "punch_corr_insert" on public.punch_correction_requests for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and status = 'PENDING'
    and (
      profile_id = auth.uid()
      or employee_id = (select employee_id from public.profiles where id = auth.uid())
    )
  )
);

create policy "punch_corr_update" on public.punch_correction_requests for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD')
      or (
        profile_id = auth.uid()
        and status = 'PENDING'
      )
    )
  )
);

grant all on public.punch_correction_requests to anon, authenticated, service_role;
