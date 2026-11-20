'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const url=require('node:url'),path=require('node:path');
const uri=url.pathToFileURL(path.join(__dirname,'../supabase/functions/browser-verification/handler.mjs')).href;
const UID='ab000000-0000-4000-8000-000000000011';
const SID='ab100000-0000-4000-8000-000000000001';
const CID='ab200000-0000-4000-8000-000000000001';
const ORIGIN='https://badgalnurkan.com';
const env=key=>({
 SUPABASE_URL:'https://qa.supabase.invalid',
 SUPABASE_ANON_KEY:'public-test-only',
 SUPABASE_SERVICE_ROLE_KEY:'service-test-only',
 RESEND_API_KEY:'mock-mail-only',
 ACCOUNT_MAIL_FROM:"Improvin' Your Day <security@example.invalid>"
})[key]||'';
const jwt=claims=>{
 const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
 return b64({alg:'HS256',typ:'JWT'})+'.'+b64({
  sub:UID,session_id:SID,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,...claims
 })+'.fake-signature';
};
const fakeCrypto={
 randomUUID:()=>CID,
 getRandomValues(array){array[0]=123456;return array},
 subtle:webcrypto.subtle
};
function request(action,token=jwt(),body={}) {
 return new Request('https://qa.supabase.invalid/functions/v1/browser-verification',{
  method:'POST',headers:{
   origin:ORIGIN,authorization:'Bearer '+token,'content-type':'application/json'
  },body:JSON.stringify({action,...body})
 });
}
function fixture(options={}){
 let verified=!!options.verified,requests=0,emails=0,cancels=0,attempts=0;
 let challenge=null;
 const fetchImpl=async(resource,config)=>{
  const pathname=new URL(resource).pathname;
  if(pathname==='/auth/v1/user'){
   const token=config.headers.Authorization.slice(7);
   if(options.invalidUser)return Response.json({error:'invalid'}, {status:401});
   const id=options.userId||UID;
   return Response.json({id,email:'owner@example.invalid'});
  }
  if(pathname==='/rest/v1/rpc/iydu_browser_service'){
   const body=JSON.parse(config.body);
   assert.equal(config.headers.Authorization,'Bearer service-test-only');
   assert.equal(body.p_uid,UID);
   assert.equal(body.p_sid,SID);
   if(options.expectOauthMethod)assert.equal(body.p_fields.using_oauth,true,'OAuth JWT must be classified server-side');
   if(options.expectPasswordMethod)assert.equal(body.p_fields.using_oauth,false,'Password JWT must not inherit OAuth timeout');
   if(options.badServerSession)return Response.json({error:'UNAUTHORIZED'});
   if(body.p_action==='status')return Response.json({ok:true,verified});
   if(body.p_action==='request'){
    requests++;
    challenge=body.p_fields;
    return Response.json({ok:true,id:CID,email:'owner@example.invalid'});
   }
   if(body.p_action==='cancel'){
    cancels++;return Response.json({ok:true});
   }
   if(body.p_action==='confirm'){
    attempts++;
    const correct=challenge&&body.p_fields.id===CID&&
     body.p_fields.hash===challenge.hash&&!verified;
    if(correct)verified=true;
    return Response.json(correct?{ok:true,verified:true}:{error:'INVALID_CHALLENGE'});
   }
   throw Error('Unexpected RPC action '+body.p_action);
  }
  if(resource==='https://api.resend.com/emails'){
   emails++;
   const body=JSON.parse(config.body);
   assert.deepEqual(body.to,['owner@example.invalid']);
   assert.match(body.text,/123456/);
   assert.equal(config.headers['Idempotency-Key'],'browser-'+CID);
   return Response.json(options.mailFailure?{error:'mail'}:{id:'mock-mail-id'},
     {status:options.mailFailure?503:200});
  }
  throw Error('Unexpected request '+resource);
 };
 return {fetchImpl,get counts(){return{verified,requests,emails,cancels,attempts}}};
}
test('unverified browser gets a code; one verified session can enter',async()=>{
 const {createHandler}=await import(uri);
 const fixtureState=fixture();
 const handler=createHandler({env,fetchImpl:fixtureState.fetchImpl,webCrypto:fakeCrypto});
 const initial=await handler(request('status'));
 assert.deepEqual(await initial.json(),{ok:true,verified:false});
 const sent=await handler(request('request'));
 assert.equal(sent.status,200);
 const body=await sent.json();
 assert.deepEqual(body,{ok:true,id:CID,expiresIn:600});
 assert.equal(JSON.stringify(body).includes('owner@example.invalid'),false);
 const wrong=await handler(request('confirm',jwt(),{id:CID,code:'654321'}));
 assert.equal(wrong.status,400);
 assert.deepEqual(await wrong.json(),{code:'INVALID_CHALLENGE'});
 const correct=await handler(request('confirm',jwt(),{id:CID,code:'123456'}));
 assert.equal(correct.status,200);
 assert.deepEqual(await correct.json(),{ok:true,verified:true});
 assert.deepEqual(await (await handler(request('status'))).json(),{ok:true,verified:true});
 const replay=await handler(request('confirm',jwt(),{id:CID,code:'123456'}));
 assert.equal(replay.status,400);
 assert.deepEqual(fixtureState.counts,{verified:true,requests:1,emails:1,cancels:0,attempts:3});
});
test('failed Resend delivery cancels the challenge and does not approve',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture({mailFailure:true});
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const sent=await handler(request('request'));
 assert.equal(sent.status,502);
 assert.deepEqual(await sent.json(),{code:'MAIL_SEND_FAILED'});
 assert.equal(f.counts.cancels,1);
 assert.equal(f.counts.verified,false);
});
test('a token for another Auth identity cannot approve this user',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture();
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const result=await handler(request('request',jwt({sub:'ab000000-0000-4000-8000-000000000022'})));
 assert.equal(result.status,401);
 assert.equal(f.counts.requests,0);
 assert.equal(f.counts.emails,0);
});
test('server rejects a nonexistent or mismatched Auth session',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture({badServerSession:true});
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const result=await handler(request('request'));
 assert.equal(result.status,401);
 assert.equal(f.counts.emails,0);
});
test('unauthenticated and unknown origins never trigger an email',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture();
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const badOrigin=new Request('https://qa.supabase.invalid/functions/v1/browser-verification',{
  method:'POST',headers:{origin:'https://bad.example.invalid','content-type':'application/json'},
  body:'{"action":"request"}'
 });
 const result=await handler(badOrigin);
 assert.equal(result.status,403);
 const anonymous=new Request('https://qa.supabase.invalid/functions/v1/browser-verification',{
  method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},
  body:'{"action":"request"}'
 });
 assert.equal((await handler(anonymous)).status,401);
 assert.equal(f.counts.emails,0);
});
test('oversized request body fails closed before parsing or email',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture();
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const result=await handler(request('request',jwt(),{padding:'x'.repeat(5000)}));
 assert.equal(result.status,413);
 assert.equal(f.counts.emails,0);
});
test('email transport availability cannot be guessed from the client',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture();
 const handler=createHandler({env:key=>key==='RESEND_API_KEY'?'':env(key),fetchImpl:f.fetchImpl,
  webCrypto:fakeCrypto});
 assert.equal((await handler(request('request'))).status,503);
 assert.equal((await handler(request('status'))).status,200);
 assert.equal(f.counts.emails,0);
});
test('OTP generation rejects out-of-range randomness without modulo bias',async()=>{
 const {generateEmailCode}=await import(uri);
 const calls=[4294000000,42];
 const cryptoStub={getRandomValues(a){a[0]=calls.shift();return a}};
 assert.equal(generateEmailCode(cryptoStub),'000042');
 assert.equal(calls.length,0);
});

