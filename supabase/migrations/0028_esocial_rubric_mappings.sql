-- ============================================================
-- eSocial Sprint 5 — rubric mappings per organization
-- 0028_esocial_rubric_mappings.sql
-- ============================================================

create table if not exists public.esocial_rubric_mappings (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  internal_type    text not null
                   check (internal_type in ('REGULAR','HE_50','HE_100','NIGHT','ABSENCE')),
  rubric_code      text not null,
  description      text not null default '',
  active           boolean not null default true,
  created          timestamptz not null default now(),
  updated          timestamptz not null default now(),
  unique (organization_id, internal_type)
);

create index if not exists idx_esocial_rubric_mappings_org
  on public.esocial_rubric_mappings(organization_id);

alter table public.esocial_rubric_mappings enable row level security;

create policy "esocial_rubric_mappings_select" on public.esocial_rubric_mappings for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "esocial_rubric_mappings_insert" on public.esocial_rubric_mappings for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "esocial_rubric_mappings_update" on public.esocial_rubric_mappings for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "esocial_rubric_mappings_delete" on public.esocial_rubric_mappings for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

grant all on public.esocial_rubric_mappings to anon, authenticated, service_role;

-- Default rubric placeholders (ADMIN should align with accountant)
insert into public.esocial_rubric_mappings (organization_id, internal_type, rubric_code, description)
select o.id, v.internal_type, v.rubric_code, v.description
from public.organizations o
cross join (
  values
    ('REGULAR', '1000', 'Horas normais'),
    ('HE_50', '1200', 'Horas extras 50%'),
    ('HE_100', '1201', 'Horas extras 100%'),
    ('NIGHT', '1040', 'Adicional noturno'),
    ('ABSENCE', '9200', 'Faltas')
) as v(internal_type, rubric_code, description)
on conflict (organization_id, internal_type) do nothing;
