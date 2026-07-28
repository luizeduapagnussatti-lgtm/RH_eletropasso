-- 0040_clock_biometric_registered.sql
-- RH-managed flag: biometric enrolled on PrintPoint (manual confirmation).
-- The clock fingerprint-list-read is unreliable on SmartPoint B (error 1730).

alter table public.profiles
  add column if not exists clock_biometric_registered boolean not null default false;

comment on column public.profiles.clock_biometric_registered is
  'RH confirma que a biometria foi cadastrada no PrintPoint (funções 91). Fonte de verdade na UI — não depende da leitura WatchComm.';

-- Existing punching staff already have biometrics on the device.
update public.profiles
set clock_biometric_registered = true
where role in ('EMPLOYEE', 'MANAGER', 'TEAM_LEAD')
  and coalesce(status, 'ACTIVE') = 'ACTIVE';

create index if not exists idx_profiles_clock_biometric
  on public.profiles (organization_id, clock_biometric_registered)
  where clock_biometric_registered = false;
