# Cloudflare Access / Supabase QA release boundary

This **QA-only** branch is based on main commit `50bd5611d49b15755e303c076605ac2138437ffd`.

- Do not merge this branch into main: it intentionally points to Supabase QA project `lvomrcqytfygcmguojcj`.
- Cloudflare Access applies only to `qa.badgalnurkan.com`; leave `badgalnurkan.com` and `www.badgalnurkan.com` unmodified.
- Deploy this branch only to a separate, isolated Vercel project. Never deploy production main from that project before configuring its source branch.
- All shipped HTML/JS entrypoints in this branch use the QA publishable key and QA Supabase URL. `vercel.json` CSP is scoped to QA.
- No user production data, passwords, service-role keys, SMTP tokens or active one-time codes are part of this branch.
- The Cloudflare Access hostname is not the Vercel origin. Protect the direct `*.vercel.app` QA deployment URLs independently (e.g. deployment protection), because Cloudflare cannot enforce Access on origin bypasses.
- Test DNS and emails after the QA Vercel project is ready; do not alter existing production DNS/mail records. Use `qa` **Proxied** on Cloudflare.
- Existing production references may remain only in non-deployed historical docs/scripts or test fixtures; never execute those scripts against production as part of QA.
- QA inbox/SMTP flows may not be configured: treat verification and password resets as unverified until real QA-only email is received.
- Validation: `node --test tests/qa-isolation.test.cjs` and app smoke tests. Do not use real customer accounts.

## QA account reactivation CORS fix (2026-11-22)
QA Edge Function `account-security` version 7 was redeployed with `https://qa.badgalnurkan.com` in `ALLOWED_ORIGINS` to resolve OPTIONS 403 for account reactivation. QA's sender readiness is a separate dependency: `MAIL_NOT_CONFIGURED` must not be bypassed. The repository handler also accepts this QA origin for regression coverage. Never merge this QA-only origin into production without review.

## Deployment segregation verification
The production Vercel project should ignore `qa-cloudflare` branch pushes via its Ignored Build Step (exit 0 to skip, exit 1 to build). This documentation-only commit is a safe trigger for verifying that guard. A successful command submission does not by itself prove that Vercel skipped the build. Do not treat QA preview deployments under the production project as production releases.

## QA synchronization safeguard (2026-11-22)
The QA UI now uses the existing database `iydu_save_cas` RPC with the exact data read from `iydu_load` as an expected snapshot. No last-writer-wins fallback is permitted. Conflicts or uncertain network outcomes stop cloud writes and warn the user; server data is not overwritten silently. This remains **QA-only** pending real multi-session tests. The existing QA database has some older Auth identities without `user_data` or username reservations; those accounts may fail safely rather than silently initialize. They require a separately designed, authenticated, idempotent initialization flow. Username-only cross-browser sign-in is still blocked until a server-mediated, rate-limited authentication flow is implemented. Do not merge this QA branch into main.
