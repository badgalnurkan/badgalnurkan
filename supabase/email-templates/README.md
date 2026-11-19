# Supabase Auth OTP templates — per-project setup

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
2. Authentication → Email Templates → **Confirm sign up**: use the complete content in `confirm-signup-otp.html`. It includes `{{ .Token }}` and **no** `{{ .ConfirmationURL }}`.
3. Authentication → Email Templates → **Magic Link or OTP**: use the complete content in `magic-link-otp.html`. This is a **different** template used for existing-account sign-in. It must also show `{{ .Token }}`, with **no** `{{ .ConfirmationURL }}`.
4. Authentication → Providers → Email: confirm **Email OTP length = 6**; the template itself does not control the token's length. Use the correct **production** project before release; QA project templates do not transfer automatically.
5. Test new registration with a disposable test inbox: code valid → verify; invalid/expired → rejected; repeat request → rate limited; existing email → no duplicate.
6. Verify Google OAuth logins remain intact and the callback flow still works.
7. Do not publish the new signup code form before the production email template is configured and tested. The fallback confirmation link can only be used if that is a deliberately supported product flow.

Authoritative docs: https://supabase.com/docs/guides/auth/auth-email-templates

No service-role key, SMTP password, or existing real user record should be edited in this workflow.
