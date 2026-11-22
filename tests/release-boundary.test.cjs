'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const production = 'https://flcfqwndqfmbritaywfb.supabase.co';
const qa = 'https://lvomrcqytfygcmguojcj.supabase.co';
const runtimeFiles = ['index.html', 'account-close.js', 'account-close.html', 'vercel.json'];
const read = path => fs.readFileSync(path, 'utf8');

test('production entrypoints never connect to the isolated QA Supabase project', () => {
  for (const path of runtimeFiles) {
    const source = read(path);
    assert.ok(source.includes(production), path + ': production endpoint missing');
    assert.ok(!source.includes(qa), path + ': QA endpoint must not ship to production');
    assert.ok(!source.includes('https://qa.badgalnurkan.com'), path + ': QA URL must not ship in production runtime');
  }
});

test('browser entrypoints do not contain Supabase secret/service-role keys', () => {
  for (const path of runtimeFiles) {
    const source = read(path);
    assert.ok(!source.includes('sb_secret_'), path + ': secret key accidentally exposed');
    assert.ok(!/SUPABASE_SERVICE_ROLE_KEY\s*=/.test(source), path + ': service role exposed');
  }
});

test('production Content Security Policy targets the production API only', () => {
  const config = JSON.parse(read('vercel.json'));
  const policies = (config.headers || []).flatMap(rule => rule.headers || [])
    .filter(header => header.key.toLowerCase() === 'content-security-policy');
  assert.ok(policies.length > 0, 'missing CSP');
  for (const policy of policies) {
    assert.ok(policy.value.includes(production), 'production API missing from CSP');
    assert.ok(!policy.value.includes(qa), 'QA API must not be in production CSP');
  }
});

test('production account-security handler does not whitelist the private QA hostname', () => {
  const handler = read('supabase/functions/account-security/handler.mjs');
  assert.ok(!handler.includes('https://qa.badgalnurkan.com'),
    'QA-specific origin is not part of the production account-security handler');
});
