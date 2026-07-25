-- ============================================================
-- PrintPoint clock supervisors (DMP REP "Supervisores de Relógio")
-- 0034_clock_supervisors.sql
-- ============================================================

create table if not exists public.clock_supervisors (
  id                         uuid primary key default uuid_generate_v4(),
  organization_id            uuid not null references public.organizations(id) on delete cascade,
  profile_id                 uuid references public.profiles(id) on delete set null,
  code                       text not null check (code ~ '^[0-9]{1,20}$'),
  pis                        text not null check (pis ~ '^[0-9]{12}$'),
  name                       text not null check (char_length(trim(name)) between 2 and 120),
  password_ciphertext        text not null,
  has_technical_permission   boolean not null default true,
  has_datetime_permission    boolean not null default true,
  has_pendrive_permission    boolean not null default true,
  has_bobbin_permission      boolean not null default false,
  is_active                  boolean not null default true,
  created_by                 uuid references public.profiles(id) on delete set null,
  updated_by                 uuid references public.profiles(id) on delete set null,
  created                    timestamptz not null default now(),
  updated                    timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists idx_clock_supervisors_org
  on public.clock_supervisors(organization_id, is_active);

create table if not exists public.clock_supervisor_command_log (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  action           text not null check (action in ('SEND', 'CLEAR')),
  status           text not null check (status in ('SUCCESS', 'ERROR')),
  supervisor_count integer not null default 0,
  performed_by     uuid references public.profiles(id) on delete set null,
  error_message    text,
  created          timestamptz not null default now()
);

create index if not exists idx_clock_supervisor_command_log_org
  on public.clock_supervisor_command_log(organization_id, created desc);

create or replace function public.enforce_clock_supervisor_limit()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.is_active then
    select count(*) into active_count
    from public.clock_supervisors
    where organization_id = new.organization_id
      and is_active
      and id <> new.id;
    if active_count >= 5 then
      raise exception 'CLOCK_SUPERVISOR_LIMIT';
    end if;
  end if;
  new.updated := now();
  return new;
end;
$$;

drop trigger if exists trg_clock_supervisor_limit on public.clock_supervisors;
create trigger trg_clock_supervisor_limit
before insert or update on public.clock_supervisors
for each row execute function public.enforce_clock_supervisor_limit();

alter table public.clock_supervisors enable row level security;
alter table public.clock_supervisor_command_log enable row level security;

-- Supervisors contain encrypted credentials. Browser roles never access the
-- tables directly; the authenticated Edge Function validates ADMIN and uses
-- service_role. This also prevents ciphertext exfiltration through Data API.
revoke all on public.clock_supervisors from anon, authenticated;
revoke all on public.clock_supervisor_command_log from anon, authenticated;
grant all on public.clock_supervisors to service_role;
grant all on public.clock_supervisor_command_log to service_role;
