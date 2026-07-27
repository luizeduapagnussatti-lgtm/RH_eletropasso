-- ============================================================
-- Employee-initiated Saturday/holiday roster swap requests
-- 0033_roster_swap_requests.sql
-- ============================================================

create table if not exists public.roster_swap_requests (
  id                      uuid primary key default uuid_generate_v4(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  work_date               date not null,
  day_kind                text not null check (day_kind in ('SATURDAY', 'HOLIDAY')),
  requester_employee_id   text not null,
  requester_profile_id    uuid references public.profiles(id) on delete set null,
  target_employee_id      text not null,
  target_profile_id       uuid references public.profiles(id) on delete set null,
  status                  text not null default 'PENDING_PEER'
    check (status in ('PENDING_PEER', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reason                  text,
  peer_responded_at       timestamptz,
  resolved_at             timestamptz,
  resolved_by             uuid references public.profiles(id) on delete set null,
  created                 timestamptz not null default now(),
  updated                 timestamptz not null default now()
);

create index if not exists idx_roster_swap_org_status
  on public.roster_swap_requests(organization_id, status);

create index if not exists idx_roster_swap_requester
  on public.roster_swap_requests(organization_id, requester_profile_id);

create index if not exists idx_roster_swap_target
  on public.roster_swap_requests(organization_id, target_profile_id);

create unique index if not exists idx_roster_swap_active_pair_date
  on public.roster_swap_requests(
    organization_id,
    work_date,
    least(requester_employee_id, target_employee_id),
    greatest(requester_employee_id, target_employee_id)
  )
  where status in ('PENDING_PEER', 'PENDING_MANAGER');

alter table public.roster_swap_requests enable row level security;

create policy "roster_swap_select" on public.roster_swap_requests for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
      or requester_profile_id = auth.uid()
      or target_profile_id = auth.uid()
    )
  )
);

create policy "roster_swap_insert" on public.roster_swap_requests for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and requester_profile_id = auth.uid()
    and status = 'PENDING_PEER'
  )
);

create policy "roster_swap_update" on public.roster_swap_requests for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      (status = 'PENDING_PEER' and target_profile_id = auth.uid())
      or (status = 'PENDING_PEER' and requester_profile_id = auth.uid())
      or (status = 'PENDING_MANAGER' and public.auth_role() in ('ADMIN', 'HR', 'MANAGER'))
      or public.auth_role() in ('ADMIN', 'HR')
    )
  )
);

grant all on public.roster_swap_requests to anon, authenticated, service_role;
