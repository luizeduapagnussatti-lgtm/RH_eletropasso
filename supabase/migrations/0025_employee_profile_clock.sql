-- ============================================================
-- Employee profile extensions — CPF, status, clock onboarding
-- 0025_employee_profile_clock.sql
-- ============================================================

alter table public.profiles
  add column if not exists cpf text,
  add column if not exists status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'ON_LEAVE')),
  add column if not exists clock_onboarding_status text not null default 'NOT_APPLICABLE'
    check (clock_onboarding_status in (
      'NOT_APPLICABLE', 'PENDING_EXPORT', 'PENDING_BIO', 'READY', 'ERROR'
    )),
  add column if not exists clock_onboarding_at timestamptz,
  add column if not exists clock_onboarding_notes text;

-- One PIS/credential per org (nullable employee_id allowed for non-punching staff)
create unique index if not exists idx_profiles_org_employee_id_unique
  on public.profiles (organization_id, employee_id)
  where employee_id is not null and employee_id <> '';

create index if not exists idx_profiles_clock_onboarding
  on public.profiles (organization_id, clock_onboarding_status)
  where clock_onboarding_status not in ('NOT_APPLICABLE', 'READY');
