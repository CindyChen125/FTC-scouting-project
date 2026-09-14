-- Pit scouting: one capability profile per team per event.
-- Needs supabase/schema.sql and supabase/auth-schema.sql to have been run first.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Safe to re-run.

create table if not exists pit_entries (
  -- Per event, not per team: robots get rebuilt between events, so last
  -- event's profile shouldn't overwrite this one's.
  event_code   text not null,
  team_number  text not null,

  -- The profile itself is JSON so the app's TypeScript shape stays the single
  -- source of truth; adding a question needs no migration here.
  data         jsonb not null,

  scout_name     text not null default '',
  scouted_by     uuid references auth.users(id) on delete set null,
  last_edited_by uuid references auth.users(id) on delete set null,

  -- Epoch milliseconds, matching Date.now() in the app.
  updated_at   bigint not null,

  primary key (event_code, team_number)
);

-- Same rule as match entries: anyone may edit, but the original author stays
-- the author. preserve_scout_attribution() comes from auth-schema.sql and only
-- touches the scouted_by / last_edited_by columns, so it works here unchanged.
drop trigger if exists pit_entries_preserve_attribution on pit_entries;
create trigger pit_entries_preserve_attribution
  before update on pit_entries
  for each row execute function preserve_scout_attribution();

alter table pit_entries enable row level security;

drop policy if exists "members read pit entries" on pit_entries;
create policy "members read pit entries" on pit_entries
  for select to authenticated using (is_active_member());

drop policy if exists "members create pit entries" on pit_entries;
create policy "members create pit entries" on pit_entries
  for insert to authenticated
  with check (is_active_member() and scouted_by = auth.uid());

drop policy if exists "members update pit entries" on pit_entries;
create policy "members update pit entries" on pit_entries
  for update to authenticated
  using (is_active_member())
  with check (is_active_member());

drop policy if exists "admins delete pit entries" on pit_entries;
create policy "admins delete pit entries" on pit_entries
  for delete to authenticated using (is_admin());

grant select, insert, update, delete on pit_entries to authenticated;

-- Broadcast row changes so every scout's device updates live. Adding a table
-- that is already published is an error, hence the check.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pit_entries'
  ) then
    alter publication supabase_realtime add table pit_entries;
  end if;
end;
$$;
