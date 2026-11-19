# Supabase Confirm sign up template — required release dependency

## Resend/Supabase Free-only implementation checklist

A complete, project-specific setup and release-gate checklist is maintained in
[`supabase/TRANSACTIONAL_EMAIL_RELEASE.md`](../TRANSACTIONAL_EMAIL_RELEASE.md).
The domain already has Resend-related DNS records in Vercel; confirm the
**Verified** status in Resend before changing any existing DNS records.
Resend SMTP credentials and Edge Function secrets must be entered only through
their provider dashboards. Never commit or send an API key in chat.


This app has a six-digit signup code flow using `POST /auth/v1/verify` with `type: "email"`. A pending Auth user record is created by Supabase at sign-up, but no app data or login is activated before verification.

**Manual test-project setup, then controlled production configuration:**
1. Supabase Dashboard → Authentication → Providers → Email: ensure **Confirm email** is enabled.
2. Authentication → Email Templates → **Confirm sign up**: use the content in `confirm-signup-otp.html`. It includes the Supabase template variable `{{ .Token }}`, which emits the six-digit OTP.
3. Test new registration with a disposable test inbox: code valid → verify; invalid/expired → rejected; repeat request → rate limited; existing email → no duplicate.
4. Verify Google OAuth logins remain intact and the callback flow still works.
5. Do not publish the new signup code form before the production email template is configured and tested. The fallback confirmation link can only be used if that is a deliberately supported product flow.

Authoritative docs: https://supabase.com/docs/guides/auth/auth-email-templates

No service-role key, SMTP password, or existing real user record should be edited in this workflow.
