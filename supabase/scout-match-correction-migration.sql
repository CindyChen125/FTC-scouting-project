-- Allow a scout to correct the match or team number of an existing observation.
-- Run after scout-observation-key-migration.sql. Safe to run repeatedly.
-- RLS, authorship protection, and the four-column primary key remain in force.

begin;

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
    -- Match and team may move to a new slot. The event and scout identity may
    -- not move; the primary key rejects a collision in the destination slot.
    if (new.event_code, new.observation_key)
       is distinct from (old.event_code, old.observation_key) then
      raise exception 'Observation event and author identity cannot change';
    end if;
    if nullif(btrim(new.match_id), '') is null
       or nullif(btrim(new.team_number), '') is null then
      raise exception 'Match and team number are required';
    end if;
  end if;
  return new;
end;
$$;

commit;
