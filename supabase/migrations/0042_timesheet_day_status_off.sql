-- ============================================================
-- timesheet_days: add OFF (sem expediente) status
-- 0042_timesheet_day_status_off.sql
-- ============================================================

alter table public.timesheet_days
  drop constraint if exists timesheet_days_status_check;

alter table public.timesheet_days
  add constraint timesheet_days_status_check
  check (status in (
    'OK',
    'LATE',
    'ABSENT',
    'LEAVE',
    'HOLIDAY',
    'INCOMPLETE',
    'ADJUSTED',
    'OFF'
  ));

comment on column public.timesheet_days.status is
  'OK|LATE|ABSENT|LEAVE|HOLIDAY|INCOMPLETE|ADJUSTED|OFF — OFF = non-working day (Sunday/roster OFF), not absence.';
