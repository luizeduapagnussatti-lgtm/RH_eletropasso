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
