-- Fix punches_insert APP branch: qualify outer punches columns so RLS compares
-- profile.employee_id to NEW.employee_id (unqualified names were bound to profiles).

drop policy if exists "punches_insert" on public.punches;

create policy "punches_insert" on public.punches for insert with check (
  public.is_super_admin()
  or (
    punches.organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR')
    and punches.source = 'MANUAL'
  )
  or (
    punches.organization_id = public.auth_org_id()
    and punches.source = 'APP'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.organization_id = punches.organization_id
        and p.allow_pwa_punch = true
        and p.employee_id is not null
        and p.employee_id <> ''
        and p.employee_id = punches.employee_id
    )
  )
);