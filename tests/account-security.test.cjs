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


test('QA Access origin is allowed through the account-security preflight; other origins remain rejected',async()=>{
 const {createHandler}=await core;
 const handler=createHandler({env:()=>''});
 const preflight=(origin)=>handler(new Request('https://project.example.invalid/functions/v1/account-security',{
  method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}
 }));
 const qa=await preflight('https://qa.badgalnurkan.com');
 assert.equal(qa.status,204);
 assert.equal(qa.headers.get('Access-Control-Allow-Origin'),'https://qa.badgalnurkan.com');
 const blocked=await preflight('https://other.example.invalid');
 assert.equal(blocked.status,403);
 assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
});
