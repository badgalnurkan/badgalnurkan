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
 const input={value:options.code??'123456'};
 const calls={auth:[],activate:[],welcome:0};
 let session=null;
 const context={
  document:{getElementById:id=>({'signup-code-input':input,'signup-code-status':status,'signup-code-submit':submit}[id]||null)},
  tr:()=>false,msg:'',console,Date,Promise,
  sb:async(path,opt)=>{
   calls.auth.push({path,body:opt.body});
   if(options.error)throw Error('invalid OTP');
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
  },
  sbSession:()=>session
 };
 vm.createContext(context);
 vm.runInContext(code.slice(a,b),context);
 vm.runInContext("pendingSignup={email:'person@example.invalid',username:'user_one',nick:'User One'}",context);
 return {context,status,input,submit,calls};
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
 assert.deepEqual(x.calls.auth[0].body,{email:'person@example.invalid',token:'123456',type:'email'});
 assert.equal(x.calls.activate.length,1);
 assert.equal(x.calls.activate[0][1],'user_one');
 assert.equal(x.calls.welcome,1);
 assert.equal(vm.runInContext('pendingSignup',x.context),null);
});
test('another email cannot be activated with the pending signup code',async()=>{
 const x=fixture({response:{user:{id:'another-account',email:'another@example.invalid',email_confirmed_at:'2026-11-19T12:00:00Z'},access_token:'a',refresh_token:'b'}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.activate.length,0);
 assert.match(x.status.textContent,/invalid or expired/);
});
test('unconfirmed account cannot enter the app even if an Auth API returns a token',async()=>{
 const x=fixture({response:{user:{id:'one-user',email:'person@example.invalid',email_confirmed_at:null},access_token:'a',refresh_token:'b'}});
 await x.context.verifySignupCode();
 assert.equal(x.calls.activate.length,0);
 assert.equal(vm.runInContext('pendingSignup.email',x.context),'person@example.invalid');
});
test('re-request uses signup-only Auth resend endpoint',async()=>{
 const x=fixture();
 await x.context.resendSignupCode();
 assert.equal(x.calls.auth[0].path,'/auth/v1/resend');
 assert.deepEqual(x.calls.auth[0].body,{email:'person@example.invalid',type:'signup'});
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
