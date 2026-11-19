# Storage-aware account retention — staged, FREE-only design

**Status: Draft. Real QA end-to-end test passed on 2026-11-19; NOT deployed to production.** This complements PR #29's
`account_retention_30_60_staging.sql`, without modifying the existing live
database, scheduler, or user records. The isolated QA project has an active scheduled Edge Function and a separate automatic Auth purge; live production remains untouched.

## Why there are two jobs

1. **Existing pg_cron / Postgres purge** (`iydu-account-deletion`, every
   15 minutes): once the 30/60-day deadline has passed, deletes Auth users only
   if their `storage.objects.owner_id` has **no remaining objects**. Existing
   permanent deletion deadlines and legacy deactivations without deadlines
   are preserved.
2. **New scheduled Edge Function** (`retention-storage`, *active only in isolated QA*): selects at most 50 due user-owned
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
  `x-iydu-retention-token` header, or uses the service-role-only
  `iydu_retention_token_valid` RPC to compare against an encrypted Vault secret.
  The RPC returns a boolean, never the secret. Use `verify_jwt=false` only
  with this server-only validation enabled.
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
2. In **QA only**, generate a 32+ character secret directly inside
   Supabase Vault under `iydu_retention_cron_secret`. The Edge Function
   validates it through the service-role-only boolean RPC, so the secret is
   never copied into an unencrypted app setting. Alternatively, configure
   a dedicated `RETENTION_CRON_SECRET` as an Edge secret. Store the project
   URL in Vault under `iydu_retention_project_url`.
   **Never paste actual secrets into code.**
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
5. After real QA Storage + retention tests pass, configure pg_cron + pg_net
   + Vault. An equivalent job was manually created and executed in QA on
   2026-11-19. Below is a reusable example, not an auto-run migration:

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

## Real QA evidence — 2026-11-19 (isolated Free project)

Project reference: `lvomrcqytfygcmguojcj`. No production user data copied.

- A disposable Auth user was created through the Auth API; a real file was
  uploaded with that user's JWT via Storage API (HTTP 200). A direct query
  confirmed `storage.objects.owner_id` matched the Auth user ID.
- A second Auth user uploaded another actual Storage file as a negative control.
- The first account was marked `pending_delete` with a deadline in the past,
  while the other remained 60 days in the future.
- Scheduled `iydu-qa-storage-retention` (cron job ID 1) invoked the Edge
  Function over HTTP. The async network result (request ID **12**)
  returned HTTP **200**, `{"ok":true,"attempted":1,"buckets":1}`.
- Independent Storage SQL query confirmed the first file was gone and the
  control user's file still existed.
- Scheduled `iydu-qa-account-deletion` (cron job ID 2) ran afterward.
  Independent Auth SQL query confirmed due user count **0**, control user
  count **1**, due object count **0**, control object count **1**.
- A request with the wrong 64-character cron token (net request ID **16**)
  returned HTTP **401**, `{"code":"UNAUTHORIZED"}`.
- The temporary QA-only fixture creation route was removed by redeploying
  the standard `retention-storage` Edge Function (version 6).

**Limits:** This proves the real one-file API-to-cron-to-Auth flow, not
production readiness for all Storage features. Larger-than-50 batches,
versioned/shared paths, upload races, deliberate Storage failures, and
cron retry behavior must be reviewed before production. PR #29 still
requires real signup OTP delivery and coordinated release verification.

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
