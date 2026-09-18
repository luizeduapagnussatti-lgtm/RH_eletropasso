-- Recalc-queue processor uses the service_role JWT (no Auth user).
-- apply_punch_proximity_auto_ignore required auth_org_id() and aborted with
-- PUNCH_AUTO_IGNORE_FORBIDDEN, leaving queue jobs FAILED and days stuck.

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
  is_service boolean;
begin
  org := public.auth_org_id();
  is_service := coalesce(auth.role(), '') = 'service_role';
  if org is null and not public.is_super_admin() and not is_service then
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
      and (is_service or public.is_super_admin() or organization_id = org);
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
      and (is_service or public.is_super_admin() or organization_id = org);
  end if;
end;
$$;

revoke all on function public.apply_punch_proximity_auto_ignore(uuid[], uuid[]) from public;
grant execute on function public.apply_punch_proximity_auto_ignore(uuid[], uuid[]) to authenticated;
grant execute on function public.apply_punch_proximity_auto_ignore(uuid[], uuid[]) to service_role;
