-- ============================================================
-- Fix roster_swap_requests UPDATE RLS WITH CHECK for status transitions
-- 0052_roster_swap_update_with_check.sql
-- ============================================================

drop policy if exists "roster_swap_update" on public.roster_swap_requests;

-- USING: who may start an update on the current row
-- WITH CHECK: what the new row may look like after the update
create policy "roster_swap_update" on public.roster_swap_requests
for update
using (
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
)
with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      -- peer accept → PENDING_MANAGER (target)
      (
        status = 'PENDING_MANAGER'
        and target_profile_id = auth.uid()
      )
      -- peer reject → REJECTED (target)
      or (
        status = 'REJECTED'
        and target_profile_id = auth.uid()
      )
      -- requester cancel → CANCELLED
      or (
        status = 'CANCELLED'
        and requester_profile_id = auth.uid()
      )
      -- manager approve / reject
      or (
        status in ('APPROVED', 'REJECTED')
        and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
      )
      -- ADMIN/HR can resolve anything
      or public.auth_role() in ('ADMIN', 'HR')
    )
  )
);
