# Transactional email: Free-only setup and release gate

**State:** Configuration prepared; NO production release. Never merge PR #29 until real inbox tests pass.

## What is already in place (verified 2026-11-19)

- Vercel owns the DNS zone for `badgalnurkan.com` and both custom site domains are verified.
- Existing domain DNS includes Resend-related records:
  - `resend._domainkey` TXT (DKIM)
  - `send` CNAME
  - `rsend` CNAME
  These records **do not prove** that the domain is Verified in the Resend dashboard.
  Do not replace or delete these records without checking their current use.
- Supabase project `lvomrcqytfygcmguojcj` is the isolated QA project on the Free plan.
  Live production project is `flcfqwndqfmbritaywfb`. Never substitute one for the other.
- The `account-security` v4 handler is deployed ONLY in QA. It correctly reports
  `transactionalMailReady:false, mailReady:false` without a sending key.
- Real HTTP adversarial checks passed in QA: missing bearer token returned
  **401 UNAUTHORIZED** (pg_net request 29), untrusted Origin returned
  **403 ORIGIN_NOT_ALLOWED** (pg_net request 30).
- GitHub's new signup confirmation template already uses `{{ .Token }}`, not
  a link. This **does not** prove that the dashboard template was applied.
- Supabase's default SMTP on new Free projects cannot customize Auth email
  templates (policy effective 2026-06-03). Custom SMTP unlocks templates.

## Human-owned credential setup (no credentials sent to ChatGPT/GitHub)

1. Sign in to [Resend Domains](https://resend.com/domains) and inspect
   `badgalnurkan.com`. If it is already **Verified**, **do not alter DNS**.
   If verification is incomplete, compare only the required records with
   Vercel DNS. Keep existing site and mail records intact.
2. Confirm [Resend Free pricing](https://resend.com/pricing); remain on
   Free and do **not** enable paid overages, add-ons or subscription upgrades.
   Free tier currently lists 100 outgoing messages/day, three domains, and
   SMTP relay support. Avoid a paid Automation add-on.
3. Under [Resend API Keys](https://resend.com/api-keys), create a **sending-only,
   domain-restricted** key for QA. A separate key for production simplifies
   rotation. Do not paste the key in chat, source code, build logs, or email.
4. Open the **QA project's** [Supabase Auth SMTP settings](https://supabase.com/dashboard/project/lvomrcqytfygcmguojcj/auth/smtp) and enter:
   - Sender email: `security@badgalnurkan.com`
   - Sender name: `Improvin' Your Day`
   - Host: `smtp.resend.com`
   - Port: `465` (SSL), or a provider-documented STARTTLS port if needed
   - Username: `resend`
   - Password: the Resend sending API key, entered **only in the Supabase dashboard**
   - Keep Confirm email enabled and existing Auth security limits on.
5. In the QA project's [Supabase Auth Email Templates](https://supabase.com/dashboard/project/lvomrcqytfygcmguojcj/auth/templates),
   replace **Confirm sign up** content with the reviewed
   `supabase/email-templates/confirm-signup-otp.html` file. Confirm that
   `{{ .Token }}` appears and `{{ .ConfirmationURL }}` is absent.
   Other Auth templates (especially recovery and Google OAuth) must continue
   to work; do not accidentally replace them.
6. In [QA Edge Function Secrets](https://supabase.com/dashboard/project/lvomrcqytfygcmguojcj/settings/functions),
   add `RESEND_API_KEY` with the **same or a separate QA sending key**.
   Add `ACCOUNT_MAIL_FROM` as
   `Improvin' Your Day <security@badgalnurkan.com>`.
   Never place these under Vercel's public environment variables.
7. Check `GET https://lvomrcqytfygcmguojcj.supabase.co/functions/v1/account-security`.
   Expect `version:4` and `transactionalMailReady:true`. This checks
   configuration only; it is NOT evidence of deliverability.

## Real QA evidence required BEFORE production

- Create a new, disposable **QA Auth** signup account using a test-only email
  alias that arrives in a mailbox you control. Do NOT use the production app
  preview as a QA frontend: its Supabase URL may still point to production.
- Search the mailbox for the actual new message. Confirm receipt, sender,
  six numeric digits and expiry; never expose a usable OTP in public logs.
- Submit the **received** OTP to QA `/auth/v1/verify` with
  `type:"email"`, inspect successful verified Auth identity and session.
- Check invalid digits, replay, expiry and resend/rate-limit behavior.
- For account closure, log in to that **QA-only** account with fresh
  authentication, request a temporary close, verify a **different**
  six-digit closure code was emailed, and confirm explicitly. Verify
  30-day retention. Reactivate and verify access returns safely.
- For permanent deletion, verify receipt of the dedicated link, choice of
  reason, separate Yes confirmation and 60-day deadline. Do not accelerate
  an existing user's deadline; use disposable QA identities only.
- Verify an undeliverable address or provider outage returns an error
  without changing account state; check logs for secret leaks.
- Verify existing Google OAuth and same-browser password recovery on
  representative browsers, and keep current real user records untouched.
- Review database migration, Edge code version and Storage ownership/race
  conditions before the production rollout. QA Storage cron E2E already
  passed for one object per user; batch/race cases are not yet verified.

## Coordinated production release (BLOCKED until all the above pass)

1. Back up/check existing live Auth + private data state and take a
   read-only schema snapshot; ensure there is a tested recovery plan.
2. Configure a **production-only** Resend sending key in production
   Supabase Auth SMTP and Edge Function Secrets. Apply the corresponding
   Confirm sign up OTP template; verify a real email in a test inbox.
3. Apply reviewed production SQL migrations, Edge Functions and scheduled
   Storage API cleanup in the correct order. Verify service_role-only
   grants; do not touch existing users' deletion deadlines.
4. Merge the exact reviewed PR commit; Vercel builds from `main`.
   Check Chromium/WebKit/Firefox smoke tests, custom domains, log errors,
   weekly/monthly reports, username uniqueness and data ownership.
5. Verify an actual full signup and both account-closure mail flows, with
   Free-tier quota monitoring. Roll back frontend+backend as a coordinated
   change if a hard gate fails.

## Official references

- https://resend.com/docs/send-with-supabase-smtp
- https://resend.com/pricing
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
- https://supabase.com/docs/guides/auth/auth-email-templates
