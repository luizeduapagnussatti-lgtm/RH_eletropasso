-- ============================================================
-- Folha Eletropasso — handoff contabilidade + ciência na folha
-- 0031_payroll_accounting_workflow.sql
-- ============================================================

create table if not exists public.payroll_accounting_handoffs (
  id                   uuid primary key default uuid_generate_v4(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  period_id            uuid not null references public.timesheet_periods(id) on delete cascade,
  workflow_status      text not null default 'READY'
                       check (workflow_status in (
                         'READY',
                         'SENT_TO_ACCOUNTING',
                         'FOLHA_RECEIVED',
                         'ACK_COLLECTING',
                         'CLOSED'
                       )),
  sent_to_accounting_at timestamptz,
  sent_by              uuid references public.profiles(id) on delete set null,
  folha_received_at    timestamptz,
  folha_received_by    uuid references public.profiles(id) on delete set null,
  closed_at            timestamptz,
  notes                text,
  created              timestamptz not null default now(),
  updated              timestamptz not null default now(),
  unique (organization_id, period_id)
);

create index if not exists idx_payroll_handoffs_org_period
  on public.payroll_accounting_handoffs(organization_id, period_id);

create table if not exists public.payroll_payment_slips (
  id                   uuid primary key default uuid_generate_v4(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  period_id            uuid not null references public.timesheet_periods(id) on delete cascade,
  employee_id          uuid not null references public.profiles(id) on delete cascade,
  -- Referência OpenHR (espelho no envio)
  ref_regular_hours    numeric(10,2) not null default 0,
  ref_he50_hours       numeric(10,2) not null default 0,
  ref_he100_hours      numeric(10,2) not null default 0,
  ref_night_hours      numeric(10,2) not null default 0,
  ref_late_hours       numeric(10,2) not null default 0,
  ref_absence_hours    numeric(10,2) not null default 0,
  -- Valores na folha devolvida pela contabilidade (opcional)
  acc_he50_hours       numeric(10,2),
  acc_he100_hours      numeric(10,2),
  acc_night_hours      numeric(10,2),
  acc_late_hours       numeric(10,2),
  acc_absence_hours    numeric(10,2),
  slip_file_path       text,
  acknowledgment_status text not null default 'PENDING'
                       check (acknowledgment_status in (
                         'PENDING', 'SIGNED', 'CORRECTION_REQUESTED'
                       )),
  signed_at            timestamptz,
  correction_notes     text,
  created              timestamptz not null default now(),
  updated              timestamptz not null default now(),
  unique (organization_id, period_id, employee_id)
);

create index if not exists idx_payroll_slips_period
  on public.payroll_payment_slips(organization_id, period_id);

alter table public.payroll_consolidations
  add column if not exists late_hours numeric(10,2) not null default 0;

alter table public.payroll_accounting_handoffs enable row level security;
alter table public.payroll_payment_slips enable row level security;

create policy "payroll_handoffs_select" on public.payroll_accounting_handoffs for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "payroll_handoffs_insert" on public.payroll_accounting_handoffs for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "payroll_handoffs_update" on public.payroll_accounting_handoffs for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "payroll_handoffs_delete" on public.payroll_accounting_handoffs for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "payroll_slips_select" on public.payroll_payment_slips for select using (
  public.is_super_admin()
  or organization_id = public.auth_org_id()
);
create policy "payroll_slips_insert" on public.payroll_payment_slips for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "payroll_slips_update" on public.payroll_payment_slips for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN','HR')
      or employee_id = auth.uid()
    )
  )
);
create policy "payroll_slips_delete" on public.payroll_payment_slips for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

grant all on public.payroll_accounting_handoffs to anon, authenticated, service_role;
grant all on public.payroll_payment_slips to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payroll-slips',
  'payroll-slips',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy "payroll_slips_storage_select" on storage.objects for select using (
  bucket_id = 'payroll-slips' and (
    public.is_super_admin()
    or public.auth_role() in ('ADMIN','HR','MANAGER')
    or (storage.foldername(name))[2] = auth.uid()::text
  )
);
create policy "payroll_slips_storage_insert" on storage.objects for insert with check (
  bucket_id = 'payroll-slips' and auth.uid() is not null
  and public.auth_role() in ('ADMIN','HR')
);
create policy "payroll_slips_storage_update" on storage.objects for update using (
  bucket_id = 'payroll-slips' and public.auth_role() in ('ADMIN','HR')
);
create policy "payroll_slips_storage_delete" on storage.objects for delete using (
  bucket_id = 'payroll-slips' and public.auth_role() in ('ADMIN','HR')
);
