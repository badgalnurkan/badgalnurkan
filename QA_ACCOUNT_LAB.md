# QA account lifecycle laboratory (isolated, never merge to production)

**Open the test UI:** https://badgalnurkan-git-qa-account-security-lab-5044.vercel.app/qa-account-lab.html

This is a **Vercel Preview** only, backed exclusively by the separate free Supabase project `lvomrcqytfygcmguojcj`. No production site, domain, user account or production Supabase schema is changed by this branch.

## How to use (real QA accounts only)

1. If Vercel requests it, authenticate with your project-owning Vercel account. Open the preview once **before clicking the emailed permanent deletion link** so the Vercel auth session is available when it opens.
2. Use a disposable email plus alias of a mailbox you own, e.g. `yourname+qa-test@gmail.com`.
3. In **1. Test hesabına giriş**, request a new QA signup code, check inbox, enter the actual six-digit code, verify. The browser holds the session token in `sessionStorage` only.
4. **2. Geçici hesap kapatma**: request a fresh code, retrieve from email, enter and explicitly check the Yes box. Confirm the response includes `state:deactivated` and a deadline of about 30 days. This will clear the browser session.
5. Re-authenticate using the **existing QA account** option (a new email code). In **3. Hesabı yeniden açma**, request a fresh reactivation code and explicitly confirm. Verify the response says active.
6. **4. Kalıcı silme**: with an active QA session request the link, open the email link on this QA Vercel preview, select a reason, optionally provide Other, review, then explicitly confirm Yes. Verify 60-day deadline. Do not use the email link on the live site.

Supabase's account-security handler restricts the Origin to this exact QA Vercel preview URL; other origins return 403. The frontend only contains a **publishable** Supabase key; no service/Resend sending credentials are embedded. The extra QA-origin and QA-link routing code exists **only on branch `qa/account-security-lab`**, not in PR #29 or main.

## What is genuinely tested

- **Production isolation:** live production uses the independent Supabase project `flcfqwndqfmbritaywfb`; QA code always uses `lvomrcqytfygcmguojcj`.
- **Actual hosted UI:** Vercel preview static page fetched with HTTP 200 and source checked. Supabase-hosted Edge HTML was rejected as plaintext by the platform (by design) and is **not** the test URL.
- **QA backend:** Edge Function v5; exact QA preview Origin gave 200 health response and 401 for missing auth; unexpected Origin gave 403. Resend configured and health ready.
- **Actual registration and email:** QA signup OTP email was delivered to Gmail; six-digit code verified against real Supabase Auth and yielded a real session.
- **Actual temporary closure email:** QA request delivered a different six-digit email from `security@badgalnurkan.com`.
- **Local browser exercise:** Chromium Playwright with network **mocked** executed signup, OTP, temporary closure confirmation, reactivation, permanent-deletion reason and confirmation; tested that the frontend only calls QA and has no mobile horizontal overflow (390px). This is not proof of server-side closure confirmation.
- **Remaining release gate:** Real confirmation of temporary closure with the emailed code, reactivation, permanent deletion link, 30/60-day database deadlines and cron storage cleanup. The assistant's direct confirmation call was blocked by the connected tool safety control; run this QA UI manually instead and verify DB read-only afterward.

**Never copy QA credentials/allowlist into production, merge this branch into main, or share one-time codes or API secrets in chat.**

Official docs: https://supabase.com/docs/guides/functions/limits and https://supabase.com/docs/guides/auth/auth-email-templates

## Returning users receive a sign-in LINK instead of six digits?

Supabase Auth uses **two separate email templates**. The signup template `Confirm sign up` was customized already, but subsequent `POST /auth/v1/otp` requests for existing users invoke **Magic Link or OTP**. If that template contains `{{ .ConfirmationURL }}` instead of `{{ .Token }}`, Gmail receives a sign-in link even though the browser expects a six-digit code. This is a **server-side template configuration mismatch**, not a Resend SMTP failure.

**QA-only manual fix:** Open https://supabase.com/dashboard/project/lvomrcqytfygcmguojcj/auth/templates, select **Magic Link or OTP**, set subject `Improvin' Your Day - Giriş Doğrulama Kodu`, and replace its HTML with [supabase/email-templates/magic-link-otp.html](supabase/email-templates/magic-link-otp.html) from this QA branch. Ensure `{{ .Token }}` is present, then Save. Do not change production Auth templates or resend keys.

The browser UI now queries an authenticated, least-data read-only status RPC `public.iydu_qa_account_status()` and enables **temporary/permanent close only while active**, and **reactivation only while deactivated or pending deletion**. This is QA-only. The UI reports that the login email and the later reactivation email are different code issuers: Supabase Auth OTP vs Resend account-security.

**Observed real QA database evidence:** at least one disposable account genuinely entered `deactivated` with ~30 days remaining, and a different disposable account `pending_delete` with ~60 days remaining. Both policies have real database evidence; a full post-template-change **re-login and reactivation** test remains pending. Automated browser state gating was exercised locally with mocked HTTP calls (13 requests; Chromium PASS; 390px overflow 0). Do not claim live reactivation passed based on mocked tests.
