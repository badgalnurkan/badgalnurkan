'use strict';
const fs=require('node:fs'),path=require('node:path');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const URL_QA='https://lvomrcqytfygcmguojcj.supabase.co';
const PROD_ID='flcfqwndqfmbritaywfb';
test('all entrypoints of QA app point at QA-only Supabase API',()=>{
 for(const name of ['index.html','account-close.js']){
  const file=read(name);
  assert.ok(file.includes(URL_QA),name+' must use QA API');
  assert.equal(file.includes(PROD_ID),false,name+' must never contain production project ID');
  assert.match(file,/sb_publishable_[a-zA-Z0-9_-]+/,name+' public key');
  assert.doesNotMatch(file,/service_role|sb_secret_/i,name+' must never expose secret keys');
 }
});
test('signup and password reset cannot bounce users back to production',()=>{
 const html=read('index.html');
 assert.doesNotMatch(html,/redirect_to.*https:\/\/badgalnurkan\.com/);
 assert.doesNotMatch(html,/encodeURIComponent\('https:\/\/badgalnurkan\.com\/?'\)/);
 assert.match(html,/encodeURIComponent\(location\.origin\+'\/'\)/);
});
test('QA account deletion uses the same QA API and does not mix prod identity',()=>{
 const html=read('account-close.html'),js=read('account-close.js');
 assert.match(html,/account-close\.js/);
 assert.equal(js.includes(PROD_ID),false);
 assert.ok(js.includes(URL_QA));
});
