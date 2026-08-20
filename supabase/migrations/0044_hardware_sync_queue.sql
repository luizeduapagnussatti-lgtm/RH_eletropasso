-- ============================================================
-- Hardware sync queue + clock discharge status (Dimep / PrintPoint)
-- 0044_hardware_sync_queue.sql
--
-- Prevents credential reuse after soft-discharge and tracks
-- pending ADD/REMOVE employee commands until the clock confirms.
-- ============================================================

-- Rastreia exclusão do colaborador no relógio após demissão no RH
do $$ begin
  create type public.clock_discharge_status as enum (
    'NOT_APPLICABLE',
    'PENDING_HARDWARE',
    'HARDWARE_CONFIRMED',
    'HARDWARE_FAILED'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists clock_discharge_status public.clock_discharge_status
  not null default 'NOT_APPLICABLE';

comment on column public.profiles.clock_discharge_status is
  'Após demissão: PENDING_HARDWARE até ExcludeEmployeesList confirmar no PrintPoint. Credencial (clock_credential) NÃO deve ser apagada no desligamento.';

create index if not exists idx_profiles_discharge_pending
  on public.profiles (organization_id, clock_discharge_status)
  where clock_discharge_status = 'PENDING_HARDWARE';

-- Backfill: demitidos com PIS já tratado como "não aplicável" se não há pendência conhecida
update public.profiles
set clock_discharge_status = 'NOT_APPLICABLE'
where coalesce(status, 'ACTIVE') = 'INACTIVE'
  and clock_discharge_status = 'NOT_APPLICABLE';

-- Fila de sincronização com o hardware
do $$ begin
  create type public.hardware_command_type as enum (
    'ADD_EMPLOYEE',
    'REMOVE_EMPLOYEE',
    'UPDATE_EMPLOYEE',
    'ADD_BIOMETRIC',
    'REMOVE_BIOMETRIC'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.hardware_sync_status as enum (
    'PENDING',
    'IN_PROGRESS',
    'CONFIRMED',
    'FAILED',
    'CANCELLED'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.hardware_sync_queue (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  command_type        public.hardware_command_type not null,
  target_employee_id  uuid references public.profiles(id) on delete set null,
  status              public.hardware_sync_status not null default 'PENDING',
  payload             jsonb not null default '{}'::jsonb,
  hardware_response   jsonb,
  error_message       text,
  attempt_count       int not null default 0,
  max_attempts        int not null default 3,
  last_attempt_at     timestamptz,
  next_retry_at       timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.hardware_sync_queue is
  'Fila persistente de comandos WatchComm (cadastro/exclusão). RH processa manualmente até CONFIRMED.';

create index if not exists idx_sync_queue_pending
  on public.hardware_sync_queue (organization_id, status, next_retry_at)
  where status in ('PENDING', 'IN_PROGRESS');

create index if not exists idx_sync_queue_employee
  on public.hardware_sync_queue (target_employee_id, created_at desc);

create index if not exists idx_sync_queue_org_created
  on public.hardware_sync_queue (organization_id, created_at desc);

alter table public.hardware_sync_queue enable row level security;

drop policy if exists "hardware_sync_queue_select" on public.hardware_sync_queue;
create policy "hardware_sync_queue_select" on public.hardware_sync_queue for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'SUPER_ADMIN')
  )
);

drop policy if exists "hardware_sync_queue_insert" on public.hardware_sync_queue;
create policy "hardware_sync_queue_insert" on public.hardware_sync_queue for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'SUPER_ADMIN')
  )
);

drop policy if exists "hardware_sync_queue_update" on public.hardware_sync_queue;
create policy "hardware_sync_queue_update" on public.hardware_sync_queue for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'SUPER_ADMIN')
  )
);

revoke all on public.hardware_sync_queue from anon;
grant select, insert, update on public.hardware_sync_queue to authenticated;
grant all on public.hardware_sync_queue to service_role;
