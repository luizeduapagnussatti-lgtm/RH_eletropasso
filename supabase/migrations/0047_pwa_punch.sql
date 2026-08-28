-- ============================================================
-- PWA punch (secondary to REP CLOCK)
-- 0047_pwa_punch.sql
-- ============================================================

alter table public.profiles
  add column if not exists allow_pwa_punch boolean not null default false;

comment on column public.profiles.allow_pwa_punch is
  'When true, employee may insert punches with source=APP (selfie+GPS). CLOCK remains source of truth.';

-- Expand punches.source to include APP
alter table public.punches drop constraint if exists punches_source_check;

do $$
declare
  cname text;
begin
  for cname in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'punches'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%source%'
  loop
    execute format('alter table public.punches drop constraint %I', cname);
  end loop;
end $$;

alter table public.punches
  add constraint punches_source_check
  check (source in ('CLOCK', 'MANUAL', 'IMPORT', 'SYSTEM', 'APP'));

-- Insert policy: ADMIN/HR MANUAL (existing) + employee APP when flagged
drop policy if exists "punches_insert" on public.punches;

create policy "punches_insert" on public.punches for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR')
    and source = 'MANUAL'
  )
  or (
    organization_id = public.auth_org_id()
    and source = 'APP'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = organization_id
        and p.allow_pwa_punch = true
        and p.employee_id is not null
        and p.employee_id <> ''
        and p.employee_id = employee_id
    )
  )
);

-- APP rows are immutable like CLOCK (only MANUAL may be updated/deleted by staff).
-- Existing 0038 policies already require source = 'MANUAL' for update/delete.
