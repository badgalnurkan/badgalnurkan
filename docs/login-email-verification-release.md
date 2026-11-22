# Per-account login email verification

Every new Supabase Auth session must prove its own verified account email before private application data loads. The six-digit code expires after ten minutes, permits five incorrect attempts and is limited to five requests per hour with a sixty-second resend interval. A code is bound to both the user and Auth session. Resending activates a new challenge only after Resend accepts the email. A failed candidate does not invalidate an older delivered code. No raw code or secret key is returned to the client or recorded in source.

The Edge handler validates the bearer with Supabase Auth, verifies its user/session claims against the database, and derives the recipient from the account. Its service RPC is executable only by service_role. Direct table reads/writes and the existing load/save paths remain behind the existing RLS guard extended with session verification. The feature does not replace Supabase native MFA.

## Release order

1. Apply the additive foundation with production enforcement disabled. Deploy the browser-verification Edge function. Authentication is performed inside the handler with /auth/v1/user; gateway verify_jwt is disabled to support both legacy and asymmetric Auth signing keys.
2. Pass Node, database and three-engine browser checks. Publish the exact frontend and verify its static assets.
3. Activate only when the reviewed frontend is live and the sender is ready, then immediately test real login-code sending with an owner-controlled account. Use supabase/rollouts/enable-login-email-verification.sql once; it preserves already open Auth sessions. New sign-ins receive their own challenge. Roll back enforcement if the acceptance test fails.
4. Verify received code, original-browser completion, wrong-code and resend behavior. Existing user profiles and passwords are never rewritten by this rollout.

## Rollback

If the login sender fails during rollout, an administrator can restore the previous access behavior with:

```sql
UPDATE iydu_private.browser_verification_config SET enabled=false WHERE singleton;
```

This leaves application data intact and preserves the separately enforced account lifecycle restrictions. Diagnose the actual provider/database failure before re-enabling. Do not drop challenge tables or alter real user records.

Cloudflare QA Access stays private. This release does not change Cloudflare policies or expose the QA site.
