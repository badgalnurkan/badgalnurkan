# VS Code local QA preview

This is a read-only, static **QA** preview, not production.

1. If the old http-server is running, stop it with **Ctrl+C**.
2. In VS Code PowerShell run: \`npm.cmd run dev:local\`
3. Open http://127.0.0.1:4173/ — Ctrl+C stops it.

This built-in Node.js server binds only to 127.0.0.1, restricts the Host header, serves an explicit list of public files, denies directory listings, blocks access to repo internals, and mirrors QA vercel.json security headers. No additional packages, credentials or deployment are needed.

**Do not enter production credentials in local preview.** The QA frontend points to the separate Supabase QA project. Its browser verification service does **not** allow localhost as an Origin, so login/OTP may fail. Real multi-browser account tests belong on the protected QA domain with dedicated test users.

## Local-versus-production comparison

The inline CSS and basic menu-transition functions were identical in the QA and main source inspected on 2026-11-22. To evaluate perceived differences, use the same browser, viewport, and motion preferences. Record the unauthenticated welcome transition in DevTools > Performance, comparing main-thread work, frames and layout shifts. Repeat at least five runs per environment. Do not upload recordings containing session tokens or real account information.

For a coarse page-load comparison, DevTools Console can show:
\`\`\`js
const n=performance.getEntriesByType('navigation')[0];
console.table({
 responseMs:Math.round(n.responseEnd-n.requestStart),
 domReadyMs:Math.round(n.domContentLoadedEventEnd),
 loadedMs:Math.round(n.loadEventEnd)
});
\`\`\`
These navigation numbers do not measure the smoothness of individual swipe/menu animations.

References:
- https://developer.mozilla.org/en-US/docs/Web/API/Performance_API
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceObserver
- https://nodejs.org/docs/latest-v22.x/api/http.html
