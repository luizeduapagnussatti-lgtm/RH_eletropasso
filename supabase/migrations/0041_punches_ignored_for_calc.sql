-- ============================================================
-- Punches: ignored_for_calc (apuration only — CLOCK audit intact)
-- 0041_punches_ignored_for_calc.sql
-- ============================================================

alter table public.punches
  add column if not exists ignored_for_calc boolean not null default false;

alter table public.punches
  add column if not exists ignore_source text
    check (ignore_source is null or ignore_source in ('AUTO', 'MANUAL'));

alter table public.punches
  add column if not exists ignored_at timestamptz;

alter table public.punches
  add column if not exists ignored_by text;

comment on column public.punches.ignored_for_calc is
  'When true, punch is excluded from mirror slots and day calc but kept for audit.';
comment on column public.punches.ignore_source is
  'AUTO = proximity dedupe; MANUAL = manager override. Null = never decided.';

create index if not exists idx_punches_ignored_for_calc
  on public.punches (organization_id, employee_id, punched_at)
  where ignored_for_calc = true;

-- Manager toggle: only ignore flags (never punched_at / nsr / source).
create or replace function public.set_punch_ignored_for_calc(
  p_id uuid,
  p_ignored boolean
)
returns public.punches
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.punches;
  uid text;
begin
  select * into rec from public.punches where id = p_id;
  if not found then
    raise exception 'PUNCH_NOT_FOUND';
  end if;

  if not (
    public.is_super_admin()
    or (
      rec.organization_id = public.auth_org_id()
      and public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
    )
  ) then
    raise exception 'PUNCH_IGNORE_FORBIDDEN';
  end if;

  uid := coalesce(auth.uid()::text, '');

  update public.punches
  set
    ignored_for_calc = coalesce(p_ignored, false),
    ignore_source = 'MANUAL',
    ignored_at = case when coalesce(p_ignored, false) then now() else null end,
    ignored_by = case when coalesce(p_ignored, false) then uid else null end,
    updated = now()
  where id = p_id
  returning * into rec;

  return rec;
end;
$$;

revoke all on function public.set_punch_ignored_for_calc(uuid, boolean) from public;
grant execute on function public.set_punch_ignored_for_calc(uuid, boolean) to authenticated;
grant execute on function public.set_punch_ignored_for_calc(uuid, boolean) to service_role;

-- Bulk AUTO proximity apply: never touches ignore_source = MANUAL.
create or replace function public.apply_punch_proximity_auto_ignore(
  p_ignore_ids uuid[],
  p_clear_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  org := public.auth_org_id();
  if org is null and not public.is_super_admin() then
    raise exception 'PUNCH_AUTO_IGNORE_FORBIDDEN';
  end if;

  if p_ignore_ids is not null and array_length(p_ignore_ids, 1) is not null then
    update public.punches
    set
      ignored_for_calc = true,
      ignore_source = 'AUTO',
      ignored_at = now(),
      ignored_by = null,
      updated = now()
    where id = any (p_ignore_ids)
      and (ignore_source is null or ignore_source = 'AUTO')
      and (public.is_super_admin() or organization_id = org);
  end if;

  if p_clear_ids is not null and array_length(p_clear_ids, 1) is not null then
    update public.punches
    set
      ignored_for_calc = false,
      ignore_source = null,
      ignored_at = null,
      ignored_by = null,
      updated = now()
    where id = any (p_clear_ids)
      and (ignore_source is null or ignore_source = 'AUTO')
      and (public.is_super_admin() or organization_id = org);
  end if;
end;
$$;

revoke all on function public.apply_punch_proximity_auto_ignore(uuid[], uuid[]) from public;
grant execute on function public.apply_punch_proximity_auto_ignore(uuid[], uuid[]) to authenticated;
grant execute on function public.apply_punch_proximity_auto_ignore(uuid[], uuid[]) to service_role;