test('signed OAuth AMR is forwarded to the time-limited database gate',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture({expectOauthMethod:true});
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const token=jwt({amr:[{method:'oauth',timestamp:Math.floor(Date.now()/1000)-100}]});
 const result=await handler(request('status',token));
 assert.equal(result.status,200);
 assert.equal((await result.json()).verified,false);
});
test('password-only login is not misclassified as a Google session',async()=>{
 const {createHandler}=await import(uri);
 const f=fixture({expectPasswordMethod:true});
 const handler=createHandler({env,fetchImpl:f.fetchImpl,webCrypto:fakeCrypto});
 const token=jwt({amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-100}]});
 const result=await handler(request('status',token));
 assert.equal(result.status,200);
});

test('explicit logout revokes only this browser and clears the local session', async () => {
 const fs=require('node:fs'),vm=require('node:vm'),p=require('node:path');
 const source=fs.readFileSync(p.join(__dirname,'../index.html'),'utf8');
 const from=source.indexOf('function invalidateCloudSession(){');
 const end=source.indexOf('async function chg(',from);
 assert.ok(from>0&&end>from,'Auth logout helpers are present');
 const block=source.slice(from,end);
 let calls=[],cleared=0,stopped=0;
 const context={
  pendingDeleteUid:'unused', A:{authUid:UID}, loginDat:{u:'before',p:'private'},
  SUPABASE_URL:'https://qa.supabase.invalid', SUPABASE_KEY:'test-public-key',
  sbSession:()=>({access_token:'test-access-token'}),
  fetch:(url,options)=>{calls.push({url,options});return Promise.resolve({ok:true})},
  sbClear:()=>{cleared++},stopTimers:()=>{stopped++},goTo(){},
  Promise
 };
 vm.createContext(context);
 vm.runInContext(block+'\nthis.signOut=goLogin;',context);
 context.signOut();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://qa.supabase.invalid/auth/v1/logout?scope=local');
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Authorization,'Bearer test-access-token');
 assert.equal(calls[0].options.keepalive,true);
 assert.equal(cleared,1);
 assert.equal(stopped,1);
 assert.equal(context.A,null);
 assert.equal(context.loginDat.p,'');
});
test('explicit logout clears local token even when remote session revoke fails',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),p=require('node:path');
 const source=fs.readFileSync(p.join(__dirname,'../index.html'),'utf8');
 const from=source.indexOf('function invalidateCloudSession(){');
 const end=source.indexOf('async function chg(',from);
 let cleared=false;
 const context={
  pendingDeleteUid:null,A:{},loginDat:{},
  SUPABASE_URL:'https://qa.supabase.invalid',SUPABASE_KEY:'public',
  sbSession:()=>({access_token:'test-access-token'}),
  fetch:()=>{throw Error('offline')},
  sbClear:()=>{cleared=true},stopTimers(){},goTo(){},Promise
 };
 vm.createContext(context);
 vm.runInContext(source.slice(from,end)+'\nthis.signOut=goLogin;',context);
 context.signOut();
 assert.equal(cleared,true);
 assert.equal(context.A,null);
});
