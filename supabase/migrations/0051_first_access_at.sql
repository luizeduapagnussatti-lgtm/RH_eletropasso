-- ============================================================
-- First access (PWA) — claim by CPF
-- 0051_first_access_at.sql
-- ============================================================

alter table public.profiles
  add column if not exists first_access_at timestamptz;

comment on column public.profiles.first_access_at is
  'Set when the employee completes first-access claim (CPF → real email + password). NULL = not claimed yet.';

-- One ACTIVE CPF per org (empty/null CPF allowed for non-PWA staff)
create unique index if not exists idx_profiles_org_cpf_unique
  on public.profiles (organization_id, cpf)
  where cpf is not null and cpf <> '' and status = 'ACTIVE';
