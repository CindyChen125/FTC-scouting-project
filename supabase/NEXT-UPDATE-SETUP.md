# Synchronization and owner migration

Apply these changes before deploying the matching frontend build. Committing SQL to GitHub does not change Supabase.

## 1. Back up and inspect

In Supabase, create a backup (or export `scout_entries`, `pit_entries`, and `profiles`). Then open **SQL Editor → New query** and run:

```sql
select user_id, username, display_name, role, is_active
from public.profiles
order by created_at;
```

Record the original owner's `user_id`. This is the stable Supabase Auth UUID, not a username.

## 2. Repair match-observation identity

Copy the complete contents of `supabase/scout-observation-key-migration.sql` into a new SQL Editor query and select **Run**.

Verify the four-column key and historical backfill:

```sql
select
  count(*) as total_rows,
  count(*) filter (where observation_key is null or btrim(observation_key) = '') as invalid_keys,
  count(*) filter (where observation_key = 'legacy') as legacy_rows
from public.scout_entries;
```

`invalid_keys` must be `0`. This migration does not delete or recreate any entry and does not replace RLS policies.

## 3. Configure the permanent owner

Copy the complete contents of `supabase/owner-admin-migration.sql` into a second SQL Editor query and select **Run**.

If exactly one active Admin existed, that UUID is selected automatically. Verify it:

```sql
select o.user_id, p.username, p.display_name, p.role, p.is_active
from public.app_owner o
join public.profiles p on p.user_id = o.user_id;
```

If this returns no row, there were zero or multiple active Admin profiles. Select the original owner explicitly, replacing the UUID below with the value recorded in step 1:

```sql
insert into public.app_owner (singleton, user_id)
values (true, 'REPLACE-WITH-OWNER-UUID');
```

Run the verification query again. Do not guess the UUID.

Existing additional Admin profiles are preserved unchanged, but `is_admin()` and the account-management function now authorize only `app_owner.user_id`. Review each extra Admin manually. After confirming an account should become a Scout, transition it in the SQL Editor:

```sql
update public.profiles
set role = 'scout'
where user_id = 'REVIEWED-USER-UUID'
  and user_id <> (select user_id from public.app_owner where singleton);
```

Never run that update against the owner UUID.

## 4. Deploy the account-management function

The updated `supabase/functions/admin-users/index.ts` must be deployed after the owner row is verified:

```sh
supabase functions deploy admin-users
```

The function uses the existing Supabase-managed `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not put the service-role key in frontend code.

## 5. Deploy and verify

Deploy the frontend, reload all open tabs/devices, and perform these checks:

1. Submit the same event, match, and team from two Scout accounts. Confirm two rows exist with different `observation_key` values.
2. Resubmit from one of those accounts. Confirm that scout's row updates without adding a third row.
3. Put a device offline, submit, reconnect, and use Retry. Confirm the local entry remains until Supabase acknowledges it.
4. Confirm the owner can create, rename, reset, deactivate, reactivate, and delete Scout accounts.
5. Confirm a Scout and any preserved legacy Admin cannot open Admin or call owner-only event/account operations.
6. Confirm the owner has no demote, deactivate, or delete control for their own account.
7. Submit and edit one Pit Scouting profile. No pit schema change is required: its current `(event_code, team_number)` identity matches the client upsert.

## Rollback note

Do not restore the old three-column match primary key while multiple observations exist for the same event/match/team. Reconcile those rows first or the rollback will fail and would risk losing independent scout observations.

