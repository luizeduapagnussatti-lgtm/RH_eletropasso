-- ============================================================
-- Allow MANAGER to delete punches (manual corrections in espelho)
-- 0037_punches_manager_delete.sql
-- ============================================================

drop policy if exists "punches_delete" on public.punches;

create policy "punches_delete" on public.punches for delete using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
  )
);
