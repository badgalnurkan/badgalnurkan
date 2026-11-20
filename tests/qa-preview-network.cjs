// Run against this release's protected QA alias. An optional private file can
// contain a Vercel Share URL for this alias. Its value is never logged.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const origin = 'https://badgalnurkan-git-qa-browser-otp-e2e-20261120-5044.vercel.app';
const qaHost = 'lvomrcqytfygcmguojcj.supabase.co';
const packageRun = process.env.IYD_QA_PACKAGE_MODE === '1';
const root = path.resolve(__dirname, '..');
const assets = [
  'index.html', 'account-close.html', 'account-close.js', 'account-security.js',
  'browser-verification.js', 'email-change-otp.js', 'cross-device-sync.js',
  'device-push.js', 'push-sw.js', 'manifest.webmanifest'
];
const packageFiles = new Set([...assets, 'account-security.css', 'recovery-browser.js',
  'app-icon.svg', 'cookies.html', 'terms.html', 'privacy.html', 'kvkk.html']);
const previewToolbar = /<script async data-explicit-opt-in="true" data-deployment-id="dpl_[a-zA-Z0-9]+" src="https:\/\/vercel\.live\/_next-live\/feedback\/feedback\.js"><\/script>$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function verify() {
  const entry = new URL(process.env.IYD_QA_ACCESS_FILE
    ? fs.readFileSync(process.env.IYD_QA_ACCESS_FILE, 'utf8').trim()
    : origin);
  assert.equal(entry.origin, origin, 'Expected the fixed QA alias');
  const browser = await chromium.launch({ executablePath: process.env.IYD_CHROMIUM || undefined });
  try {
    const context = await browser.newContext({ locale: 'en-US' });
    const forbidden = new Set();
    const readRoutes = new Set();
    const errors = [];
    await context.route('**/*', route => {
      const req = route.request();
      const url = new URL(req.url());
      const host = url.hostname;
      if (packageRun && url.origin === origin) {
        const file = url.pathname.slice(1) || 'index.html';
        if (req.method() !== 'GET' || !packageFiles.has(file)) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ path: path.join(root, file) });
      }
      if (host.endsWith('.supabase.co')) {
        if (host !== qaHost || !['GET', 'HEAD', 'OPTIONS'].includes(req.method())) {
          forbidden.add(host + ' ' + req.method());
          return route.abort();
        }
        readRoutes.add(new URL(req.url()).pathname);
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.name));
    page.on('websocket', socket => {
      const host = new URL(socket.url()).hostname;
      if (host.endsWith('.supabase.co') && host !== qaHost) forbidden.add(host);
    });
    // Strip all URL parameters from failures, including the initial access link.
    try {
      await page.goto(entry.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      throw Error('QA preview authentication or initial navigation failed');
    }
    assert.equal(new URL(page.url()).origin, origin, 'Preview access required');
    await page.locator('#welcome-continue').waitFor();
    const dismiss = page.locator('#storage-notice button');
    if (await dismiss.isVisible()) await dismiss.click();
    await page.locator('#welcome-continue').click();
    await page.locator('button[onclick*="forgot"]').click();
    await page.locator('#forgot-reset-submit').waitFor();
    await page.locator('a[onclick*="login"]').click();
    await page.locator('button[onclick*="setup"]').click();
    await page.locator('#register-submit').waitFor();

    const observed = await page.evaluate(async host => {
      const key = typeof SUPABASE_KEY === 'string' ? SUPABASE_KEY : '';
      const headers = { apikey: key };
      const site = 'https://' + host;
      const auth = await fetch(site + '/auth/v1/settings', { headers });
      const push = await fetch(site + '/functions/v1/device-push?key=1', { headers });
      const settings = await auth.json();
      const info = await push.json();
      return {
        authStatus: auth.status, emailEnabled: settings.external?.email,
        googleEnabled: settings.external?.google, pushStatus: push.status,
        validPublicKey: /^[A-Za-z0-9_-]{87}$/.test(info.publicKey || '')
      };
    }, qaHost);
    assert.equal(observed.authStatus, 200);
    assert.equal(observed.emailEnabled, true);
    assert.equal(observed.pushStatus, 200);
    assert.equal(observed.validPublicKey, true);
    await page.goto(origin + '/account-close.html');
    await page.waitForFunction(() => /missing|geçersiz/i.test(document.querySelector('#status')?.textContent || ''));
    assert.equal(await page.locator('#reason-step').isVisible(), false);
    for (const file of (packageRun ? [] : assets)) {
      const response = await context.request.get(origin + '/' + (file === 'index.html' ? '' : file), { maxRedirects: 0 });
      assert.equal(response.status(), 200, file);
      const bytes = await response.body();
      // Vercel may append its own QA feedback script after the closing HTML.
      const appBytes = file.endsWith('.html') ? Buffer.from(bytes.toString('utf8').replace(previewToolbar, '')) : bytes;
      assert.equal(hash(appBytes), hash(fs.readFileSync(path.join(root, file))), file + ' deployed app hash');
    }
    assert.deepEqual([...forbidden], [], 'Unexpected Supabase destination or write');
    assert.deepEqual(errors, [], 'Application error in the public QA flows');
    assert(readRoutes.has('/auth/v1/settings') && readRoutes.has('/functions/v1/device-push'));
    console.log('QA public screens and read-only Auth / Web Push requests passed. Google enabled: %s.', observed.googleEnabled);
    console.log(packageRun ? 'Browser used the checked-out preview assets.'
      : assets.length + ' hosted application hashes matched the checkout.');
  } finally {
    await browser.close();
  }
}

verify().catch(error => {
  // Playwright diagnostics can contain navigation URLs. Never emit query strings.
  const message = String(error.message).replace(/https?:\/\/[^\s"']+/g, '[URL]');
  console.error(message);
  process.exitCode = 1;
});
