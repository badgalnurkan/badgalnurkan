## What changed and why?

<!-- Briefly describe business goal and architectural reason. -->

## Production impact

- [ ] QA and production endpoint/CSP/redirect values have been reviewed.
- [ ] No service keys, credentials, OTP codes or customer data added.
- [ ] Authentication, account states and data migrations evaluated.
- [ ] Privacy, accessibility and mobile behavior considered.

## Test evidence

- [ ] `release-gate` passed (required for merge after branch protection is enabled).
- [ ] Manual QA integration tests passed where applicable.
- [ ] Three-account isolation tested if Auth/RLS/data flow changed.
- [ ] Failure, timeout and retry scenarios covered.
- [ ] Unknown or blocked checks documented (do not mark as passed).

## Release control

- [ ] Known risks described and accepted.
- [ ] Rollback commit/deployment identified.
- [ ] Database restore or reverse migration plan reviewed when applicable.
- [ ] Explicit go/no-go approval recorded before production promotion.
