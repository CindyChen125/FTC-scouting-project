-- Permanent owner authorization.
-- Prerequisite: auth-schema.sql.
-- Safe to re-run. Existing extra admin profiles are preserved unchanged but
-- no longer receive privileged access until they are manually reviewed.

begin;

create table if not exists public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.app_owner enable row level security;
revoke all on public.app_owner from anon, authenticated;

-- The common case is unambiguous: the one existing active admin is the
-- original owner. When zero or multiple active admins exist, this inserts
-- nothing and the deployment guide requires an explicit UUID selection.
insert into public.app_owner (singleton, user_id)
select true, user_id
from public.profiles
where role = 'admin' and is_active
  and (select count(*) from public.profiles where role = 'admin' and is_active) = 1
on conflict (singleton) do nothing;

create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.app_owner o
    join public.profiles p on p.user_id = o.user_id
    where o.singleton and o.user_id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;

-- Keep the established helper name so event management and entry-delete RLS
-- automatically become owner-only without rewriting those systems.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$ select public.is_owner(); $$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

-- All future accounts are scouts. Privileged role metadata from any client,
-- including the account-management function, is intentionally ignored.
create or replace function public.handle_new_user()
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
    'scout'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Role changes are never accepted from the app. The owner remains active and
-- admin permanently; the owner may manage active state only for Scout rows.
-- Extra historical admins stay exactly as they are pending manual review.
create or replace function public.guard_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select user_id into owner_id from public.app_owner where singleton;

  new.user_id := old.user_id;
  new.username := old.username;

  if old.user_id = owner_id then
    new.role := 'admin';
    new.is_active := true;
  elsif auth.uid() is null then
    -- Trusted maintenance in the SQL Editor may explicitly transition a
    -- reviewed legacy admin. No browser session reaches this branch.
    return new;
  elsif not public.is_owner() then
    new.role := old.role;
    new.is_active := old.is_active;
  else
    new.role := old.role;
    if old.role <> 'scout' then new.is_active := old.is_active; end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Recreate the update policy so its meaning is explicit after is_admin()
-- becomes owner-only. Ordinary members may still rename only themselves;
-- the trigger protects every privileged column.
drop policy if exists "admins update profiles" on public.profiles;
drop policy if exists "owner updates profiles" on public.profiles;
create policy "owner updates profiles" on public.profiles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

commit;

