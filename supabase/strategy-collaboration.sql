-- Stage 6 internal team collaboration. Run after strategy-scenarios.sql.
-- External partner sharing is deliberately not enabled by this migration.

create table if not exists public.strategy_objects (
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  object_key text not null,
  kind text not null check (kind in ('robot', 'annotation', 'waypoint')),
  phase text not null check (phase in ('auto', 'teleop')),
  robot_id text,
  object_id text not null,
  value jsonb,
  revision integer not null check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (strategy_id, object_key)
);

create index if not exists strategy_objects_strategy_idx on public.strategy_objects (strategy_id, updated_at);
alter table public.strategy_objects enable row level security;
drop policy if exists "members read strategy objects" on public.strategy_objects;
create policy "members read strategy objects" on public.strategy_objects
  for select to authenticated using (public.is_active_member());
revoke all on public.strategy_objects from anon, authenticated;
grant select on public.strategy_objects to authenticated;

-- One object per transaction, with its own revision. A teammate editing a
-- different object never replaces the caller's board snapshot. Tombstones
-- (null value) keep a deleted annotation or waypoint from reappearing when
-- older base snapshots are loaded.
create or replace function public.apply_strategy_object(
  p_strategy_id uuid,
  p_kind text,
  p_phase text,
  p_robot_id text,
  p_object_id text,
  p_value jsonb,
  p_expected_revision integer
)
returns public.strategy_objects
language plpgsql security definer set search_path = public
as $$
declare
  target_key text;
  old_revision integer;
  saved public.strategy_objects;
begin
  if not public.is_active_member() then raise exception 'Active member required' using errcode = '42501'; end if;
  if p_phase is null or p_kind is null or p_phase not in ('auto', 'teleop') or p_kind not in ('robot', 'annotation', 'waypoint') then
    raise exception 'Invalid strategy object kind or phase' using errcode = '22023';
  end if;
  if p_object_id is null or p_object_id !~ '^[A-Za-z0-9_-]{1,80}$' then
    raise exception 'Invalid strategy object ID' using errcode = '22023';
  end if;
  if p_kind = 'robot' and (p_object_id not in ('red1','red2','blue1','blue2') or p_robot_id is not null or p_value is null) then
    raise exception 'Invalid robot patch' using errcode = '22023';
  end if;
  if p_kind = 'waypoint' and (p_robot_id is null or p_robot_id not in ('red1','red2','blue1','blue2')) then
    raise exception 'Invalid waypoint robot' using errcode = '22023';
  end if;
  if p_kind = 'annotation' and p_robot_id is not null then
    raise exception 'Annotation cannot have robot ID' using errcode = '22023';
  end if;
  if p_value is not null and (jsonb_typeof(p_value) <> 'object' or p_value->>'id' is distinct from p_object_id or pg_column_size(p_value) > 200000) then
    raise exception 'Invalid strategy object payload' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision is required' using errcode = '22023';
  end if;

  -- A row lock serializes concurrent creates for the same key, and verifies
  -- the parent scenario still exists. Members may collaborate on objects;
  -- Stage 3's whole-record metadata update remains author/admin-only.
  perform 1 from public.strategies where id = p_strategy_id for update;
  if not found then raise exception 'Strategy not found' using errcode = 'P0002'; end if;
  target_key := p_kind || ':' || p_phase || ':' ||
    case when p_kind = 'waypoint' then p_robot_id || ':' else '' end || p_object_id;
  select revision into old_revision from public.strategy_objects
    where strategy_id = p_strategy_id and strategy_objects.object_key = target_key for update;
  if old_revision is null then
    if p_expected_revision <> 0 then raise exception 'Strategy object conflict' using errcode = '40001'; end if;
    insert into public.strategy_objects (strategy_id, object_key, kind, phase, robot_id, object_id, value, revision, updated_by)
    values (p_strategy_id, target_key, p_kind, p_phase, p_robot_id, p_object_id, p_value, 1, auth.uid())
    returning * into saved;
  else
    if old_revision <> p_expected_revision then raise exception 'Strategy object conflict' using errcode = '40001'; end if;
    update public.strategy_objects set value = p_value, revision = old_revision + 1,
      updated_by = auth.uid(), updated_at = now()
    where strategy_id = p_strategy_id and strategy_objects.object_key = target_key
    returning * into saved;
  end if;
  return saved;
end;
$$;
revoke all on function public.apply_strategy_object(uuid,text,text,text,text,jsonb,integer) from public;
grant execute on function public.apply_strategy_object(uuid,text,text,text,text,jsonb,integer) to authenticated;

create table if not exists public.strategy_presence (
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  display_name text not null default '',
  editing_key text,
  last_seen timestamptz not null default now(),
  primary key (strategy_id, user_id, session_id)
);
create index if not exists strategy_presence_recent_idx on public.strategy_presence (strategy_id, last_seen desc);
alter table public.strategy_presence enable row level security;
drop policy if exists "members view strategy presence" on public.strategy_presence;
create policy "members view strategy presence" on public.strategy_presence
  for select to authenticated using (public.is_active_member());
drop policy if exists "members create own presence" on public.strategy_presence;
create policy "members create own presence" on public.strategy_presence
  for insert to authenticated with check (public.is_active_member() and user_id = auth.uid());
drop policy if exists "members update own presence" on public.strategy_presence;
create policy "members update own presence" on public.strategy_presence
  for update to authenticated using (public.is_active_member() and user_id = auth.uid())
  with check (public.is_active_member() and user_id = auth.uid());
drop policy if exists "members remove own presence" on public.strategy_presence;
create policy "members remove own presence" on public.strategy_presence
  for delete to authenticated using (public.is_active_member() and user_id = auth.uid());
revoke all on public.strategy_presence from anon;
grant select, insert, update, delete on public.strategy_presence to authenticated;

-- Supabase Realtime's postgres_changes needs the tables in its publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'strategy_objects') then
      alter publication supabase_realtime add table public.strategy_objects;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'strategy_presence') then
      alter publication supabase_realtime add table public.strategy_presence;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'strategies') then
      alter publication supabase_realtime add table public.strategies;
    end if;
  end if;
end;
$$;
