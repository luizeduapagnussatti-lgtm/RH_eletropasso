-- ============================================================
-- Per-weekday schedule overrides on shifts (e.g. Saturday half-day)
-- 0022_shift_day_schedules.sql
-- ============================================================

alter table public.shifts
  add column if not exists day_schedules jsonb not null default '{}'::jsonb;
