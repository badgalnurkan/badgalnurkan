'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!source)throw Error('Missing application script');
const extract=(a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert.ok(i>=0&&j>i,a);return source.slice(i,j)};
function recoveryFixture(options={}){
 const nodes={
  u:{value:options.email??'someone@example.invalid'},
  'recovery-token':{value:options.code??'123456'},
  fz:{textContent:''}
 };
 const calls={verify:[],saves:[],clears:0,gates:0};
 const user=options.user??{id:'same-user',email:'someone@example.invalid'};
 const context={
  document:{getElementById:id=>nodes[id]||null},
  tr:()=>false,
  emailPattern:/^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  sb:async(path,opts)=>{calls.verify.push({path,body:opts.body});if(options.error)throw Error('Network error');return options.answer||{user,access_token:'a',refresh_token:'r'}},
  sbSave:x=>calls.saves.push(x),
  sbCurrentUser:async()=>options.currentUser||user,
  sbClear:()=>calls.clears++,
  window:{IYAccount:{recovery:async()=>{calls.gates++}}},
  IYAccount:{recovery:async()=>{calls.gates++}}
 };
 vm.createContext(context);
 vm.runInContext(extract('let recoveryCodeBusy=false;','const NAV=NAV_KEYS;'),context);
 return {context,nodes,calls};
}
test('a six-digit recovery code verifies through Supabase without Google or a different browser',async()=>{
 const {context,nodes,calls}=recoveryFixture();
 await context.fVerifyRecoveryCode();
 assert.equal(calls.verify.length,1);
 assert.equal(calls.verify[0].path,'/auth/v1/verify');
 assert.equal(calls.verify[0].body.email,'someone@example.invalid');
 assert.equal(calls.verify[0].body.token,'123456');
 assert.equal(calls.verify[0].body.type,'recovery');
 assert.equal(calls.saves[0].user.id,'same-user');
 assert.equal(calls.gates,1);
 assert.equal(nodes['recovery-token'].value,'');
 assert.equal(calls.clears,0);
});
test('recovery code validation prevents malformed codes from contacting Auth',async()=>{
 const {context,calls,nodes}=recoveryFixture({code:'12abc6'});
 await context.fVerifyRecoveryCode();
 assert.equal(calls.verify.length,0);
 assert.equal(calls.gates,0);
 assert.match(nodes.fz.textContent,/valid email and six-digit/);
});
test('a recovery response for a different email is rejected without entering the account',async()=>{
 const {context,calls}=recoveryFixture({user:{id:'other-user',email:'other@example.invalid'}});
 await context.fVerifyRecoveryCode();
 assert.equal(calls.gates,0);
 assert.equal(calls.clears,1);
});
test('verification can fail safely without exposing a previous account',async()=>{
 const {context,calls,nodes}=recoveryFixture({error:true});
 await context.fVerifyRecoveryCode();
 assert.equal(calls.gates,0);
 assert.equal(calls.clears,1);
 assert.match(nodes.fz.textContent,/invalid or expired/);
});
test('switching to a saved cloud account clears the old session and requires login',()=>{
 const first={u:'first',authUid:'user-first'},second={u:'second',authUid:'user-second'};
 const calls={timers:0,clears:0,navigation:[]};
 const context={A:first,DB:{accounts:{first,second}},loginDat:{u:'first',p:'old'},
  stopTimers:()=>calls.timers++,sbClear:()=>calls.clears++,goTo:(v,p)=>calls.navigation.push([v,p])};
 vm.createContext(context);
 vm.runInContext(extract('function switchAcc(u){','function stopTimers(){'),context);
 context.switchAcc('second');
 assert.equal(context.A,null);
 assert.deepEqual(JSON.parse(JSON.stringify(context.loginDat)),{u:'second',p:''});
 assert.equal(calls.clears,1);
 assert.equal(calls.timers,1);
 assert.deepEqual(calls.navigation,[['login','home']]);
 assert.equal(context.DB.accounts.first,first,'first account data retained without reuse');
});
test('unknown account or currently active account cannot silently switch',()=>{
 const first={u:'first'},calls={clears:0};
 const context={A:first,DB:{accounts:{first}},stopTimers:()=>{},sbClear:()=>calls.clears++,goTo:()=>{}};
 vm.createContext(context);
 vm.runInContext(extract('function switchAcc(u){','function stopTimers(){'),context);
 context.switchAcc('unknown');context.switchAcc('first');
 assert.equal(context.A,first);
 assert.equal(calls.clears,0);
});

test('verify endpoint must not inherit a session bearer from a different account',()=>{
 const matcher=extract('async function sb(path,opt={}){','async function sbSignUp(');
 assert.match(matcher,/const isLogin=\/\^\\\/auth\\\/v1\\\/\(signup\|token\|recover\|resend\|verify\)/);
 assert.match(matcher,/if\(!isLogin&&session\?\.access_token\)headers\['Authorization'\]/);
});
