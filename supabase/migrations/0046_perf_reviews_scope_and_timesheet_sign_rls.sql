-- ============================================================
-- 0046 — P0 security: performance review scope + timesheet sign RLS
-- ============================================================

-- 1) performance_reviews: stop org-wide SELECT for every member
drop policy if exists "perf_reviews_select" on public.performance_reviews;

create policy "perf_reviews_select" on public.performance_reviews for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN', 'HR')
      or employee_id = auth.uid()::text
      or line_manager_id = auth.uid()::text
    )
  )
);

-- 2) timesheet_employee_reviews: MANAGER may insert (ciência → IN_REVIEW)
drop policy if exists "timesheet_employee_reviews_insert" on public.timesheet_employee_reviews;

create policy "timesheet_employee_reviews_insert"
  on public.timesheet_employee_reviews for insert with check (
    public.is_super_admin()
    or (
      organization_id = public.auth_org_id()
      and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
    )
  );

-- 3) Employee may sign own row from OPEN or IN_REVIEW → APPROVED (selfie flow)
drop policy if exists "timesheet_employee_reviews_employee_sign" on public.timesheet_employee_reviews;

create policy "timesheet_employee_reviews_employee_sign"
  on public.timesheet_employee_reviews for update using (
    organization_id = public.auth_org_id()
    and profile_id = auth.uid()
    and status in ('OPEN', 'IN_REVIEW')
  )
  with check (
    organization_id = public.auth_org_id()
    and profile_id = auth.uid()
    and status in ('IN_REVIEW', 'EMPLOYEE_SIGNED', 'APPROVED')
  );
