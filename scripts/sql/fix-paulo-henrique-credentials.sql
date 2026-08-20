-- ============================================================
-- Data Fix (one-shot): Incidente Paulo Ricardo / Henrique
-- scripts/sql/fix-paulo-henrique-credentials.sql
--
-- Pré-requisito: migration 0044_hardware_sync_queue.sql aplicada.
--
-- Ordem crítica (unique index org+clock_credential):
--   1) Calcular próxima credencial
--   2) Mover Henrique para a nova (libera 97 se ele a tiver)
--   3) Garantir Paulo INACTIVE com credencial 97
-- ============================================================

do $$
declare
  v_org_id uuid;
  v_paulo_id uuid;
  v_henrique_id uuid;
  v_henrique_cred text;
  v_paulo_cred text;
  v_next_cred text;
  v_max_cred int;
begin
  select id into v_org_id
  from public.organizations
  where name ilike '%Eletropasso%'
  limit 1;

  if v_org_id is null then
    raise exception 'Organização Eletropasso não encontrada';
  end if;

  raise notice 'Organização: %', v_org_id;

  select id, clock_credential into v_paulo_id, v_paulo_cred
  from public.profiles
  where organization_id = v_org_id
    and name ilike '%Paulo%Ricardo%'
  order by
    case when regexp_replace(coalesce(clock_credential, ''), '^0+', '') = '97' then 0 else 1 end,
    case when coalesce(status, 'ACTIVE') = 'INACTIVE' then 0 else 1 end,
    updated desc nulls last
  limit 1;

  select id, clock_credential into v_henrique_id, v_henrique_cred
  from public.profiles
  where organization_id = v_org_id
    and name ilike '%Henrique%'
    and coalesce(status, 'ACTIVE') = 'ACTIVE'
  order by created desc nulls last
  limit 1;

  if v_henrique_id is null then
    raise exception 'Henrique (ACTIVE) não encontrado';
  end if;

  raise notice 'Paulo: % cred=%', v_paulo_id, v_paulo_cred;
  raise notice 'Henrique: % cred=%', v_henrique_id, v_henrique_cred;

  -- MAX short credential across ALL profiles (excl. Henrique temporarily if he holds 97)
  select coalesce(max(
    case
      when length(regexp_replace(clock_credential, '^0+', '')) between 1 and 6
        and clock_credential ~ '^[0-9]+$'
      then cast(regexp_replace(clock_credential, '^0+', '') as int)
      else 0
    end
  ), 0) into v_max_cred
  from public.profiles
  where organization_id = v_org_id
    and clock_credential is not null
    and clock_credential ~ '^[0-9]+$'
    and id is distinct from v_henrique_id;

  -- Also consider Paulo's intended 97 and Henrique's current if not 97
  if v_max_cred < 97 then
    v_max_cred := 97;
  end if;

  v_next_cred := lpad((v_max_cred + 1)::text, 12, '0');
  raise notice 'Nova credencial para Henrique: %', v_next_cred;

  -- 1) Move Henrique off 97 (or assign new if missing / still 97)
  if v_henrique_cred is null
     or regexp_replace(coalesce(v_henrique_cred, ''), '^0+', '') = '97' then
    update public.profiles
    set
      clock_credential = v_next_cred,
      updated = now()
    where id = v_henrique_id;
    raise notice 'Henrique atualizado para %', v_next_cred;
  else
    raise notice 'Henrique já tem credencial % — mantendo', v_henrique_cred;
  end if;

  -- 2) Paulo: INACTIVE + preserve/restore 97
  if v_paulo_id is null then
    raise warning 'Paulo Ricardo não encontrado — verifique o nome no banco';
  else
    update public.profiles
    set
      status = 'INACTIVE',
      clock_credential = '000000000097',
      clock_discharge_status = 'HARDWARE_CONFIRMED',
      updated = now()
    where id = v_paulo_id;
    raise notice 'Paulo INACTIVE com credencial 97';
  end if;

  raise notice 'Correção concluída';
end $$;

select
  name,
  employee_id as pis,
  clock_credential,
  status,
  clock_discharge_status,
  updated
from public.profiles
where name ilike any (array['%Paulo%Ricardo%', '%Henrique%'])
order by name;
