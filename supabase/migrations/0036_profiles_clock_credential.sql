-- ============================================================
-- Clock credential (PrintPoint Matrícula/ID) ≠ from PIS
-- 0036_profiles_clock_credential.sql
-- ============================================================

alter table public.profiles
  add column if not exists clock_credential text;

comment on column public.profiles.employee_id is
  'PIS / NIS (folha eSocial). Not necessarily the PrintPoint keypad ID.';
comment on column public.profiles.clock_credential is
  'Credencial/Matrícula do relógio (funções 91/92 e MOVIMENT). 1–12 digits, stored zero-padded to 12.';

-- One clock credential per org when set
create unique index if not exists idx_profiles_org_clock_credential_unique
  on public.profiles (organization_id, clock_credential)
  where clock_credential is not null and clock_credential <> '';

create index if not exists idx_profiles_clock_credential
  on public.profiles (organization_id, clock_credential)
  where clock_credential is not null and clock_credential <> '';
