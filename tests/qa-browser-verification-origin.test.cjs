'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const handlerSource=import('../supabase/functions/browser-verification/handler.mjs');
test('QA browser verification preflight permits QA origin, not other origins',async()=>{
 const {createHandler,ORIGINS}=await handlerSource;
 assert.ok(ORIGINS.includes('https://qa.badgalnurkan.com'));
 const fn=createHandler({env:()=>'',webCrypto:webcrypto});
 const options=origin=>fn(new Request('https://test.invalid/functions/v1/browser-verification',{
  method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST'}
 }));
 const approved=await options('https://qa.badgalnurkan.com');
 assert.equal(approved.status,204);
 assert.equal(approved.headers.get('Access-Control-Allow-Origin'),'https://qa.badgalnurkan.com');
 const denied=await options('https://unapproved.example.invalid');
 assert.equal(denied.status,403);
 assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
});
test('preflight only widens QA origin, not auth bypass',async()=>{
 const {createHandler}=await handlerSource;
 const fn=createHandler({env:()=>'',webCrypto:webcrypto});
 const res=await fn(new Request('https://test.invalid/functions/v1/browser-verification',{
  method:'POST',headers:{Origin:'https://qa.badgalnurkan.com','Content-Type':'application/json'},
  body:JSON.stringify({action:'status'})
 }));
 assert.notEqual(res.status,200,'a public POST must not become authenticated');
});
