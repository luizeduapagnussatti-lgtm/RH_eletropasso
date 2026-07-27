-- ============================================================
-- eSocial Sprint 1 — employer master data on organizations
-- 0027_org_esocial_employer.sql
-- ============================================================

alter table public.organizations
  add column if not exists cnpj text,
  add column if not exists legal_name text,
  add column if not exists esocial_ambiente text not null default 'PRODUCAO_RESTRITA'
    check (esocial_ambiente in ('PRODUCAO', 'PRODUCAO_RESTRITA')),
  add column if not exists payroll_contact_email text;

create unique index if not exists idx_organizations_cnpj_unique
  on public.organizations (cnpj)
  where cnpj is not null and cnpj <> '';
