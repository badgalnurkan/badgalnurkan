# Release policy — Improvin’ Your Day

This is a proposed release policy. It is **not enforced** until the `main` branch protection is enabled by a repository administrator.

## Environments

- Production: `main` -> Vercel `badgalnurkan` -> `flcfqwndqfmbritaywfb` (production Supabase).
- QA: `qa-cloudflare` -> Vercel `iydu-cloudflare-qa` -> `lvomrcqytfygcmguojcj` (QA Supabase) through Cloudflare Access.
- Never merge QA runtime-specific connection strings, test user records, redirect URLs, or CORS allowlists into production.

## Blocking rules

1. All production changes go through a pull request; no direct pushes to `main`.
2. The `release-gate` status check must pass on every PR targeting `main`. It runs existing unit tests, JavaScript syntax checks and checks production/QA environment separation.
3. Critical changes (Auth, account lifecycle, RLS, migrations, email, DNS, Cloudflare, OAuth, session, notifications, data retention) require separate QA integration tests and explicit release approval. Passing unit tests **alone** does not authorize production deployment.
4. If the QA mail service, OAuth provider or user recovery path is not ready, mark it blocked and do not describe it as passed.
5. Record test commands, results, changed projects, known risks, rollback target, and impact on existing users.
6. Keep credentials and actual OTP codes out of issues, test fixtures, CI logs and commits.

## GitHub admin setup

At Settings -> Branches -> Add branch protection rule for `main`:
- Require a pull request before merging;
- Require status checks to pass: `release-gate` (select the exact job context after a successful check exists);
- Block force pushes and branch deletion;
- Avoid requiring an external approval while there is only one authorized reviewer (this can lock the repo).
- Review exemptions/bypass permissions explicitly; if feasible require rules to apply to admins.

Verify an intentionally failing PR cannot merge before relying on the protection. Always retain a documented emergency rollback path.

## Staged release and rollback

- QA readiness: static checks, browser checks, three-account isolation, two-step Cloudflare access, Supabase Auth, password recovery and lifecycle tests.
- Back up and verify restore procedure before production database migrations; Vercel rollback alone **cannot** reverse database changes.
- After approval, deploy with a known commit and smoke-test account login, read/write, logout, password recovery and redirect paths. If critical checks fail, stop and revert application release; database rollbacks need a separate safe recovery plan.
- For availability, log failures and inspect critical actions under representative concurrency; do not claim a traffic capacity without a real load test.
- Use only free-tier services unless a separate explicit authorization is given.
