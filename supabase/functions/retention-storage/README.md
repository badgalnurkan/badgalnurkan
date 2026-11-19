# Storage-aware account retention — staged, FREE-only design

**Status: Draft. Do not deploy to production yet.** This complements PR #29's
`account_retention_30_60_staging.sql`, without modifying the existing live
database, scheduler, or user records. The isolated QA project received the
read-only object-enumeration RPC for functional tests.

## Why there are two jobs

1. **Existing pg_cron / Postgres purge** (`iydu-account-deletion`, every
   15 minutes): once the 30/60-day deadline has passed, deletes Auth users only
   if their `storage.objects.owner_id` has **no remaining objects**. Existing
   permanent deletion deadlines and legacy deactivations without deadlines
   are preserved.
2. **New scheduled Edge Function** (`retention-storage`, *disabled until
   separately configured and verified*): selects at most 50 due user-owned
   objects from the service-only RPC and calls the supported Storage API's
   exact-path `DELETE /storage/v1/object/{bucket}` request with
   `{ "prefixes": ["file/path"] }`. It NEVER deletes `storage.objects`
   rows directly or deletes Auth users. The original database job handles
   final Auth deletion after checking that Storage is empty.

This separation makes a failed Storage request recoverable on a later scheduled
invocation. A 2xx response means only that removal was attempted; the
database must still verify the actual remaining ownership metadata.

## Access controls

- `public.iydu_due_storage_objects` is a `SECURITY DEFINER` RPC with a
  server-side `auth.role() = 'service_role'` guard and explicit `REVOKE`
  for PUBLIC, anon, and authenticated; only service_role has EXECUTE.
- The Edge Function accepts **POST only**, is not CORS-enabled, and validates
  a dedicated 32+ character `RETENTION_CRON_SECRET` in the
  `x-iydu-retention-token` header before making any database calls.
  Use `verify_jwt=false` only with this dedicated server-only check.
- No credential, object path, email address, or user ID is returned to the caller
  or logged. Never put the cron secret or service key in GitHub or frontend code.
- The SQL refuses to select object paths with conflicting ownership, versions,
  or deletion markers. Those files block final account purge and require a
  separately reviewed cleanup process; do not bypass the Storage API.
- Stored objects without `owner_id` cannot be safely linked to a user.
  **Before enabling uploads**, enforce user-scoped object ownership (and
  appropriate private bucket access policies), or track ownership in a
  dedicated table. The current live project has no Storage buckets.

## Release sequence (review each gate)

1. Review and apply **both** staged SQL files in the isolated QA Supabase
   project first. Inspect `get_advisors` and verify the service-only grants.
2. In **QA only**, configure an independently generated long random secret as
   `RETENTION_CRON_SECRET` under Edge Function secrets, and store the *same
   value* encrypted under `iydu_retention_cron_secret` in Supabase Vault.
   Store the exact QA Supabase project URL in Vault as
   `iydu_retention_project_url`. **Never paste actual secrets into code.**
3. Deploy `retention-storage` from `supabase/functions/retention-storage`
   into QA with `verify_jwt=false`, and immediately test unauthorized calls
   (401), no config (503) and an authorized empty batch (200, attempted=0).
   Do not deploy or schedule before dedicated secret validation is working.
4. Create a disposable QA-only Storage bucket and test Auth user with owned
   uploads using the **Storage API**. Mark the test account due, verify:
   - No removal before deadline; a due object is selected only for its owner.
   - Only its own object paths are removed; other users' files survive.
   - The existing database purge removes the account only when owned objects
     are gone.
   - A failed/interrupted Storage API request does not remove the Auth user
     while owned objects remain; the next tick can resume.
   - More than 50 files take multiple ticks without mixing users or buckets.
   - Legacy accounts, non-due accounts, unknown owner, and versioned/shared
     paths remain untouched.
5. Only when real QA Storage + retention tests pass, configure the QA cron
   job, using pg_cron + pg_net + Vault. Below is an **illustrative** command,
   not an automatically applied migration:

```sql
-- QA ONLY. pg_cron/pg_net and Vault secrets must already be configured.
select cron.schedule(
 'iydu-storage-retention',
 '*/15 * * * *',
 $job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets
           where name='iydu_retention_project_url') ||
          '/functions/v1/retention-storage',
   headers := jsonb_build_object(
     'Content-Type', 'application/json',
     'x-iydu-retention-token',
     (select decrypted_secret from vault.decrypted_secrets
       where name='iydu_retention_cron_secret')
   ),
   body := '{}'::jsonb,
   timeout_milliseconds := 15000
 );
 $job$
);
```

6. Keep PR #29 as draft until this test, real signup OTP delivery, and
   browser recovery are all verified. Review potential Free-plan limits
   before scheduling recurring tests or a production release.

## Rollback / failure recovery

- In an emergency, first **unschedule or deactivate only**
  `iydu-storage-retention` (leave the existing production purge job untouched).
  Then redeploy or disable `retention-storage`.
- Do not revoke/deactivate a cron secret before stopping its scheduled job.
- Object deletion through the Storage API is irreversible; a broken partial
  batch must not be incorrectly reported as fully deleted.
- Monitor function failures and due accounts retaining Storage metadata.
  A user cannot be marked as fully deleted while owned objects remain.
- No automatic migration, deployment, or cron scheduling happens from this PR.

Official references:
- https://supabase.com/docs/guides/storage/management/delete-objects
- https://supabase.com/docs/guides/functions/schedule-functions
- https://supabase.com/docs/guides/functions/auth
