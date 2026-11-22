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
