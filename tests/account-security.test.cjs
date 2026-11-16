'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const core=import('../supabase/functions/account-security/handler.mjs');
function jwt(amr=[{method:'oauth',timestamp:1800000000}]){
 return 'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:'server-user',role:'authenticated',session_id:'server-session',amr})).toString('base64url')+'.fixture-signature';
}
async function fixture({mail=true,send=true,amr,dbError}={}){
 const {createHandler}=await core,calls=[],rpc=[],mailBodies=[];
 const env={SUPABASE_URL:'https://project.example.invalid',SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'secret-fixture'};
 if(mail)Object.assign(env,{RESEND_API_KEY:'resend-fixture',ACCOUNT_MAIL_FROM:"Improvin <security@badgalnurkan.com>"});
 const fetchImpl=async(url,opt={})=>{
  calls.push(url);
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'server-user',email:'owner@example.invalid'});
  if(url.endsWith('/rpc/iydu_account_service')){
   const body=JSON.parse(opt.body);rpc.push(body);
   return Response.json(dbError?{error:dbError}:body.p_action.startsWith('request_')?{ok:true,id:body.p_fields.id,email:'owner@example.invalid'}:{ok:true,user_id:'server-user',state:'pending_delete',delete_after:'2027-01-01T00:00:00Z'});
  }
  if(url==='https://api.resend.com/emails'){mailBodies.push(JSON.parse(opt.body));return Response.json(send?{id:'mail-fixture'}:{error:'provider error'},{status:send?200:500})}
  throw Error('unexpected network '+url);
 };
 const handler=createHandler({env:k=>env[k],fetchImpl,cryptoImpl:webcrypto,now:()=>1800000000000});
 const req=(body,auth=true,origin='https://badgalnurkan.com')=>new Request('https://project.example.invalid/functions/v1/account-security',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{}),...(auth?{Authorization:'Bearer '+jwt(amr)}:{})},body:typeof body==='string'?body:JSON.stringify(body)});
 return {handler,req,calls,rpc,mailBodies};
}
test('challenge hashes are scoped to the challenge id',async()=>{const {digest}=await core;assert.equal((await digest('a:123456',webcrypto)).length,64);assert.notEqual(await digest('a:123456',webcrypto),await digest('b:123456',webcrypto))});
test('interactive authentication expires exactly at ten minutes and rejects future or refresh-only claims',async()=>{
 const {recentAuthentication}=await core;const claims={sub:'u',role:'authenticated',session_id:'s',amr:[{method:'oauth',timestamp:1000}]};
 assert.equal(recentAuthentication(claims,'u',1599999),true);assert.equal(recentAuthentication(claims,'u',1600000),false);
 assert.equal(recentAuthentication(claims,'u',999999),false);assert.equal(recentAuthentication({...claims,amr:[{method:'token_refresh',timestamp:1000}]},'u',1000000),false);assert.equal(recentAuthentication(claims,'other',1000000),false);
});
test('GET health exposes only readiness and never creates a mail or database request',async()=>{const f=await fixture();const r=await f.handler(new Request('https://x.invalid'));assert.deepEqual(await r.json(),{ok:true,version:1,mailReady:true});assert.equal(f.calls.length,0)});
test('unapproved origins cannot perform actions',async()=>{const f=await fixture();const r=await f.handler(f.req({action:'request_delete'},true,'https://evil.invalid'));assert.equal(r.status,403);assert.equal(f.calls.length,0)});
test('missing authorization and oversized bodies fail before database access',async()=>{
 const f=await fixture();assert.equal((await f.handler(f.req({action:'request_delete'},false))).status,401);
 assert.equal((await f.handler(f.req('x'.repeat(9000)))).status,413);assert.equal(f.calls.length,0);
});
test('missing Resend configuration fails closed without creating a challenge',async()=>{const f=await fixture({mail:false});const r=await f.handler(f.req({action:'request_deactivate'}));assert.equal(r.status,503);assert.equal((await r.json()).code,'MAIL_NOT_CONFIGURED');assert.equal(f.rpc.length,0)});
test('temporary closure sends a six-digit code only to the verified server identity',async()=>{
 const f=await fixture(),r=await f.handler(f.req({action:'request_deactivate',user_id:'victim',email:'victim@example.invalid'})),data=await r.json();
 assert.equal(r.status,200);assert.equal(f.rpc[0].p_uid,'server-user');assert.deepEqual(f.mailBodies[0].to,['owner@example.invalid']);
 const code=f.mailBodies[0].text.match(/\b\d{6}\b/)[0];assert.equal(f.rpc[0].p_fields.hash,await (await core).digest(data.id+':'+code,webcrypto));
 assert.equal(JSON.stringify(data).includes(code),false);assert.equal(data.expiresIn,600);
});
test('permanent closure emails a fragment token and does not schedule deletion yet',async()=>{
 const f=await fixture(),r=await f.handler(f.req({action:'request_delete',lang:'en'})),data=await r.json();
 assert.equal(data.expiresIn,1800);assert.match(f.mailBodies[0].text,/https:\/\/badgalnurkan\.com\/#account-action=delete&id=/);
 assert.match(f.mailBodies[0].text,/token=[a-f0-9]{64}/);assert.equal(f.rpc.length,1);assert.equal(f.rpc[0].p_action,'request_delete');
});
test('provider failure invalidates its challenge and never closes the account',async()=>{const f=await fixture({send:false}),r=await f.handler(f.req({action:'request_delete'}));assert.equal(r.status,502);assert.equal(f.rpc.length,2);assert.equal(f.rpc[1].p_action,'cancel')});
test('expired interactive sign-in cannot request account emails',async()=>{const f=await fixture({amr:[{method:'oauth',timestamp:1799999399}]}),r=await f.handler(f.req({action:'request_delete'}));assert.equal(r.status,403);assert.equal(f.rpc.length,0)});
test('a mail link finalizes only through explicit POST and the one-use challenge RPC',async()=>{
 const f=await fixture(),id='b04146d1-f2a4-4a04-bd46-70159554b90f',token='a'.repeat(64);
 const r=await f.handler(f.req({action:'confirm_delete',id,token,reason:'privacy',confirmation:'YES_DELETE_IN_30_DAYS'},false));
 assert.equal(r.status,200);assert.equal(f.calls.some(x=>x.endsWith('/auth/v1/user')),false);assert.equal(f.rpc[0].p_uid,null);assert.equal(f.rpc[0].p_action,'confirm_delete');
 assert.equal(f.rpc[0].p_fields.hash,await(await core).digest(id+':'+token,webcrypto));
});
test('confirmation attempt and rate-limit failures stay visible to the client',async()=>{
 const f=await fixture({dbError:'RATE_LIMITED'}),r=await f.handler(f.req({action:'request_delete'}));assert.equal(r.status,429);assert.equal((await r.json()).code,'RATE_LIMITED');assert.equal(f.mailBodies.length,0);
});
test('six-digit codes still require a verified signed-in user',async()=>{const f=await fixture(),r=await f.handler(f.req({action:'confirm_deactivate',id:'b04146d1-f2a4-4a04-bd46-70159554b90f',token:'123456'},false));assert.equal(r.status,401);assert.equal(f.rpc.length,0)});
function uiFixture(){
 const nodes=new Map(),events=[],session={user:{id:'u'},access_token:'fixture'};
 const ctx={window:{},document:{addEventListener(){},querySelectorAll:()=>[],getElementById:id=>nodes.get(id)||null},
  A:{u:'local',authUid:'u'},view:'app',pg:'home',tr:()=>true,esc:x=>String(x),sbSession:()=>ctx.session,sbSave:s=>ctx.session=s,session,
  sb:async()=>({user_id:'u',email:'real@example.invalid',state:'deactivated',has_password:true,server_time:'2026-11-17T00:00:00Z'}),
  stopTimers(){events.push('stop')},removeDeletedAccountFromBrowser(){ctx.A=null;ctx.session=null;events.push('clear-local')},
  renderAppOrAuth(){events.push('render-login')},openModal:(id,html)=>events.push({id,html}),Date,URLSearchParams,
  history:{replaceState(){}},location:{hash:'',pathname:'/',search:''},getItem:()=>null,setItem(){},
  toast(){},pwOk:()=>'',setInterval(){},MutationObserver:function(){},queueMicrotask,AbortSignal,
 };
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('account-security.js','utf8'),ctx);
 return {ctx,ui:ctx.window.IYAccount,events,nodes};
}
test('deactivated account gate clears local app data while retaining only the verified reactivation session',async()=>{
 const {ctx,ui,events}=uiFixture();assert.equal(await ui.checkAccess({id:'u'}),false);assert.equal(ctx.A,null);assert.equal(ctx.session.user.id,'u');
 assert.ok(events.includes('clear-local'));assert.ok(events.some(e=>e.id==='security-gate'&&e.html.includes('Yeniden açma kodu')));
});
test('profile email comes from server status rather than cached profile JSON',async()=>{
 const {ctx,ui}=uiFixture();ctx.sb=async()=>({user_id:'u',email:'real@example.invalid',state:'active'});await ui.status({id:'u'});assert.match(ui.emailMarkup(),/real@example.invalid/);assert.equal(ctx.A.email,'real@example.invalid');
});
test('recovery links do not activate or fetch private app data before password renewal',async()=>{
 const {ctx,ui,events}=uiFixture();ctx.A=null;ctx.sb=async()=>({user_id:'u',email:'real@example.invalid',state:'active',has_password:true});await ui.recovery({id:'u'});
 assert.equal(ctx.A,null);const gate=events.find(e=>e.id==='security-gate');assert.match(gate.html,/gate-new/);assert.doesNotMatch(gate.html,/id="gate-old"/);
});
test('deletion links show reasons without contacting the server or mutating accounts',()=>{
 const {ctx,ui,events}=uiFixture();ctx.location.hash='#account-action=delete&id=b04146d1-f2a4-4a04-bd46-70159554b90f&token='+'f'.repeat(64);
 assert.equal(ui.consumeLink(),true);const modal=events.find(e=>e.id==='account-delete-reasons');assert.ok(modal);assert.match(modal.html,/value="other"/);assert.equal((modal.html.match(/<option/g)||[]).length,9);
});
test('malicious or switched identity cannot be rendered as a verified profile',async()=>{const {ctx,ui}=uiFixture();ctx.sb=async()=>({user_id:'victim',email:'victim@example.invalid'});await assert.rejects(ui.status({id:'u'}),/UNAUTHORIZED/)});
