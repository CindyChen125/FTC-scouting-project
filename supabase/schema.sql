-- Schema for the FTC scouting app's shared entry store.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.

create table if not exists scout_entries (
  -- Match IDs repeat across events (every event has a "Q1"), so the event
  -- code has to be part of the identity or entries from different events
  -- would overwrite each other.
  event_code   text not null,
  match_id     text not null,
  team_number  text not null,

  alliance     text not null check (alliance in ('red', 'blue')),
  scout_name   text not null default '',

  -- Phase data is stored as JSON so the app's TypeScript shapes stay the
  -- single source of truth; adding a field needs no migration here.
  auto         jsonb not null,
  teleop       jsonb not null,
  endgame      jsonb not null,

  overall_notes text not null default '',

  -- Epoch milliseconds, matching Date.now() in the app.
  updated_at   bigint not null,

  primary key (event_code, match_id, team_number)
);

-- "My Scouting Data" lists newest first.
create index if not exists scout_entries_updated_at_idx
  on scout_entries (updated_at desc);

alter table scout_entries enable row level security;

-- The anon key ships inside the client bundle, so anyone with the site URL
-- can present it. These policies therefore can't identify *who* is calling;
-- what they can do is limit what any caller is able to do.
--
-- Read and create are open, because scouts need both with zero friction and
-- no login. Deletes are NOT granted at all, so the data cannot be wiped by
-- anyone holding the anon key — that's the outcome worth preventing.
--
-- For stronger guarantees (restricting writes to known teammates), enable
-- Supabase Auth and change `to anon` -> `to authenticated`.

drop policy if exists "read entries" on scout_entries;
create policy "read entries"
  on scout_entries for select
  to anon
  using (true);

drop policy if exists "create entries" on scout_entries;
create policy "create entries"
  on scout_entries for insert
  to anon
  with check (true);

-- Editing an existing entry (the Edit button) is an update. Allowed, but the
-- row's identity columns can't be changed into a different entry.
drop policy if exists "update entries" on scout_entries;
create policy "update entries"
  on scout_entries for update
  to anon
  using (true)
  with check (true);

-- Broadcast row changes so every scout's list updates live.
alter publication supabase_realtime add table scout_entries;
