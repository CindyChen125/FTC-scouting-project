-- Team-wide competition event management.
-- Prerequisites: supabase/schema.sql and supabase/auth-schema.sql.
-- Apply once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to re-run. This does not alter or delete scouting or pit records.

create extension if not exists pgcrypto;

create table if not exists public.competition_events (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  season          integer not null check (season between 2025 and 2099),
  ftcscout_code   text unique,
  is_active       boolean not null default false,
  created_by      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint competition_events_name_not_blank check (length(btrim(name)) > 0),
  constraint competition_events_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{1,63}$'),
  constraint competition_events_ftcscout_format check (
    ftcscout_code is null or ftcscout_code ~ '^[A-Z0-9]{2,24}$'
  )
);

create unique index if not exists competition_events_name_season_unique
  on public.competition_events (season, lower(btrim(name)));

create unique index if not exists competition_events_single_active
  on public.competition_events ((is_active)) where is_active;

alter table public.competition_events enable row level security;

drop policy if exists "members read competition events" on public.competition_events;
create policy "members read competition events" on public.competition_events
  for select to authenticated using (is_active_member());

drop policy if exists "admins create competition events" on public.competition_events;
drop policy if exists "admins update competition events" on public.competition_events;
-- No direct insert/update policy is granted. All mutations go through the two
-- security-definer RPCs below, which re-check is_admin() and keep activation
-- atomic. This also prevents a client from leaving the table with no active row.
revoke insert, update, delete on public.competition_events from authenticated;
grant select on public.competition_events to authenticated;

-- Preserve the events already used by historical records. Conflict handling is
-- intentionally non-destructive: deployed names and activation state win.
insert into public.competition_events (code, name, season, ftcscout_code, is_active, created_by)
values
  ('BIOBUZZ-PRACTICE', 'BIOBUZZ 练习赛 Practice & Scrimmages', 2026, null, false, null),
  ('FPEROC', 'Canadian Rockies Premier Event @ KDays', 2025, 'FPEROC', false, null),
  ('CNSHOS', 'The CaoLu Cup Teenage Robot Design and Build Invitational Tournament #1', 2025, 'CNSHOS', false, null)
on conflict (code) do nothing;

-- If another row was already active before this script was re-run, keep it.
-- If the seed insert could not mark the practice event active, ensure exactly
-- one existing event becomes active without changing any historical data.
update public.competition_events
set is_active = true, updated_at = now()
where id = coalesce(
  (select id from public.competition_events where code = 'BIOBUZZ-PRACTICE' limit 1),
  (select id from public.competition_events order by created_at asc limit 1)
)
and not exists (select 1 from public.competition_events where is_active);

create or replace function public.create_competition_event(
  event_name text,
  event_season integer default 2026,
  event_ftcscout_code text default null
)
returns setof public.competition_events
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(event_name);
  clean_ftc text := nullif(upper(btrim(event_ftcscout_code)), '');
  base_code text;
  candidate text;
  suffix integer := 1;
  created public.competition_events;
begin
  if not is_admin() then raise exception 'Administrator access required'; end if;
  if clean_name is null or clean_name = '' then raise exception 'Event name is required'; end if;
  if event_season is null or event_season < 2025 or event_season > 2099 then raise exception 'Invalid season'; end if;
  if clean_ftc is not null and clean_ftc !~ '^[A-Z0-9]{2,24}$' then
    raise exception 'Invalid FTCScout event code';
  end if;
  if exists (
    select 1 from public.competition_events
    where season = event_season and lower(btrim(name)) = lower(clean_name)
  ) then
    raise exception 'An event with this name already exists for the season';
  end if;
  if clean_ftc is not null and exists (
    select 1 from public.competition_events where ftcscout_code = clean_ftc or code = clean_ftc
  ) then
    raise exception 'This FTCScout event is already registered';
  end if;

  lock table public.competition_events in share row exclusive mode;
  base_code := coalesce(
    clean_ftc,
    event_season::text || '-' || trim(both '-' from regexp_replace(upper(clean_name), '[^A-Z0-9]+', '-', 'g'))
  );
  if base_code = event_season::text || '-' then base_code := event_season::text || '-EVENT'; end if;
  base_code := left(base_code, 56);
  candidate := base_code;
  while exists (select 1 from public.competition_events where code = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_code, 56) || '-' || suffix::text;
  end loop;

  insert into public.competition_events (code, name, season, ftcscout_code, created_by)
  values (candidate, clean_name, event_season, clean_ftc, auth.uid())
  returning * into created;
  return next created;
end;
$$;

create or replace function public.set_active_competition_event(target_event_id uuid)
returns setof public.competition_events
language plpgsql
security definer
set search_path = public
as $$
declare activated public.competition_events;
begin
  if not is_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.competition_events where id = target_event_id) then
    raise exception 'Event not found';
  end if;

  lock table public.competition_events in share row exclusive mode;
  update public.competition_events
    set is_active = false, updated_at = now()
    where is_active and id <> target_event_id;
  update public.competition_events
    set is_active = true, updated_at = now()
    where id = target_event_id
    returning * into activated;
  return next activated;
end;
$$;

revoke all on function public.create_competition_event(text, integer, text) from public;
revoke all on function public.set_active_competition_event(uuid) from public;
grant execute on function public.create_competition_event(text, integer, text) to authenticated;
grant execute on function public.set_active_competition_event(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'competition_events'
  ) then
    alter publication supabase_realtime add table public.competition_events;
  end if;
end;
$$;
