'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const gate=fs.readFileSync(path.join(__dirname,'../browser-verification.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const activation=script.slice(script.indexOf('async function activateCloudUser('),script.indexOf('async function login(){'));
const recoveryStart=script.indexOf('const cloudOwnDrafts='),recoveryEnd=script.indexOf('function cloudSyncNotice(){',recoveryStart);
assert.ok(recoveryStart>=0&&recoveryEnd>recoveryStart);
const outbox=script.slice(recoveryStart,recoveryEnd);
const CID='ab200000-0000-4000-8000-000000000001';
function fixture(options={}){
 let verified=false,session=null,loads=0,entries=0,releaseRequest;
 const deferred=options.deferRequest?new Promise(r=>{releaseRequest=r}):null;
 const calls=[],stored=new Map();
 const elements={'browser-verify-message':{textContent:''},'browser-verify-code':{value:'',focus(){}}};
 const buttons=[{disabled:false},{disabled:false}];
 const user={id:'owner-id',email:options.email||'one@example.invalid',user_metadata:{username:'owner'}};
 const token=()=>['header',Buffer.from(JSON.stringify({sub:user.id,session_id:options.sid||'first-session'})).toString('base64url'),'signature'].join('.');
 const authenticated={user,access_token:token(),refresh_token:'test-only-refresh'};
 const ctx={console,Date,JSON,AbortSignal,atob:s=>Buffer.from(s,'base64').toString(),
  A:null,DB:{accounts:{},lang:'en'},view:'login',pg:'home',msg:'',loginDat:{},
  SUPABASE_URL:'https://test.invalid',SUPABASE_KEY:'public-test-key',
  tr:()=>false,esc:s=>s,renderAppOrAuth(){},openModal(){},closeModal(){},
  playWelcomeTransition(){},document:{getElementById:id=>elements[id]||null,querySelectorAll:()=>buttons},
  sessionStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
  sbSession:()=>session,sbSave:s=>{session=s},sbClear:()=>{session=null},sbRefresh:async()=>false,
  fetch:async(_url,config)=>{
   const body=JSON.parse(config.body);calls.push(body);
   if(body.action==='status')return {ok:true,status:200,json:async()=>({ok:true,verified})};
   if(body.action==='request'){
    if(deferred)await deferred;
    if(options.mailFailure)return {ok:false,status:502,json:async()=>({code:'MAIL_SEND_FAILED'})};
    return {ok:true,status:200,json:async()=>({ok:true,id:CID,expiresIn:600})};
   }
   if(body.action==='confirm'){
    if(body.code!=='123456')return {ok:false,status:400,json:async()=>({code:'INVALID_CHALLENGE'})};
    verified=true;return {ok:true,status:200,json:async()=>({ok:true,verified:true})};
   }
   throw Error('Unexpected action');
  },
  sbPull:async()=>{loads++;return {u:'owner',authUid:user.id}},sbProgressPolicy:async()=>({}),
  norm:x=>({...x}),bindReportCalendar(){},applyServerProgressPolicy(){},deviceAccountCount:()=>0,MAX_DEVICE_ACCOUNTS:3,
  v13ProtectLegacyCollision(){},restorePomodoroState(){},applyTheme(){},save(){},goTo(){entries++}
 };
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(gate,ctx);vm.runInContext(outbox,ctx);vm.runInContext(activation,ctx);
 return {ctx,elements,buttons,calls,authenticated,loads:()=>loads,entries:()=>entries,release:()=>releaseRequest?.()};
}
test('both account emails reach the same verification gate without loading private data',async()=>{
 for(const email of ['one@example.invalid','two@example.invalid']){
  const f=fixture({email});await f.ctx.activateCloudUser(f.authenticated);
  assert.equal(f.loads(),0);assert.equal(f.entries(),0);assert.equal(f.ctx.A,null);
  assert.equal(f.ctx.IYBrowserGate.isPending(),true);
  assert.deepEqual(f.calls.map(x=>x.action),['status','request']);
  assert.ok(f.calls.every(x=>!Object.hasOwn(x,'email')&&!Object.hasOwn(x,'user_id')));
 }
});
test('incorrect code stays outside the app; correct code loads exactly the same owner once',async()=>{
 const f=fixture();await f.ctx.activateCloudUser(f.authenticated);
 f.elements['browser-verify-code'].value='654321';assert.equal(await f.ctx.IYBrowserGate.confirm(),false);
 assert.equal(f.loads(),0);assert.match(f.elements['browser-verify-message'].textContent,/incorrect/i);
 f.elements['browser-verify-code'].value='123456';assert.equal(await f.ctx.IYBrowserGate.confirm(),true);
 assert.equal(f.loads(),1);assert.equal(f.entries(),1);assert.equal(f.ctx.A.authUid,'owner-id');
 assert.equal(f.ctx.IYBrowserGate.isPending(),false);
});
test('provider failure cannot become code-sent success or expose account data',async()=>{
 const f=fixture({mailFailure:true});await f.ctx.activateCloudUser(f.authenticated);
 assert.equal(f.loads(),0);assert.equal(f.entries(),0);
 assert.match(f.elements['browser-verify-message'].textContent,/could not be sent/);
 assert.ok(f.buttons.every(x=>x.disabled===false));
});
test('repeated sends while one is pending send once and sign-out rejects its stale response',async()=>{
 const f=fixture({deferRequest:true});const first=f.ctx.activateCloudUser(f.authenticated);
 while(!f.calls.some(x=>x.action==='request'))await Promise.resolve();
 assert.equal(await f.ctx.IYBrowserGate.request(),false);
 f.ctx.IYBrowserGate.signOut();f.release();await first;
 assert.equal(f.calls.filter(x=>x.action==='request').length,1);
 assert.equal(f.loads(),0);assert.equal(f.ctx.IYBrowserGate.isPending(),false);
 assert.equal(f.elements['browser-verify-message'].textContent,'Requesting your sign-in code…');
});
test('a replaced Auth session cannot reuse a pending code',async()=>{
 const f=fixture();await f.ctx.activateCloudUser(f.authenticated);
 const otherToken=['header',Buffer.from(JSON.stringify({sub:'other-owner',session_id:'other-session'})).toString('base64url'),'signature'].join('.');
 f.ctx.sbSave({access_token:otherToken,user:{id:'other-owner'}});
 f.elements['browser-verify-code'].value='123456';assert.equal(await f.ctx.IYBrowserGate.confirm(),false);
 assert.equal(f.calls.filter(x=>x.action==='confirm').length,0);assert.equal(f.loads(),0);
});
