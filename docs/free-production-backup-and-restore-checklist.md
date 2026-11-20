# Production backup and restore — FREE, owner-executed release gate

Status: **NOT DONE**. No verified production dump or isolated restore currently exists.
This is a prerequisite before production data migrations for PR #38 and #40.
The assistant must not request, download, inspect, share, or store database passwords, dump contents, access tokens, or user email data.

## 1. Export locally (Windows)

Official guidance: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
and https://supabase.com/docs/guides/platform/backups

- Use your own trusted PC, private encrypted disk, supported Docker Desktop and Supabase CLI (exact version pinned locally for the release). Do not run from a shared machine.
- In the **production** Supabase dashboard `flcfqwndqfmbritaywfb`, choose **Connect → Session pooler** and copy its database connection string into a **private local environment only**, not to ChatGPT, GitHub, Vercel, a ticket or a screenshot.
- Use CLI according to the currently installed `supabase db dump --help`, with the local connection string from your own environment and local output filenames:
  ```sh
  supabase db dump --db-url "$DATABASE_URL" -f roles.sql --role-only
  supabase db dump --db-url "$DATABASE_URL" -f schema.sql
  supabase db dump --db-url "$DATABASE_URL" -f data.sql --use-copy --data-only
  ```
  On PowerShell pass the value as `$env:DATABASE_URL` rather than Bash `$DATABASE_URL`. Avoid typing a full secret URI in a command saved to shell history. Never commit these three files.
- Supabase CLI dump excludes some platform-internal schemas by default; check that Auth, user_data, profiles, username reservations and private account control/revision tables are included where needed. The chosen tool's `--help` / platform guidance determines whether an extra schema export is necessary.
- Make a separate inventory and **private backup** of Storage objects. A database dump only includes Storage metadata, not file bytes. No object should be deleted or overwritten during backup.
- Calculate SHA-256 checksums locally (e.g. `Get-FileHash *.sql -Algorithm SHA256` in PowerShell), save checksum manifests next to the encrypted archive. Archive and store the dump OFFLINE/encrypted (BitLocker or equivalent). Do not upload user data to GitHub or ordinary conversation attachments.

## 2. Restore rehearsal

- Restore ONLY to an isolated disposable local PostgreSQL / Supabase environment with compatible extensions. Never restore back over production or the shared QA project.
- Confirm the restoration process actually completes without unreconciled SQL errors. **File existence and checksum alone are NOT a restore test.**
- Compare **counts** for `auth.users`, `public.user_data`, `public.profiles`, `public.iydu_usernames`, and essential private account state, and confirm key constraints and RLS/EXECUTE properties. Exclude raw personal records, journal text and passwords from the release report.
- Verify sample restoration of an **owner-approved** synthetic account diary backup without touching an existing user. Test that a reversed schema migration can be coordinated with an earlier app build.
- Only mark the release gate PASS after the restored database and Storage object inventory are confirmed. Record the **backup timestamp, non-secret dump file checksums, database schema version, test method, success status and location category** (encrypted/offline, never exact path/secret).

## 3. Cutover sequence once other QA gates pass

1. Quiesce legacy browser writes using a coordinated, tested release window and show an upgrade message for old tabs; preserve unflushed local drafts.
2. Verify an isolated fresh production snapshot immediately before release.
3. Run `supabase/rollouts/username-reservation-reconcile-staging.sql`; it repairs the detected missing reservation and stale profile names with transaction-level collision checks, without mutating daily journal JSON.
4. Run the reviewed CAS/journal-history migration, then server browser verification migrations and Edge function.
5. Confirm old blind `iydu_save` writes are denied; new CAS writes work; browser sessions must receive/email-verify their OTP before accessing private data.
6. Deploy the **production** browser build without QA public API configuration, do minimal synthetic canary and rollback rapidly if a gate fails.
7. Avoid automatic rollback of a database schema by overwriting new user data with an older dump; use the restore plan only as a controlled incident response.

## Blocked until owner confirms

- [ ] Real production dump and encrypted offline copy created
- [ ] Successful isolated database restore verified
- [ ] Storage object inventory/backup accounted for
- [ ] QA 3-account email + Google + browser OTP + CAS E2E verified
- [ ] Production identity reconciliation reviewed
- [ ] Secure email change and Web Push tested or explicitly deferred and accurately disclosed
- [ ] No failing genuine CI/browser/security gate (historical hard-coded CAS guard changed only as part of authorized release)
