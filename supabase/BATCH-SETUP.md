# Database deployment

The matching app requires batch-upgrade.sql. Do not deploy the app before applying it.

1. Back up scout_entries, pit_entries, and profiles in Supabase.
2. Confirm schema.sql, auth-schema.sql, and pit-schema.sql have already been applied. Do not rerun the original schema script: it contains legacy anonymous policies.
3. Run batch-upgrade.sql in the SQL Editor as one transaction.
4. Deploy the matching app build. Existing open tabs must reload before submitting.
5. Sign in as two scouts, submit the same event/match/robot, and confirm both observations remain. Each scout can edit only their own record.
6. Import an event on one device and reopen Start Scouting on the other. Confirm its schedule loads.
7. Upload a JPG in Pit Scouting, submit, and open that profile on another device. Photos use private storage and temporary signed URLs.

The migration preserves existing observation contents. It changes the match primary key to include an immutable observer identifier. Deleted accounts retain that identifier. Unidentified legacy observations remain viewable.

Separate organizations are not implemented: active accounts still belong to the existing team. Do not invite unrelated teams into this deployment. A separate Supabase project and app deployment per team is the current isolation option.

Rollback requires reconciling multiple observations per match before returning to the original primary key.
