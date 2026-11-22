'use strict';
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const {mockSupabaseOrigin}=require('./mock-supabase-origin.cjs');

// Distinct Playwright contexts model an email client opening in another browser.
module.exports = async function verifyRecovery(browser, engine) {
  const origin = 'http://127.0.0.1:4173';
  const mockedBackend = mockSupabaseOrigin();
  const address = 'reset-owner@example.invalid';
  for (const external of [false, true]) {
    const original = await browser.newContext();
    const other = await browser.newContext();
    const code = randomUUID();
    let callback, challenge, exchanges = 0;
    try {
      for (const context of [original, other]) {
        await context.addInitScript(() => localStorage.setItem('iydu.storage-notice.v1', 'test'));
        await context.route(mockedBackend+'/**', async route => {
          const request = route.request(), url = new URL(request.url());
          if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'POST,OPTIONS'} });
          const body = request.postDataJSON();
          let result;
          if (url.pathname === '/auth/v1/recover') {
            assert.equal(body.email,address);
            assert.equal(body.code_challenge_method,'s256');
            assert.match(body.code_challenge,/^[a-zA-Z0-9_-]{43}$/);
            assert.equal(body.code_verifier,undefined);
            challenge = body.code_challenge;
            callback = new URL(url.searchParams.get('redirect_to'));
            assert.equal(callback.origin,origin);
            callback.searchParams.set('code',code);
            result = {};
          } else if (url.pathname === '/auth/v1/token') {
            assert.equal(context,original);
            assert.equal(url.searchParams.get('grant_type'),'pkce');
            assert.equal(body.auth_code,code);
            assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);
            exchanges++;
            result = {access_token:'synthetic-access',refresh_token:'synthetic-refresh',user:{id:'reset-uid',email:address}};
          } else if (url.pathname.endsWith('/iydu_account_status')) {
            result = {user_id:'reset-uid',email:address,state:'active',has_password:true,server_time:new Date().toISOString()};
          } else throw Error('Unexpected request during recovery: '+url.pathname);
          await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)});
        });
      }
      const first = await original.newPage();
      await first.goto(origin);
      await first.locator('#welcome-continue').waitFor();
      await first.evaluate(() => goTo('forgot',''));
      await first.locator('#u').fill(address);
      await first.getByRole('button',{name:'Password reset link',exact:true}).click();
      await first.locator('#recovery-browser-wait').waitFor();
      const target = await (external ? other : original).newPage();
      await target.goto(callback.href);
      if (external) {
        const field = target.locator('#recovery-copy');
        assert.equal(await field.inputValue(),code);
        assert.equal(exchanges,0);
        assert.equal(await target.evaluate(()=>sbSession()),null);
        await first.locator('#recovery-return-code').fill(await field.inputValue());
        await first.getByRole('button',{name:'Continue in this browser',exact:true}).click();
      }
      const active = external ? first : target;
      await active.locator('#security-gate #gate-new').waitFor();
      assert.equal(await active.locator('#gate-old').count(),0);
      assert.equal(exchanges,1);
      assert.equal(await active.locator('.shell').count(),0);
      assert.equal(new URL(target.url()).searchParams.has('code'),false);
    } finally { await original.close(); await other.close(); }
  }
  console.log('PASS '+engine+': password reset stays in original browser in same- and other-browser email flows');
};

