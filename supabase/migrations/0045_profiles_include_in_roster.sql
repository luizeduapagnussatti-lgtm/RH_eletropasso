-- ============================================================
-- profiles.include_in_roster — presença na grade de escalas
-- 0045_profiles_include_in_roster.sql
--
-- Elegibilidade de escala: ACTIVE + include_in_roster = true.
-- Backfill replica a regra antiga (EMPLOYEE/MANAGER/TEAM_LEAD ativos).
-- ============================================================

alter table public.profiles
  add column if not exists include_in_roster boolean not null default false;

comment on column public.profiles.include_in_roster is
  'Quando true (e status <> INACTIVE), o colaborador aparece na lista de escalas (sábado/feriado), independente do role.';

-- Backfill: quem já entrava nas escalas pela regra antiga
update public.profiles
set include_in_roster = true
where coalesce(status, 'ACTIVE') <> 'INACTIVE'
  and role in ('EMPLOYEE', 'MANAGER', 'TEAM_LEAD')
  and include_in_roster = false;
