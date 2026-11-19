# P0 Data-loss prevention — hosted QA verification (20 November 2026)

> **QA only. Production is still vulnerable to old blind saves.** Do not merge PR #6 directly: it is currently draft and not mergeable with `main`. Do not apply any of these SQL scripts to production without reviewed backup/rollback and coordinated frontend deployment.

## What was applied in isolated QA

Project **iydu-retention-qa-free** (`lvomrcqytfygcmguojcj`), never the production project `flcfqwndqfmbritaywfb`:

1. `supabase/qa/cas-foundation-qa-only.sql`: creates synthetic-compatible `public.profiles`, `public.user_data`, `public.iydu_usernames`, RLS, and new-signup profile triggers. Existing QA Auth users were not modified.
2. `supabase/rollouts/username-integrity-staging.sql`: installs owner-bound `iydu_save_cas`, blocks old blind `iydu_save`, revokes browser-role direct data writes, and checks username identity.
3. `supabase/rollouts/journal-revisions-staging.sql`: archives prior changed/deleted daily journal entries into `iydu_private.journal_revisions` in the same transaction. If the archive write fails, the user data change fails. Only an authenticated, UID-filtered RPC can retrieve the private history.

**Scope:** SQL and permission model only. No production deployment or real journal restoration.

## Tests executed on hosted QA PostgreSQL

`supabase/qa/cas-safety-assertions-qa-only.sql` was executed in an explicit `BEGIN ... ROLLBACK` transaction with three synthetic Auth identities. All assertions passed:

- A computer saved the 19 November synthetic journal; a stale phone snapshot targeting 20 November was refused rather than deleting 19 November.
- A reviewed fresh-base update preserved both days' entries.
- Simulated deletion of 19 November with a current base archived the prior entry, which was restored with an owner-bound CAS. History for one user was not returned to another.
- Legacy blind-save RPC rejected the write. Browser-role direct UPDATE/INSERT/DELETE remained revoked.
- Three identities each read and wrote only their own data; no other user's journal history was readable.
- The transaction's synthetic Auth users, user data and revision rows were rolled back.

Post-test read-only verification: QA Auth users remained **4**, `public.user_data` **0 rows**, history **0 rows**, history table RLS enabled; anonymous history RPC EXECUTE **false**; direct history table SELECT as `authenticated` **false**; direct user_data UPDATE **false**.

The test in `tests/supabase-local/cas-experiment.cjs` also models same-day conflict; the newly updated browser/Node test suite has **not** yet been rerun end-to-end on the latest commit. Earlier CI green is not proof of the latest state.

## Remaining production release gates

1. Create/verify a **private production backup** and independently test restore. A Pro/PITR guarantee must not be assumed on the Free plan.
2. Reconcile the stale, non-mergeable PR #6 against current `main` without regressing features released after November 15. Test the actual `index.html` on Chromium, WebKit, Firefox, iOS/Android devices and long-lived legacy tabs.
3. Bind frontend writes to a last acknowledged raw cloud JSON base, serialize pushes, retain local drafts until accepted, stop on conflict and offer explicit export/reconciliation. **No silent last-writer-wins.**
4. Run 3-account cross-device end-to-end tests using QA Auth in separate browsers. Verify journal preservation, manual recovery, account switch, offline/timeout, retry-after-unknown-commit, and same-day conflict UI.
5. Ensure all mutation paths (old RPC, direct Data API, migration RPC, username functions, other administrative/Edge writes) are audited. Verify the private history's retention/storage growth and privacy policy before rollout.
6. Coordinate SQL+frontend change, forced refresh/upgrade path for older open clients and canary rollout; no silent re-enable of old blind writes during rollback.

## Explicit limitations

- The historical user's real 19 November diary was **not** recovered.
- SQL CAS avoids destructive stale writes, not automatic realtime convergence. A safe freshness check/subscription and user-visible conflict resolution remain separate product features.
- There is no UI yet for server journal revision history; retrieval RPC is a tested building block, not a completed self-service restore feature.
- Existing QA project account-security tables are not yet a full production-equivalent environment.
- This does **not** authorize edits to live user data or a paid plan upgrade.
