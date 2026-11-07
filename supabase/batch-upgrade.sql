-- Run after schema.sql, auth-schema.sql and pit-schema.sql.
-- Back up the project first. Deploy the matching app build after this succeeds.
begin;

alter table public.scout_entries add column if not exists observation_key text;
update public.scout_entries set observation_key = coalesce(scouted_by::text, 'legacy')
where observation_key is null;
alter table public.scout_entries alter column observation_key set not null;
alter table public.scout_entries drop constraint if exists scout_entries_pkey;
alter table public.scout_entries add primary key (event_code, match_id, team_number, observation_key);

create or replace function public.guard_observation_identity()
returns trigger language plpgsql set search_path = public as $$
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
create trigger scout_entries_identity before insert or update on public.scout_entries
for each row execute function public.guard_observation_identity();

drop policy if exists "members update entries" on public.scout_entries;
create policy "members update entries" on public.scout_entries for update to authenticated
using (is_active_member() and scouted_by = auth.uid())
with check (is_active_member() and scouted_by = auth.uid());

create table if not exists public.event_imports (
  season integer not null,
  code text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (season, code)
);
alter table public.event_imports enable row level security;
drop policy if exists "members read events" on public.event_imports;
create policy "members read events" on public.event_imports for select to authenticated using (is_active_member());
drop policy if exists "members create events" on public.event_imports;
create policy "members create events" on public.event_imports for insert to authenticated with check (is_active_member());
drop policy if exists "members refresh events" on public.event_imports;
create policy "members refresh events" on public.event_imports for update to authenticated using (is_active_member()) with check (is_active_member());
grant select, insert, update on public.event_imports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('robot-photos', 'robot-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "members read robot photos" on storage.objects;
create policy "members read robot photos" on storage.objects for select to authenticated
using (bucket_id = 'robot-photos' and public.is_active_member());
drop policy if exists "members upload robot photos" on storage.objects;
create policy "members upload robot photos" on storage.objects for insert to authenticated
with check (bucket_id = 'robot-photos' and public.is_active_member() and (storage.foldername(name))[1] = auth.uid()::text);
commit;
