-- ============================================================
-- Punches: only MANUAL rows may be updated/deleted by org staff
-- 0038_punches_manual_only_mutate.sql
-- CLOCK/IMPORT remain immutable audit trail from the time clock.
-- ============================================================

drop policy if exists "punches_update" on public.punches;
drop policy if exists "punches_delete" on public.punches;

create policy "punches_update" on public.punches for update using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
    and source = 'MANUAL'
  )
) with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
    and source = 'MANUAL'
  )
);

create policy "punches_delete" on public.punches for delete using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
    and source = 'MANUAL'
  )
);
