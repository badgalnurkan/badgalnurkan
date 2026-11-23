'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const html = read('index.html');
const PUBLIC_PAGES = ['index.html', 'privacy.html', 'kvkk.html', 'terms.html', 'cookies.html', 'account-close.html', 'google71b0ad28b2232354.html'];
const PUBLIC_ASSETS = ['account-security.js', 'account-security.css', 'recovery-browser.js', 'account-close.js'];

function redirected(pathname) {
  return vercel.redirects.some(({ source }) => {
    if (source.endsWith('/:path*')) {
      const base = source.slice(0, -'/:path*'.length);
      return pathname === base || pathname.startsWith(base + '/');
    }
    return pathname === source;
  });
}

function header(key) {
  const rule = vercel.headers.find(entry => entry.source === '/(.*)');
  return rule?.headers.find(entry => entry.key.toLowerCase() === key.toLowerCase())?.value || '';
}

test('every response carries anti-framing, MIME and content security headers', () => {
  assert.equal(header('X-Frame-Options'), 'DENY');
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
  const csp = header('Content-Security-Policy');
  for (const directive of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-eval/);
  const supabase = html.match(/const SUPABASE_URL='(https:\/\/[a-z0-9]+\.supabase\.co)'/)?.[1];
  assert.ok(supabase, 'SUPABASE_URL must be found');
  const connect = csp.split(';').map(part => part.trim()).find(part => part.startsWith('connect-src '));
  assert.ok(connect?.split(/\s+/).includes(supabase), 'connect-src must allow ' + supabase);
});

test('demo copies and development files are not served beside production', () => {
  for (const pathname of ['/deneme.html', '/deneme_final.html', '/demo.html', '/patch9.py', '/AGENTS.md', '/VALIDATION.md',
    '/tests/review.html', '/supabase/functions/account-security/handler.mjs', '/database/account-security-rls-verification.sql',
    '/docs/account-security-setup.md', '/scripts/build-preview.py', '/.github/workflows/report-unlock-hotfix.yml']) {
    assert.ok(redirected(pathname), pathname);
  }
  assert.ok(!redirected('/'));
  for (const name of [...PUBLIC_PAGES, ...PUBLIC_ASSETS]) assert.ok(!redirected('/' + name), name);
});

test('every root HTML page is either a production page or redirected', () => {
  for (const name of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
    assert.ok(PUBLIC_PAGES.includes(name) || redirected('/' + name), name + ' would be served on the production origin');
  }
});

test('saved usernames reach inline handlers only through data attributes', () => {
  assert.doesNotMatch(html, /\('\$\{esc\(/);
  assert.doesNotMatch(html, /useAccount\('/);
  assert.match(html, /data-user="\$\{esc\(k\)\}" onclick="useAccount\(this\.dataset\.user\)"/);
});

test('journal lists render only date-keyed entry objects', () => {
  const lists = html.split('Object.entries(A.journal||{})').length - 1;
  const filtered = html.split("Object.entries(A.journal||{}).filter(([k,v])=>/^\\d{4}-\\d{2}-\\d{2}$/.test(k)&&v&&typeof v==='object')").length - 1;
  assert.ok(lists >= 2);
  assert.equal(filtered, 2, 'both rendered journal lists validate keys and entry objects');
});
