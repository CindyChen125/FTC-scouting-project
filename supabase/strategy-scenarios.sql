-- Stage 3 Strategy Sandbox persistence. Apply after auth-schema.sql.
-- Safe to re-run. Does not change scouting or pit records.

create extension if not exists pgcrypto;

create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  event_code text not null check (length(btrim(event_code)) between 1 and 100),
  match_number text not null default '' check (length(match_number) <= 40),
  red_team_numbers text[] not null default array['','']::text[]
    check (cardinality(red_team_numbers) = 2),
  blue_team_numbers text[] not null default array['','']::text[]
    check (cardinality(blue_team_numbers) = 2),
  board jsonb not null check (jsonb_typeof(board) = 'object'),
  timeline jsonb not null default '{}'::jsonb check (jsonb_typeof(timeline) = 'object'),
  source_strategy_id uuid references public.strategies(id) on delete set null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists strategies_updated_at_idx on public.strategies (updated_at desc);
create index if not exists strategies_event_match_idx on public.strategies (event_code, match_number);

create or replace function public.stamp_strategy_record()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    new.created_at := now();
    new.updated_at := new.created_at;
    new.revision := 1;
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists strategies_stamp on public.strategies;
create trigger strategies_stamp before insert or update on public.strategies
  for each row execute function public.stamp_strategy_record();

alter table public.strategies enable row level security;

drop policy if exists "active members read strategies" on public.strategies;
create policy "active members read strategies" on public.strategies
  for select to authenticated using (public.is_active_member());

drop policy if exists "active members create strategies" on public.strategies;
create policy "active members create strategies" on public.strategies
  for insert to authenticated with check (public.is_active_member() and created_by = auth.uid());

drop policy if exists "authors update strategies" on public.strategies;
create policy "authors update strategies" on public.strategies
  for update to authenticated
  using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));

drop policy if exists "authors delete strategies" on public.strategies;
create policy "authors delete strategies" on public.strategies
  for delete to authenticated using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));

revoke all on public.strategies from anon;
grant select, insert, update, delete on public.strategies to authenticated;
