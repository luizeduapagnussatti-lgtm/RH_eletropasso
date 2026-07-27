-- ============================================================
-- eSocial Sprint 8/9 — extend esocial_events workflow
-- 0030_esocial_events_extend.sql
-- ============================================================

alter table public.esocial_events
  drop constraint if exists esocial_events_status_check;

alter table public.esocial_events
  add column if not exists xml_content text,
  add column if not exists validation_errors jsonb not null default '[]'::jsonb;

alter table public.esocial_events
  add constraint esocial_events_status_check
  check (status in (
    'DRAFT','READY','VALIDATED','ERROR','EXPORTED',
    'SENT_TO_ACCOUNTANT','TRANSMITTED','ACCEPTED'
  ));

-- payroll_consolidations: night hours column
alter table public.payroll_consolidations
  add column if not exists night_hours numeric(10,2) not null default 0;
