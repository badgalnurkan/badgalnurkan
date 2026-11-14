# Account identity and sync release gate

This checklist is for the actual production entrypoint `index.html`, not the older `deneme.html` copies. The PR is not approved to merge by the presence of syntax checks alone.

## 1. Protect the existing data first

1. Export each affected account's current data from the app on the device where its most complete copy exists.
2. Back up Supabase `public.user_data` and database function definitions privately (never commit account exports, emails, keys, access tokens or SQL result sets containing personal data).
3. Inspect `supabase/diagnostics/account-integrity-readonly.sql` on the target Supabase project. Verify the same project URL is used by the frontend.
4. Confirm all SQL functions that can change `public.user_data` or username-reservation records, including server-side triggers and Edge Functions.
5. Do not delete old localStorage records to resolve a conflict. Cache-alias repair writes a recoverable `b1.alias-backup.*` entry first and fails closed if it cannot do so.

## 2. Username identity and authentication tests

Use disposable test accounts, not a real person's account. Test case-insensitive Turkish names (`Öznur/öznur`, `İrem/irem`, `Işık/ışık`) on a clean browser and on a browser with older local records.

- Server says name available; local browser has unrelated old account: UI identifies the **local cache conflict** instead of claiming the name is globally taken, and never replaces the unrelated account.
- Server says name taken: both profile and settings flows reject it, with no partial local mutation.
- Network timeout, permission error and expired session: no generic “username taken” message.
- Successful rename: `iydu_usernames.username`, `profiles.username`, and `user_data.data->>'u'` contain the intended identity; the `user_data` table has NO standalone username column, and old local aliases do not shadow the account.
- Re-login from a different browser and after a page refresh: exactly one visible cloud profile per `auth.uid()`, with tasks, journals, and progress intact.
- Failed alias backup (browser quota full): existing local records remain unchanged.
- A login with correct password but failing profile-load RPC reports **profile unavailable** rather than **wrong password**.
- Google login, signup with email verification, password reset, and legacy-local migration remain functional.
- Run the automated `npm test` command and verify the GitHub **Account consistency** workflow succeeds.

## 3. Multi-device write protection — STAGED, NOT DEPLOYED

The *production* `iydu_save` still writes the entire JSON blindly. The *staged PR* implements server-side JSON compare-and-swap, blocks old blind writes and direct table updates, and retains conflicts in durable local backups. These tests passed on temporary Supabase and Chrome, but were not applied to production.

**Before claiming cross-device write safety:**
1. Verify the live SQL definitions and whether username reservation is stored separately from `user_data`.
2. Add an atomic compare-and-swap operation to the server using a monotonic revision (or complete expected-row comparison), enforced within a single database transaction.
3. Ensure ALL mutation paths, **including old `iydu_save` clients**, either respect the revision or fail closed; otherwise older tabs can still overwrite newer records.
4. Store the last confirmed server version alongside each local write. Serialize requests for the same user.
5. On conflict, retain the unsent local data and the remote snapshot, show a persistent conflict warning, and provide a non-destructive resolution path. Never silently replace a user's journal or tasks.
6. Test simultaneous two-device updates, network timeout after a successful commit, token refresh, new account creation, username rename, reset and legacy migration.

## 4. Deployment decision

Do not merge the draft PR until:
- The read-only Supabase audit has been reviewed.
- A real-browser end-to-end test has verified registration, login, username rename and re-login on separate devices.
- Sync collisions have server-side protection or the product clearly warns that cross-device editing is not yet safe.
- A rollback plan and backups exist.

After a successful staged rollout, log the released changes in the site's planned Updates feature. Do not publish changelog claims for unshipped features.


## Username integrity implementation — STAGED, NOT RELEASED

The audited live project (2026-11-15) had 5 Auth users, 5 `profiles` rows,
5 `user_data` rows, and 4 username reservations. The one unclaimed account had
a Google identity and no `raw_user_meta_data.username`. Three profiles had
`NULL` usernames, and another profile disagreed with the matching
reservation/JSON. No existing account records were modified by the audit.

- `supabase/rollouts/username-integrity-staging.sql` is deliberately **not**
  under `supabase/migrations/` and must not be auto-applied or run on production.
  Create the reviewed versioned migration with the Supabase CLI only after
  backup, staging SQL integration tests and deployment approval.
- `tests/sql/bootstrap.sql` mirrors audited tables, indexes, RLS and signup
  triggers on **synthetic records**. CI applies the staged script to a disposable
  PostgreSQL 17 service and verifies Google claiming, email signup uniqueness,
  exact readback, old-tab stale-name overwrites, collision rollbacks and a
  two-connection concurrent claim race.
- Frontend login, OAuth callback and session restoration all require a canonical
  `iydu_my_username()` lookup before entering the app. A Google account with
  no reservation sees an explicit, cancelable username claim screen. Existing
  journals/tasks are not rewritten by the claim itself. Local cache aliases are
  archived before rekey.
- The atomic `iydu_set_username` RPC updates the reservation, profiles row and
  JSON `u` field in one transaction. The new `iydu_save_cas` uses an exact
  raw JSON expected-data predicate; legacy `iydu_save` rejects all writes.
  Direct table mutations are revoked, while ownership-limited SECURITY DEFINER
  RPCs perform controlled writes. `iydu_username_available` checks BOTH
  unique indexes; the indexes are authoritative.
- **No automatic backfill**: historical mismatches and the missing Google
  reservation remain unchanged until the account holder claims a name. Do not
  overwrite historical `profiles.username` values without an identity-linked
  audit and private backup.
- Order for an approved release: verified backups and private function-definition
  export; apply staged SQL to a disposable environment; run GitHub Actions and
  user-facing browser tests; deploy SQL/functions **before** the new frontend;
  verify `anon`/`authenticated` function privileges; verify two new
  accounts and a renamed account; then release the frontend with rollback ready.
- The Supabase SQL is staged separately because GitHub preview for `index.html`
  still points at the production Supabase URL; never perform test registrations
  from that preview against the real project.
- **Operational risk:** the unmerged PR prevents silent stale writes in disposable
  tests, but production remains last-writer-wins. Old open clients will lose
  cloud-write capability during the SQL/frontend cutover (their browser data
  must be preserved). Conflict edits are archived, not silently merged.
  See `docs/cas-rollout-release-plan.md` for required staging, backup, cache
  and rollback gates.
- The security advisor flagged legacy SECURITY DEFINER APIs, especially
  `handle_new_user` with anonymous EXECUTE. Audit/restrict privileges in a
  separately tested, reversible security change; a privileged trigger should
  not automatically become a public RPC.


## Follow-up verified CI (staged only)

At commit `3f4c67a2c888bc4523a9fc3cbf2e4229acbb163e`,
all three GitHub workflows passed on the temporary test environment,
including genuine local Supabase Auth, SQL ACL/revocation checks, real
Chrome two-session data conflicts, durable recovery after browser reload,
backup download and controlled cloud choice. Details:
`docs/google-oauth-and-sync-review.md`.

**NOT proven**: actual external Google consent, SMTP, production
rollout or legacy-open-tab upgrade safety. Do not merge or deploy
before these gates and verified private backups.
