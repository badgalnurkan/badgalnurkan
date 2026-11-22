'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {createPreviewServer}=require('../scripts/local-preview.cjs');
let server,base;
before(async()=>{
 server=createPreviewServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))});
test('homepage and essential assets are available',async()=>{
 const html=await fetch(base+'/');
 assert.equal(html.status,200);
 assert.match(html.headers.get('content-type'),/text\/html/);
 assert.match(await html.text(),/Improvin/i);
 for(const pathname of ['/index.html','/account-security.js','/account-security.css','/recovery-browser.js','/account-close.html','/privacy.html','/terms.html']){
  assert.equal((await fetch(base+pathname)).status,200,pathname);
 }
});
test('no directory listings, hidden files or repository sources are exposed',async()=>{
 for(const pathname of ['/tests/','/tests/qa-sync-safety.test.cjs','/.git/config','/.env','/.github/workflows/qa-isolation.yml','/supabase/migrations/test.sql','/docs/LOCAL_PREVIEW.md','/package.json','/README.md','/deneme.html','/scripts/local-preview.cjs','/%2e%2e/README.md']){
  const response=await fetch(base+pathname,{redirect:'manual'});
  assert.equal(response.status,404,pathname);
 }
});
test('QA CSP and no-store headers are applied',async()=>{
 const response=await fetch(base+'/');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 assert.match(response.headers.get('content-security-policy')||'',/lvomrcqytfygcmguojcj\.supabase\.co/);
 assert.doesNotMatch(response.headers.get('content-security-policy')||'',/flcfqwndqfmbritaywfb/);
});
test('GET and HEAD work but write requests do not',async()=>{
 const head=await fetch(base+'/',{method:'HEAD'});
 assert.equal(head.status,200);
 assert.equal(await head.text(),'');
 const post=await fetch(base+'/',{method:'POST'});
 assert.equal(post.status,405);
 assert.equal(post.headers.get('allow'),'GET, HEAD');
});
test('unrecognized host is rejected to reduce DNS rebinding exposure',async()=>{
 const response=await fetch(base+'/',{headers:{Host:'untrusted.example.invalid'}});
 assert.equal(response.status,403);
});
