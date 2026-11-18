# Account security release · 17 November 2026

Primary origin: https://badgalnurkan.com. Also permitted: www and the previous Vercel origin.
No real user account was deleted or modified as a test.

## Deployment
The account lifecycle migration and account-security Edge Function are deployed. The old immediate delete-account function returns HTTP 410 and the old delete_my_account RPC is no longer executable by users. A private cron job runs every 15 minutes after the 30-day deadline. A Storage ownership guard retains an account for remediation if unexpected owned objects appear; currently Storage has no objects.

## Email setup
Supabase Auth uses its configured SMTP for email confirmation, change and recovery. Custom lifecycle messages use Resend's HTTPS API separately. Configure the Edge Function sender:
- RESEND_API_KEY: a sending-only key for the verified domain (never put it in source or chat).
- ACCOUNT_MAIL_FROM: use the sender for your verified sending domain. Existing RESEND_FROM_EMAIL and RESEND_FROM settings are also supported. The default sender is security@badgalnurkan.com when the apex domain is verified in Resend.
Supabase's built-in service and publishable keys are resolved only inside the Edge runtime.
GET /functions/v1/account-security reports the configured delivery channel. `transactionalMailReady: true` and `delivery: "resend"` select the action-specific subject and code or deletion link. The compatibility channel (`supabase-auth`) uses the project’s existing sign-in template to carry an action proof. The discarded PKCE verifier prevents that link from establishing an application session. Health checks send no email. A real mailbox check additionally requires a designated test account.

Supabase Dashboard > Authentication > URL Configuration:
- Site URL: https://badgalnurkan.com
- Redirect URLs: https://badgalnurkan.com/, https://www.badgalnurkan.com/ and required legacy callbacks.
Authentication settings should require email confirmation and secure email changes (confirmation to both old and new address); the existing connector cannot read or edit these Auth settings. Secure password change may require fresh sign-in/nonce depending on the Auth configuration. An owner should verify delivery, SPF/DKIM/DMARC and these settings in the dashboard. SMTP being configured alone does not populate RESEND_API_KEY in Edge Functions.

## Behavior
Existing accounts receive a 90-day password rollout window from the migration timestamp. Future real password changes update the server timestamp through an Auth trigger. Google-only accounts without an app password are exempt. Restrictive RLS requires an active account, a current password where applicable, and an existing Auth session. Deactivation and deletion revoke sessions.
Codes: 6 digits, 10 minutes, 5 attempts, 60-second resend delay, 5 requests/hour. One-use deletion links: 256-bit fragment token, 30 minutes. GET never mutates the account. Only explicit reason + confirmation schedules 30-day deletion. Reactivation requires sign-in and a new email code before the server deadline.

## Verification limits
SQL transaction tests use generated example.invalid fixtures and roll back. No real email was sent. Physical iPhone Safari and real Google/SMTP delivery require owner testing. CI runs request handler tests, existing regressions, the static build and Chromium/WebKit mobile layout checks. These are not a substitute for testing the owner's real inbox.

Verified public Auth settings during CI: emailAutoconfirm=false, email provider enabled, Google provider enabled. Email ownership confirmation is required. Secure-email-change and SMTP credentials are not exposed by the public settings endpoint. Live lifecycle health: mailReady=false; add/check both Edge secrets before relying on deactivation/deletion delivery.
