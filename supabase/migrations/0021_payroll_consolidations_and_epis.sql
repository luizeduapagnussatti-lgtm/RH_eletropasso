-- ============================================================
-- SESMT (NR-6 EPI) + Pré-folha (payroll consolidations)
-- 0021_payroll_consolidations_and_epis.sql
-- ============================================================

-- ------------------------------------------------------------
-- equipments — EPI catalog (CA + validity window in days)
-- ------------------------------------------------------------
create table if not exists public.equipments (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  ca_number        text not null,
  validity_days    integer not null check (validity_days > 0),
  description      text,
  is_active        boolean not null default true,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  unique (organization_id, ca_number)
);

create index if not exists idx_equipments_org
  on public.equipments(organization_id);
create index if not exists idx_equipments_org_active
  on public.equipments(organization_id, is_active);

-- ------------------------------------------------------------
-- employee_epis — delivery sheet / digital acceptance
-- employee_id → profiles(id) (= auth.users.id)
-- ------------------------------------------------------------
create table if not exists public.employee_epis (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  equipment_id     uuid not null references public.equipments(id) on delete restrict,
  delivery_date    date not null,
  due_date         date not null,
  is_signed        boolean not null default false,
  signed_at        timestamptz,
  notes            text,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  check (due_date >= delivery_date)
);

create index if not exists idx_employee_epis_org_employee
  on public.employee_epis(organization_id, employee_id);
create index if not exists idx_employee_epis_org_due
  on public.employee_epis(organization_id, due_date);
create index if not exists idx_employee_epis_equipment
  on public.employee_epis(equipment_id);

-- ------------------------------------------------------------
-- payroll_consolidations — monthly pre-payroll hour snapshot
-- Aggregated from timesheet_days (minutes → hours in app layer).
-- Join to PTRP: timesheet_days.employee_id = profiles.id::text
-- ------------------------------------------------------------
create table if not exists public.payroll_consolidations (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  employee_id      uuid not null references public.profiles(id) on delete cascade,
  period_id        uuid references public.timesheet_periods(id) on delete set null,
  reference_month  date not null
                   check (extract(day from reference_month) = 1),
  regular_hours    numeric(10,2) not null default 0,
  extra_hours_50   numeric(10,2) not null default 0,
  extra_hours_100  numeric(10,2) not null default 0,
  absence_hours    numeric(10,2) not null default 0,
  status           text not null default 'DRAFT'
                   check (status in ('DRAFT','APPROVED','LOCKED')),
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  notes            text,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  unique (organization_id, employee_id, reference_month)
);

create index if not exists idx_payroll_consolidations_org_month
  on public.payroll_consolidations(organization_id, reference_month);
create index if not exists idx_payroll_consolidations_employee
  on public.payroll_consolidations(organization_id, employee_id);
create index if not exists idx_payroll_consolidations_period
  on public.payroll_consolidations(period_id);

-- ============================================================
-- RLS
-- ============================================================
alter table public.equipments enable row level security;
alter table public.employee_epis enable row level security;
alter table public.payroll_consolidations enable row level security;

-- equipments: org-wide read; ADMIN/HR/MANAGER write; ADMIN/HR delete
create policy "equipments_select" on public.equipments for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "equipments_insert" on public.equipments for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "equipments_update" on public.equipments for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "equipments_delete" on public.equipments for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

-- employee_epis: self or managers read; managers write; self may update own row (sign)
create policy "employee_epis_select" on public.employee_epis for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      employee_id = auth.uid()
      or public.auth_role() in ('ADMIN','HR','MANAGER')
    )
  )
);
create policy "employee_epis_insert" on public.employee_epis for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "employee_epis_update" on public.employee_epis for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN','HR','MANAGER')
      or employee_id = auth.uid()
    )
  )
);
create policy "employee_epis_delete" on public.employee_epis for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

-- payroll_consolidations: self or managers read; ADMIN/HR/MANAGER write; ADMIN/HR delete
create policy "payroll_consolidations_select" on public.payroll_consolidations for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      employee_id = auth.uid()
      or public.auth_role() in ('ADMIN','HR','MANAGER')
    )
  )
);
create policy "payroll_consolidations_insert" on public.payroll_consolidations for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "payroll_consolidations_update" on public.payroll_consolidations for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "payroll_consolidations_delete" on public.payroll_consolidations for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

-- ============================================================
-- Grants (match PTRP migrations)
-- ============================================================
grant all on public.equipments to anon, authenticated, service_role;
grant all on public.employee_epis to anon, authenticated, service_role;
grant all on public.payroll_consolidations to anon, authenticated, service_role;
