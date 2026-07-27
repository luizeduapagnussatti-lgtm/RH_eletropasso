-- ============================================================
-- eSocial Sprint 6 — org API keys for payroll export
-- 0029_org_api_keys.sql
-- ============================================================

create table if not exists public.org_api_keys (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null default 'default',
  key_hash         text not null,
  scopes           text[] not null default '{payroll:read}',
  is_active        boolean not null default true,
  last_used_at     timestamptz,
  created          timestamptz not null default now(),
  unique (organization_id, name)
);

create index if not exists idx_org_api_keys_org
  on public.org_api_keys(organization_id);

alter table public.org_api_keys enable row level security;

create policy "org_api_keys_select" on public.org_api_keys for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);
create policy "org_api_keys_insert" on public.org_api_keys for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);
create policy "org_api_keys_update" on public.org_api_keys for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);
create policy "org_api_keys_delete" on public.org_api_keys for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);

grant all on public.org_api_keys to anon, authenticated, service_role;
