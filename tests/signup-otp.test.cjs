'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const code=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!code)throw Error('Missing inline script');
const a=code.indexOf('const MAX_DEVICE_ACCOUNTS=3;');
const b=code.indexOf('function deviceAccountCount(){',a);
if(a<0||b<=a)throw Error('Signup OTP verification block not found');
function fixture(options={}){
 const status={textContent:''};
 const submit={disabled:false,isConnected:true};
 const resend={disabled:false,isConnected:true};
 const input={value:options.code??'123456'};
 const calls={auth:[],activate:[],welcome:0};
 let session=null;
 const context={
  window:{IYBrowserGate:{isPending:()=>options.browserGatePending===true}},view:'signup-code',pg:'home',loginDat:{},formDat:{},
  renderAppOrAuth:()=>{},toast:()=>{},
  document:{getElementById:id=>({'signup-code-input':input,'signup-code-status':status,'signup-code-submit':submit,'signup-code-resend':resend}[id]||null)},
  tr:()=>false,msg:'',console,Date,Promise,
  sb:async(path,opt)=>{
   calls.auth.push({path,body:opt.body});
   if(path==='/auth/v1/verify'&&options.error)throw Object.assign(Error('invalid OTP'),options.error===true?{}:options.error);
   if(path==='/auth/v1/resend'&&options.resendError)throw Object.assign(Error('resend denied'),options.resendError);
   if(path==='/auth/v1/verify'&&options.verifyPromise)return options.verifyPromise;
   if(path==='/auth/v1/resend'&&options.resendPromise)return options.resendPromise;
   return options.response??{
    user:{id:'one-user',email:'person@example.invalid',email_confirmed_at:'2026-11-19T12:00:00Z'},
    access_token:'token',refresh_token:'refresh'
   };
  },
  playWelcomeTransition:done=>{calls.welcome++;done()},
  activateCloudUser:async (...args)=>{
   calls.activate.push(args);
   if(options.activationError)throw Error('activation failed');
   session={user:{id:args[0].user.id}};
   return options.activationResult===null?null:{authUid:args[0].user.id};
  },
  sbSession:()=>session
 };
 vm.createContext(context);
 vm.runInContext(code.slice(a,b),context);
 vm.runInContext("pendingSignup={email:'person@example.invalid',username:'user_one',nick:'User One'}",context);
 return {context,status,input,submit,resend,calls};
}
test('signup OTP cannot accept a malformed or incomplete code',async()=>{
 const x=fixture({code:'12ab'});
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth.length,0);
 assert.equal(x.calls.activate.length,0);
 assert.match(x.status.textContent,/six-digit code/);
});
test('verified six-digit signup code activates precisely its email owner',async()=>{
 const x=fixture();
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth[0].path,'/auth/v1/verify');
 assert.deepEqual(JSON.parse(JSON.stringify(x.calls.auth[0].body)),{email:'person@example.invalid',token:'123456',type:'email'});
 assert.equal(x.calls.activate.length,1);
 assert.equal(x.calls.activate[0][1],'user_one');
 assert.equal(x.calls.welcome,1);
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
});
test('another email cannot be activated with the pending signup code',async()=>{
 const x=fixture({response:{user:{id:'another-account',email:'another@example.invalid',email_confirmed_at:'2026-11-19T12:00:00Z'},access_token:'a',refresh_token:'b'}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.activate.length,0);
 assert.match(x.context.msg,/did not match this email/);
 assert.equal(x.context.view,'login');
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
});
test('unconfirmed account cannot enter the app even if an Auth API returns a token',async()=>{
 const x=fixture({response:{user:{id:'one-user',email:'person@example.invalid',email_confirmed_at:null},access_token:'a',refresh_token:'b'}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.activate.length,0);
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
 assert.equal(x.context.view,'login');
 assert.match(x.context.msg,/session response was incomplete/i);
});
test('re-request uses signup-only Auth resend endpoint',async()=>{
 const x=fixture();
 await x.context.resendSignupCode();
 assert.equal(x.calls.auth[0].path,'/auth/v1/resend');
 assert.deepEqual(JSON.parse(JSON.stringify(x.calls.auth[0].body)),{email:'person@example.invalid',type:'signup'});
 assert.equal(x.calls.activate.length,0);
});
test('OTP verification does not inherit an unrelated account access token',()=>{
 const source=code.slice(code.indexOf('async function sb(path,opt={}){'),code.indexOf('async function sbSignUp('));
 assert.match(source,/signup\|token\|recover\|resend\|verify/);
 assert.match(source,/if\(!isLogin&&session\?\.access_token\)/);
});
test('signup email template contains the six-digit token and no auto-accept link',()=>{
 const file=fs.readFileSync(path.join(__dirname,'..','supabase','email-templates','confirm-signup-otp.html'),'utf8');
 assert.match(file,/\{\{\s*\.Token\s*\}\}/);
 assert.doesNotMatch(file,/\{\{\s*\.ConfirmationURL\s*\}\}/);
 assert.match(html,/view==='signup-code'/);
 assert.match(html,/autocomplete="one-time-code"/);
});

test('accepted OTP does not turn into invalid-code feedback when account activation fails',async()=>{
 const x=fixture({activationError:true});
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
 assert.equal(x.context.view,'login');
 assert.match(x.context.msg,/email code was accepted/i);
 assert.doesNotMatch(x.context.msg,/invalid|expired/i);
});
test('server-side otp_expired is not confused with successful account activation',async()=>{
 const x=fixture({error:{code:'otp_expired',status:403}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.activate.length,0);
 assert.match(x.status.textContent,/server rejected this code/i);
 assert.notEqual(vm.runInContext('pendingSignup',x.context),null);
});
test('successful resend has a cooldown and warns about older delivered emails',async()=>{
 const x=fixture();
 await x.context.resendSignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.match(x.status.textContent,/older email codes may no longer work/i);
 await x.context.resendSignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.match(x.status.textContent,/avoid requesting codes repeatedly/i);
});
test('rate-limited resend keeps existing signup active and warns correctly',async()=>{
 const x=fixture({resendError:{status:429,code:'over_email_send_rate_limit'}});
 await x.context.resendSignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.match(x.status.textContent,/temporarily rate-limited/i);
 assert.notEqual(vm.runInContext('pendingSignup',x.context),null);
});

test('verification rate limit is not falsely reported as an expired OTP',async()=>{
 const x=fixture({error:{status:429,code:'over_request_rate_limit'}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.equal(x.calls.activate.length,0);
 assert.match(x.status.textContent,/too many verification attempts/i);
});
test('resending clears previously typed code instead of suggesting it is still current',async()=>{
 const x=fixture();
 x.input.value='654321';
 await x.context.resendSignupCode();
 assert.equal(x.input.value,'');
});

test('HTTP 200 with no session cannot invite reuse of a consumed code',async()=>{
 const x=fixture({response:{user:{id:'one-user',email:'person@example.invalid',email_confirmed_at:'2026-11-19T12:00:00Z'}}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.activate.length,0);
 assert.equal(x.context.view,'login');
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
});
test('silent activation failure redirects without asking for the spent code',async()=>{
 const x=fixture({activationResult:null});
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.equal(x.context.view,'login');
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
 assert.match(x.context.msg,/activation did not finish/i);
});
test('pending browser verification can take over after successful signup OTP',async()=>{
 const x=fixture({activationResult:null,browserGatePending:true});
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth.length,1);
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
 assert.equal(x.context.view,'signup-code');
});
test('rapid duplicate verify/resend click only triggers one request',async()=>{
 let release;
 const verifyPromise=new Promise(resolve=>{release=resolve});
 const x=fixture({verifyPromise});
 const first=x.context.verifySignupCode();
 assert.equal(x.submit.disabled,true);
 assert.equal(x.resend.disabled,true);
 await x.context.verifySignupCode();
 await x.context.resendSignupCode();
 assert.equal(x.calls.auth.length,1);
 release({user:{id:'one-user',email:'person@example.invalid',email_confirmed_at:'2026-11-19T12:00:00Z'},access_token:'a',refresh_token:'b'});
 await first;
 assert.equal(x.calls.auth.length,1);
 assert.equal(x.submit.disabled,false);
 assert.equal(x.resend.disabled,false);
});
test('resend in flight locks verify and repeated resend requests',async()=>{
 let release;
 const resendPromise=new Promise(resolve=>{release=resolve});
 const x=fixture({resendPromise});
 const first=x.context.resendSignupCode();
 assert.equal(x.submit.disabled,true);
 assert.equal(x.resend.disabled,true);
 await x.context.resendSignupCode();
 await x.context.verifySignupCode();
 assert.equal(x.calls.auth.length,1);
 release({});
 await first;
 assert.equal(x.submit.disabled,false);
 assert.equal(x.resend.disabled,false);
});
