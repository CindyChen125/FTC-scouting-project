-- Match-observation identity repair.
-- Prerequisites: schema.sql and auth-schema.sql.
-- Safe to re-run. Preserves every row and every existing RLS policy.

begin;

alter table public.scout_entries
  add column if not exists observation_key text;

-- Historical authenticated rows use their verified author id. Records from
-- before accounts existed share the application's established "legacy" key.
update public.scout_entries
set observation_key = coalesce(nullif(btrim(observation_key), ''), scouted_by::text, 'legacy')
where observation_key is null or btrim(observation_key) = '';

alter table public.scout_entries
  alter column observation_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scout_entries'::regclass
      and conname = 'scout_entries_observation_key_not_blank'
  ) then
    alter table public.scout_entries
      add constraint scout_entries_observation_key_not_blank
      check (length(btrim(observation_key)) > 0);
  end if;
end;
$$;

-- Drop only an obsolete primary key. If the four-column key is already live,
-- a repeat run leaves it untouched.
do $$
declare
  current_key text[];
  primary_name text;
begin
  select c.conname,
         array_agg(a.attname::text order by key_column.ordinality)
    into primary_name, current_key
  from pg_constraint c
  cross join lateral unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = key_column.attnum
  where c.conrelid = 'public.scout_entries'::regclass and c.contype = 'p'
  group by c.conname;

  if current_key is distinct from array['event_code', 'match_id', 'team_number', 'observation_key']::text[] then
    if primary_name is not null then
      execute format('alter table public.scout_entries drop constraint %I', primary_name);
    end if;
    alter table public.scout_entries
      add constraint scout_entries_pkey
      primary key (event_code, match_id, team_number, observation_key);
  end if;
end;
$$;

-- A signed-in scout owns one stable observation identity. Re-submitting that
-- observation updates it; another scout's UUID creates an independent row.
create or replace function public.guard_observation_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    if new.scouted_by is distinct from auth.uid()
       or new.observation_key is distinct from auth.uid()::text then
      raise exception 'A scout may only create their own observation';
    end if;
  elsif tg_op = 'UPDATE' then
    if (new.event_code, new.match_id, new.team_number, new.observation_key)
       is distinct from (old.event_code, old.match_id, old.team_number, old.observation_key) then
      raise exception 'Observation identity cannot change';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists scout_entries_identity on public.scout_entries;
create trigger scout_entries_identity
  before insert or update on public.scout_entries
  for each row execute function public.guard_observation_identity();

commit;

