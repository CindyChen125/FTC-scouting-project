# Database deployment

The matching app requires the existing event migration plus the dedicated synchronization and owner migrations. Do not deploy the new app before applying them.

1. Back up scout_entries, pit_entries, and profiles in Supabase.
2. Confirm schema.sql, auth-schema.sql, and pit-schema.sql have already been applied. Do not rerun the original schema script: it contains legacy anonymous policies.
3. Run batch-upgrade.sql in the SQL Editor as one transaction.
4. Run `event-management.sql` in the SQL Editor. It creates the central event list, admin-only creation/activation functions, RLS policies, realtime publication, and non-destructive seed rows for existing events.
5. Confirm `competition_events` contains one active row. Do not edit `is_active` directly; use Event Management in the app.
6. Deploy the matching app build. Existing open tabs must reload before submitting.
7. Sign in as two scouts, submit the same event/match/robot, and confirm both observations remain. Each scout can edit only their own record.
8. As an admin, create and activate a test event. Confirm a second signed-in device receives it and a regular scout cannot call either event RPC.
9. Import an FTCScout-backed event from Event Management and confirm its roster is available to progress reporting. Importing must not activate it.
10. Upload a JPG in Pit Scouting, submit, and open that profile on another device. Photos use private storage and temporary signed URLs.

For the next update, follow `NEXT-UPDATE-SETUP.md`. It supersedes the observation-key portion of `batch-upgrade.sql` with a standalone repeatable migration and adds permanent-owner authorization. The event-management migration does not need to be reapplied.

The migrations preserve existing observation contents. `batch-upgrade.sql` changes the match primary key to include an immutable observer identifier. `event-management.sql` does not add foreign keys to historical submissions, so legacy and imported event codes remain readable. Deleted accounts retain their identifier. Unidentified legacy observations remain viewable.

Separate organizations are not implemented: active accounts still belong to the existing team. Do not invite unrelated teams into this deployment. A separate Supabase project and app deployment per team is the current isolation option.

Rollback requires reconciling multiple observations per match before returning to the original primary key.
