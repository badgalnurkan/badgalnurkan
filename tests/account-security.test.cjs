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
  if(url.includes('/auth/v1/otp?redirect_to=')){return Response.json({})}
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
test('GET health exposes only readiness and never creates a mail or database request',async()=>{const f=await fixture();const r=await f.handler(new Request('https://x.invalid'));assert.deepEqual(await r.json(),{ok:true,version:4,transactionalMailReady:true,mailReady:true,delivery:'resend'});assert.equal(f.calls.length,0)});
test('unapproved origins cannot perform actions',async()=>{const f=await fixture();const r=await f.handler(f.req({action:'request_delete'},true,'https://evil.invalid'));assert.equal(r.status,403);assert.equal(f.calls.length,0)});
test('missing authorization and oversized bodies fail before database access',async()=>{
 const f=await fixture();assert.equal((await f.handler(f.req({action:'request_delete'},false))).status,401);
 assert.equal((await f.handler(f.req('x'.repeat(9000)))).status,413);assert.equal(f.calls.length,0);
});
test('account closure requests fail closed without a configured mail transport',async()=>{
 const f=await fixture({mail:false});
 const health=await(await f.handler(new Request('https://x.invalid'))).json();
 assert.equal(health.transactionalMailReady,false);
 assert.equal(health.mailReady,false);
 assert.equal(health.delivery,'unavailable');
 for(const action of ['request_deactivate','request_delete','request_reactivate']){
  const response=await f.handler(f.req({action}));
  assert.equal(response.status,503);
  assert.equal((await response.json()).code,'MAIL_NOT_CONFIGURED');
 }
 assert.equal(f.rpc.length,0,'an undeliverable challenge must not be created');
 assert.equal(f.mailBodies.length,0);
 assert.equal(f.calls.filter(url=>url.includes('/auth/v1/otp')).length,0);
});
test('previously delivered delete challenge remains usable if mail config is lost',async()=>{
 const f=await fixture({mail:false});
 const id='b04146d1-f2a4-4a04-bd46-70159554b90f';
 const r=await f.handler(f.req({action:'confirm_delete',id,token:'a'.repeat(64),reason:'privacy',confirmation:'YES_DELETE_IN_60_DAYS'},false));
 assert.equal(r.status,200);
 assert.equal(f.rpc[0].p_action,'confirm_delete');
});
test('each account action has a distinct transactional subject in both languages',async()=>{
 for(const [action,en,tr] of [['deactivate',/temporary account closure code/i,/Geçici hesap kapatma/],['delete',/account deletion request/i,/Kalıcı hesap silme/],['reactivate',/reactivation code/i,/yeniden açma/]]){
  for(const [lang,label] of [['en',en],['tr',tr]]){
   const f=await fixture();const data=await(await f.handler(f.req({action:'request_'+action,lang}))).json();
   assert.equal(data.delivery,'resend');assert.match(f.mailBodies[0].subject,label);assert.ok(!f.calls.some(path=>path.includes('/otp')));
   assert.match(f.mailBodies[0].text,action==='delete'?/\/account-close\.html#id=/:/\b\d{6}\b/);
  }
 }
});
test('temporary closure sends a six-digit code only to the verified server identity',async()=>{
 const f=await fixture(),r=await f.handler(f.req({action:'request_deactivate',user_id:'victim',email:'victim@example.invalid'})),data=await r.json();
 assert.equal(r.status,200);assert.equal(f.rpc[0].p_uid,'server-user');assert.deepEqual(f.mailBodies[0].to,['owner@example.invalid']);
 const code=f.mailBodies[0].text.match(/\b\d{6}\b/)[0];assert.equal(f.rpc[0].p_fields.hash,await (await core).digest(data.id+':'+code,webcrypto));
 assert.equal(JSON.stringify(data).includes(code),false);assert.equal(data.expiresIn,600);
});
test('permanent closure emails a fragment token and does not schedule deletion yet',async()=>{
 const f=await fixture(),r=await f.handler(f.req({action:'request_delete',lang:'en'})),data=await r.json();
 assert.equal(data.expiresIn,1800);assert.match(f.mailBodies[0].text,/https:\/\/badgalnurkan\.com\/account-close\.html#id=/);
 assert.match(f.mailBodies[0].text,/token=[a-f0-9]{64}/);assert.equal(f.rpc.length,1);assert.equal(f.rpc[0].p_action,'request_delete');
});
test('provider failure invalidates its challenge and never closes the account',async()=>{const f=await fixture({send:false}),r=await f.handler(f.req({action:'request_delete'}));assert.equal(r.status,502);assert.equal(f.rpc.length,2);assert.equal(f.rpc[1].p_action,'cancel')});
test('expired interactive sign-in cannot request account emails',async()=>{const f=await fixture({amr:[{method:'oauth',timestamp:1799999399}]}),r=await f.handler(f.req({action:'request_delete'}));assert.equal(r.status,403);assert.equal(f.rpc.length,0)});
test('a mail link finalizes only through explicit POST and the one-use challenge RPC',async()=>{
 const f=await fixture(),id='b04146d1-f2a4-4a04-bd46-70159554b90f',token='a'.repeat(64);
 const r=await f.handler(f.req({action:'confirm_delete',id,token,reason:'privacy',confirmation:'YES_DELETE_IN_60_DAYS'},false));
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
  DB:{accounts:{local:{authUid:'u'}}},A:{u:'local',authUid:'u'},view:'app',pg:'home',tr:()=>true,esc:x=>String(x),sbSession:()=>ctx.session,sbSave:s=>ctx.session=s,session,
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

test('email confirmation callbacks stay distinct from Google OAuth callbacks',async()=>{
 const html=fs.readFileSync('index.html','utf8'),source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const code=source.slice(source.indexOf('async function bootstrapCloudAuth(){'),source.indexOf('const sbSession='));
 for(const [type,providers,expected] of [['signup',['email'],'password'],['email_change',['email','google'],'password'],['',['google'],'google']]){
  const bridge={consumeLink:()=>false};
  const ctx={URLSearchParams,AbortController,window:{IYAccount:bridge},IYAccount:bridge,location:{hash:'#access_token=fixture&refresh_token=fixture'+(type?'&type='+type:''),pathname:'/',search:''},
   history:{replaceState(){}},v13HasMigrationMarker:()=>false,v13FinishMigration:async()=>false,renderAppOrAuth(){},loginBusy(){},SUPABASE_URL:'https://example.invalid',SUPABASE_KEY:'fixture',
   fetch:async()=>Response.json({id:'u',email:'owner@example.invalid',app_metadata:{providers}}),setTimeout,clearTimeout,
   activateCloudUser:async(_identity,_name,method)=>{ctx.method=method},sbClear(){},tr:()=>true};
  vm.createContext(ctx);vm.runInContext(code+'this.start=bootstrapCloudAuth;',ctx);await ctx.start();assert.equal(ctx.method,expected,type||'oauth');
 }
});

function recoveryProfile(server,storage={},account=null){
 const dom=new Map(),historyCalls=[],gates=[],modals=[];
 let session=null;
 const loc={href:'https://badgalnurkan.com/',origin:'https://badgalnurkan.com',hash:''};
 const localStorage=new Proxy(storage,{get:(obj,key)=>key==='getItem'?k=>obj[k]??null:key==='setItem'?(k,v)=>{obj[k]=v}:key==='removeItem'?k=>{delete obj[k]}:obj[key]});
 const ctx={crypto:webcrypto,TextEncoder,URL,URLSearchParams,Uint8Array,btoa,localStorage,location:loc,A:account,tr:()=>false,
  document:{getElementById(id){if(!dom.has(id))dom.set(id,{value:''});return dom.get(id)}},
  history:{state:null,replaceState(a,b,url){historyCalls.push(url)}},openModal(id){modals.push(id)},closeModal(){},toast(){},
  sb:server,sbSave:v=>{session=v},sbSession:()=>session,sbClear:()=>{session=null},IYAccount:{async recovery(user){gates.push(user.id)}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','recovery-browser.js'),'utf8')+';this.flow=IYRecovery;',ctx);
 return {ctx,flow:ctx.flow,dom,gates,modals,historyCalls,session:()=>session};
}
test('email opened elsewhere reveals only a one-use code and the original browser proves possession',async()=>{
 const {createHash}=require('node:crypto'),email='fixture@example.invalid',code=webcrypto.randomUUID();
 let redirect,challenge,exchanges=0;
 const server=async(path,{body})=>{
  if(path.startsWith('/auth/v1/recover')){
   redirect=new URL(new URL(path,'https://example.invalid').searchParams.get('redirect_to'));challenge=body.code_challenge;
   assert.equal(body.code_verifier,undefined);return {};
  }
  assert.match(path,/grant_type=pkce/);exchanges++;assert.equal(body.auth_code,code);
  assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'),challenge);
  return {access_token:'fixture',refresh_token:'fixture-refresh',user:{id:'owner',email}};
 };
 const storage={},first=recoveryProfile(server,storage),other=recoveryProfile(server);
 await first.flow.request(email);redirect.searchParams.set('code',code);other.ctx.location.href=redirect.href;
 assert.equal(await other.flow.callback(),true);assert.equal(exchanges,0);assert.equal(other.session(),null);
 assert.equal(other.dom.get('recovery-copy').value,code);
 const resumed=recoveryProfile(server,storage);resumed.flow.resume(email);
 resumed.ctx.document.getElementById('recovery-return-code').value=code;await resumed.flow.submit();
 assert.deepEqual(resumed.gates,['owner']);assert.equal(exchanges,1);assert.equal(Object.keys(storage).length,0);
 await resumed.flow.submit();assert.equal(exchanges,1);
});
test('a different verified email cannot change the session for a pending reset',async()=>{
 const email='original@example.invalid';let redirect;
 const profile=recoveryProfile(async(path)=>{
  if(path.includes('/recover?')){redirect=new URL(new URL(path,'https://example.invalid').searchParams.get('redirect_to'));return {}}
  return {access_token:'fixture',refresh_token:'refresh',user:{id:'wrong',email:'wrong@example.invalid'}};
 });
 await profile.flow.request(email);redirect.searchParams.set('code',webcrypto.randomUUID());profile.ctx.location.href=redirect.href;
 assert.equal(await profile.flow.callback(),true);assert.equal(profile.session(),null);assert.equal(profile.gates.length,0);
 assert.equal(profile.modals.at(-1),'recovery-browser-error');
});

test('temporary closure code leads to a separate explicit Yes without closing account first',async()=>{
 const {ctx,ui,nodes,events}=uiFixture();const actions=[];
 ctx.fetch=async(_url,opt)=>{
  const body=JSON.parse(opt.body);actions.push(body.action);
  return Response.json({ok:true,id:'b04146d1-f2a4-4a04-bd46-70159554b90f',delivery:'resend'});
 };
 ctx.sbPush=async()=>true;ctx.sbClear=()=>{ctx.session=null};ctx.goTo=()=>{};ctx.closeModal=()=>{};
 ctx.SUPABASE_URL='https://example.supabase.co';ctx.SUPABASE_KEY='public-fixture';ctx.DB.lang='tr';
 await ui.request('deactivate');
 assert.ok(events.some(e=>e.id==='account-code'));
 nodes.set('account-code-input',{value:'123456'});
 await ui.confirmCode();
 assert.equal(actions.includes('confirm_deactivate'),false,'typing the code must not close the account');
 assert.ok(events.some(e=>e.id==='account-deactivate-final'&&e.html.includes('Emin misin?')));
 await ui.finalizeDeactivation();
 assert.ok(actions.includes('confirm_deactivate'),'only explicit Yes sends server confirmation');
 assert.equal(ctx.A,null);
});
test('deactivation deadline and permanent deletion retention are explained separately',()=>{
 const {ctx,ui,events}=uiFixture();
 ctx.sb=async()=>({user_id:'u',email:'real@example.invalid',state:'deactivated',delete_after:'2027-01-10T00:00:00Z',server_time:'2027-01-01T00:00:00Z'});
 return ui.checkAccess({id:'u'}).then(()=>{
  const gate=events.find(e=>e.id==='security-gate');
  assert.ok(gate&&gate.html.includes('2027'));
  assert.match(fs.readFileSync('account-security.js','utf8'),/YES_DELETE_IN_60_DAYS/);
 });
});
test('standalone account deletion page requires the reason and a final Yes',()=>{
 const html=fs.readFileSync('account-close.html','utf8');
 const code=fs.readFileSync('account-close.js','utf8');
 assert.match(html,/id="deletion-reason"/);
 assert.match(html,/value="other"/);
 assert.match(html,/id="finalize-deletion"/);
 assert.match(html,/60 gün/);
 assert.match(code,/confirmation:'YES_DELETE_IN_60_DAYS'/);
 assert.match(code,/history\.replaceState/);
 assert.doesNotMatch(code,/localStorage/);
});
test('staged retention SQL preserves legacy deactivations and schedules both policy windows',()=>{
 const sql=fs.readFileSync('database/account_retention_30_60_staging.sql','utf8');
 assert.match(sql,/state='deactivated',delete_after=now\(\)\+interval '30 days'/);
 assert.match(sql,/state='pending_delete',delete_after=now\(\)\+interval '60 days'/);
 assert.match(sql,/state in \('pending_delete','deactivated'\)/);
 assert.match(sql,/state='deactivated' -- Legacy deactivated rows/);
 assert.match(sql,/coalesce\(p_fields->>'confirmation',''\) <> 'YES_DELETE_IN_60_DAYS'/);
 assert.doesNotMatch(sql,/YES_DELETE_IN_30_DAYS/);
});
