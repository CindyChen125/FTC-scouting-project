-- Adds accounts, roles and verified attribution on top of supabase/schema.sql.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- profiles: one row per account, created automatically by the trigger below.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  username     text not null unique,
  display_name text not null default '',
  role         text not null default 'scout' check (role in ('admin', 'scout')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Creating the auth user is enough — the profile appears on its own, reading
-- the username/display name/role passed as user_metadata by the Edge Function.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, username, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'scout')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Policy helpers.
--
-- These MUST be `security definer`. A policy on profiles that queries profiles
-- to find the caller's role recurses infinitely; running the lookup as the
-- function owner sidesteps the policy and breaks the cycle.
-- ---------------------------------------------------------------------------
create or replace function is_active_member()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where user_id = auth.uid() and is_active);
$$;

create or replace function is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and is_active and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- scout_entries: verified authorship.
-- ---------------------------------------------------------------------------
alter table scout_entries
  add column if not exists scouted_by     uuid references auth.users(id) on delete set null,
  add column if not exists last_edited_by uuid references auth.users(id) on delete set null;

-- Anyone on the team may edit an entry, so the original author has to be
-- pinned server-side or attribution would be lost the first time someone
-- fixed a teammate's typo. The client cannot override either column.
create or replace function preserve_scout_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- An existing author can never be reassigned. Rows predating accounts have
  -- no author at all, so those stay settable (a one-time backfill) — coalesce
  -- gives immutability where it matters without freezing them as unknown.
  new.scouted_by := coalesce(old.scouted_by, new.scouted_by);

  -- auth.uid() is null for maintenance run outside a user session; don't
  -- overwrite a real editor with nothing in that case.
  if auth.uid() is not null then
    new.last_edited_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists scout_entries_preserve_attribution on scout_entries;
create trigger scout_entries_preserve_attribution
  before update on scout_entries
  for each row execute function preserve_scout_attribution();

-- ---------------------------------------------------------------------------
-- Row level security.
-- ---------------------------------------------------------------------------

-- Replace the open anon policies from schema.sql: the publishable key alone
-- no longer reads or writes anything. Sign-in is required.
drop policy if exists "read entries"   on scout_entries;
drop policy if exists "create entries" on scout_entries;
drop policy if exists "update entries" on scout_entries;

drop policy if exists "members read entries"   on scout_entries;
create policy "members read entries" on scout_entries
  for select to authenticated using (is_active_member());

drop policy if exists "members create entries" on scout_entries;
create policy "members create entries" on scout_entries
  for insert to authenticated
  with check (is_active_member() and scouted_by = auth.uid());

drop policy if exists "members update entries" on scout_entries;
create policy "members update entries" on scout_entries
  for update to authenticated
  using (is_active_member())
  with check (is_active_member());

drop policy if exists "admins delete entries" on scout_entries;
create policy "admins delete entries" on scout_entries
  for delete to authenticated using (is_admin());

alter table profiles enable row level security;

drop policy if exists "members read profiles" on profiles;
create policy "members read profiles" on profiles
  for select to authenticated using (is_active_member());

-- Both update policies are permissive: a member matches the first (their own
-- row), an admin also matches the second (any row). The trigger below is what
-- decides which *columns* each of them may actually change.
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "admins update profiles" on profiles;
create policy "admins update profiles" on profiles
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- No insert/delete policies: accounts are created and removed only through the
-- admin-users Edge Function, which holds the service key.

-- A scout may rename themselves and nothing else — without this they could
-- simply set their own role to 'admin'. Also refuses to strand the team with
-- no admin, which would otherwise be unrecoverable from inside the app.
create or replace function guard_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    new.user_id   := old.user_id;
    new.username  := old.username;
    new.role      := old.role;
    new.is_active := old.is_active;
  end if;

  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active)
     and not exists (
       select 1 from profiles
       where role = 'admin' and is_active and user_id <> old.user_id
     )
  then
    raise exception 'Cannot demote or deactivate the last active admin';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on profiles;
create trigger profiles_guard
  before update on profiles
  for each row execute function guard_profile_changes();

grant select, insert, update, delete on scout_entries to authenticated;
grant select, update on profiles to authenticated;
