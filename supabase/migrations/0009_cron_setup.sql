-- ============================================================
-- OpenHR — Cron Job Setup
-- 0009_cron_setup.sql
--
-- Enables pg_net (HTTP from SQL) for Edge Function triggers.
-- Schedules pure-SQL cleanup cron jobs via pg_cron.
--
-- Edge Function cron schedules (auto_close_sessions, auto_expire_trials,
-- auto_absent_check, daily_attendance_report, attendance_reminders,
-- review_cycle_transition) are set up separately in
-- scripts/setup-cron-edge-functions.sql after deploying Edge Functions.
-- ============================================================

-- pg_cron + pg_net (local Supabase runs migrations as superuser)
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
grant usage on schema cron to postgres;
grant all on all tables in schema cron to postgres;

-- ============================================================
-- NOTIFICATION CLEANUP — Daily 3 AM UTC
-- Deletes notifications older than 30 days to keep table lean.
-- Retention period can be extended by changing the interval.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'notification-cleanup',
      '0 3 * * *',
      $cron$
        delete from public.notifications
        where created < now() - interval '30 days';
      $cron$
    );
  else
    raise notice 'pg_cron unavailable — skipping notification-cleanup schedule';
  end if;
end $$;

-- ============================================================
-- SELFIE CLEANUP — Daily 2 AM UTC
-- Clears selfie storage path on old attendance rows.
-- Note: actual Storage objects are deleted via Edge Function
-- cron-selfie-storage-cleanup (scheduled separately) because
-- Supabase Storage deletion requires service role HTTP call.
-- This SQL step nulls the path reference so the app stops
-- serving broken URLs immediately.
-- ============================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'selfie-cleanup',
      '0 2 * * *',
      $cron$
        update public.attendance
        set
          selfie = null,
          updated = now()
        where
          date < current_date - interval '30 days'
          and selfie is not null;
      $cron$
    );
  else
    raise notice 'pg_cron unavailable — skipping selfie-cleanup schedule';
  end if;
end $$;
