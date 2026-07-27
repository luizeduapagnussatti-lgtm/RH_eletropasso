-- ============================================================
-- Monthly timesheet employee signature (selfie + rubric)
-- 0032_timesheet_employee_signatures.sql
-- ============================================================

alter table public.timesheet_employee_reviews
  drop constraint if exists timesheet_employee_reviews_status_check;

alter table public.timesheet_employee_reviews
  add constraint timesheet_employee_reviews_status_check
  check (status in ('OPEN', 'IN_REVIEW', 'EMPLOYEE_SIGNED', 'APPROVED'));

alter table public.timesheet_employee_reviews
  add column if not exists employee_signed_at timestamptz,
  add column if not exists employee_selfie_path text,
  add column if not exists employee_signature_path text,
  add column if not exists employee_sign_metadata jsonb;

-- Employee may sign own review when HR sent it for review
create policy "timesheet_employee_reviews_employee_sign"
  on public.timesheet_employee_reviews for update using (
    organization_id = public.auth_org_id()
    and profile_id = auth.uid()
    and status = 'IN_REVIEW'
  )
  with check (
    organization_id = public.auth_org_id()
    and profile_id = auth.uid()
    and status in ('IN_REVIEW', 'EMPLOYEE_SIGNED')
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'timesheet-signatures',
  'timesheet-signatures',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "timesheet_signatures_select" on storage.objects for select using (
  bucket_id = 'timesheet-signatures' and (
    public.is_super_admin()
    or public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
    or (storage.foldername(name))[3] = auth.uid()::text
  )
);

create policy "timesheet_signatures_insert" on storage.objects for insert with check (
  bucket_id = 'timesheet-signatures'
  and auth.uid() is not null
  and (storage.foldername(name))[3] = auth.uid()::text
);

create policy "timesheet_signatures_update" on storage.objects for update using (
  bucket_id = 'timesheet-signatures'
  and (storage.foldername(name))[3] = auth.uid()::text
);

create policy "timesheet_signatures_delete" on storage.objects for delete using (
  bucket_id = 'timesheet-signatures'
  and public.auth_role() in ('ADMIN', 'HR', 'SUPER_ADMIN')
);
