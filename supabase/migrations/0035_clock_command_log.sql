-- ============================================================
-- PrintPoint clock command audit log (generic WatchComm ops)
-- 0035_clock_command_log.sql
-- ============================================================

create table if not exists public.clock_command_log (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  operation        text not null,
  status           text not null check (status in ('SUCCESS', 'ERROR')),
  payload_summary  jsonb,
  result           jsonb,
  performed_by     uuid references public.profiles(id) on delete set null,
  error_message    text,
  created          timestamptz not null default now()
);

create index if not exists idx_clock_command_log_org
  on public.clock_command_log(organization_id, created desc);

create index if not exists idx_clock_command_log_op
  on public.clock_command_log(organization_id, operation, created desc);

alter table public.clock_command_log enable row level security;

revoke all on public.clock_command_log from anon, authenticated;
grant all on public.clock_command_log to service_role;
