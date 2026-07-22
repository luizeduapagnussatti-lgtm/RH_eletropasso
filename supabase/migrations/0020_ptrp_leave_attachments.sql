-- ============================================================
-- PTRP Sprint 5 — leave medical certificate fields + ptrp_policy note
-- 0020_ptrp_leave_attachments.sql
-- ============================================================

alter table public.leaves
  add column if not exists attachment_path text,
  add column if not exists cid text,
  add column if not exists certificate_valid_until date;

-- Storage bucket for leave certificates (if not exists — ignore error via DO)
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('leave-attachments', 'leave-attachments', false)
  on conflict (id) do nothing;
exception when others then
  raise notice 'storage bucket leave-attachments skipped: %', SQLERRM;
end $$;
