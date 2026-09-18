-- List old PWA punch selfie storage paths for cron-pwa-punch-selfie-cleanup.
create or replace function public.list_old_pwa_punch_selfies(p_cutoff timestamptz)
returns table(name text)
language sql
security definer
set search_path = storage, public
as $$
  select o.name::text
  from storage.objects o
  where o.bucket_id = 'selfies'
    and o.name like '%/pwa-punches/%'
    and o.created_at < p_cutoff
  order by o.created_at asc
  limit 2000;
$$;

revoke all on function public.list_old_pwa_punch_selfies(timestamptz) from public;
grant execute on function public.list_old_pwa_punch_selfies(timestamptz) to service_role;

-- Remove selfiePath from APP punches after storage objects are deleted.
create or replace function public.clear_pwa_punch_selfie_paths(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if p_paths is null or cardinality(p_paths) = 0 then
    return 0;
  end if;
  update public.punches
  set raw_payload = raw_payload - 'selfiePath'
  where source = 'APP'
    and raw_payload ? 'selfiePath'
    and raw_payload->>'selfiePath' = any(p_paths);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.clear_pwa_punch_selfie_paths(text[]) from public;
grant execute on function public.clear_pwa_punch_selfie_paths(text[]) to service_role;
