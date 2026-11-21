'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const qa='lvomrcqytfygcmguojcj';
const prod='flcfqwndqfmbritaywfb';
const paths=['index.html','account-close.js','account-close.html','vercel.json','demo.html','deneme.html','deneme_final.html'];
test('QA deployable files never reference production Supabase',()=>{
  for(const path of paths){const s=fs.readFileSync(path,'utf8');assert.ok(s.includes(qa),path+' must use QA');assert.ok(!s.includes(prod),path+' references production');assert.ok(!s.includes('sb_publishable_4QTEEc6tSYV2QtNhmeP6Iw_B3sM6dtm'),path+' references production public key');}
});
test('QA CSP and security redirects remain scoped correctly',()=>{
  const c=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const csp=c.headers[0].headers.find(h=>h.key==='Content-Security-Policy')?.value;
  assert.ok(csp?.includes('https://'+qa+'.supabase.co'));
  assert.ok(!csp?.includes(prod));
  const blocked=['/deneme.html','/deneme_final.html','/demo.html','/supabase/:path*','/tests/:path*'];
  for(const path of blocked)assert.ok(c.redirects.some(x=>x.source===path&&x.destination==='/'));
});
