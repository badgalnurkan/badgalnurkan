'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Inline application script must exist');
const slice=(start,end)=>{
 const a=script.indexOf(start),b=script.indexOf(end,a);
 assert.ok(a>=0&&b>a,'Missing tested block '+start);
 return script.slice(a,b);
};
const authErrorSource=slice('function authErrorMessage(err){','function goExistingEmail(email){');
const loginSource=slice('async function login(){','const MAX_DEVICE_ACCOUNTS=3;');
const recoverySource=slice('let recoveryMailBusy=false','const NAV=NAV_KEYS;');

test('frontend inline JS parses and recovery entry is accessible',()=>{
 assert.doesNotThrow(()=>new Function(script));
 assert.match(html,/id="forgot-reset-submit"/);
});

function loginFixture(failure){
 let rendered=0,codeStatus='',signinCalls=0;
 const context={
  authBusy:false,loginDat:{u:'owner@example.invalid',p:''},msg:'',view:'login',pg:'home',
  DB:{accounts:{}},formDat:{},tr:()=>false,
  document:{getElementById:()=>null},
  $:selector=>selector==='#u'?{value:'owner@example.invalid'}:selector==='#p'?{value:'correct-but-unverified-password'}:null,
  findUser:()=>null,
  playWelcomeTransition:done=>done(),
  loginBusy:()=>{},
  sbSignIn:async()=>{signinCalls++;throw failure},
  accountCloudHints:()=>true,pwMatch:async()=>false,
  renderAppOrAuth:()=>{rendered++},
  signupOtpMessage:text=>{codeStatus=text},
  authErrorMessage:null,
  setItem:()=>{},
  console
 };
 vm.createContext(context);
 vm.runInContext("function captchaErrorText(err){\n  if(!/captcha/i.test(String(err?.code||'')+' '+String(err?.message||'')))return '';\n  return tr()?'Robot doğrulaması tamamlanamadı. Kutucuğu kontrol edip yeniden dene.':'Security verification failed. Check the verification box and try again.';\n}\n",context);
 vm.runInContext('let pendingSignup=null;',context);
 vm.runInContext(authErrorSource,context);
 vm.runInContext(loginSource,context);
 return {context,calls:()=>signinCalls,renders:()=>rendered,status:()=>codeStatus,pending:()=>vm.runInContext('pendingSignup',context)};
}

test('interrupted signup recovers with verified email OTP, never assumes a link',async()=>{
 const x=loginFixture(Object.assign(Error('Email not confirmed'),{code:'email_not_confirmed',status:400}));
 await x.context.login();
 assert.equal(x.calls(),1);
 assert.equal(x.context.view,'signup-code');
 assert.deepEqual(JSON.parse(JSON.stringify(x.pending())),{email:'owner@example.invalid',username:''});
 assert.match(x.status(),/six-digit code/);
 assert.equal(x.renders(),1);
});

test('invalid password or unrelated auth failure cannot unlock OTP flow',async()=>{
 const x=loginFixture(Object.assign(Error('Invalid login credentials'),{code:'invalid_credentials',status:400}));
 await x.context.login();
 assert.equal(x.context.view,'login');
 assert.equal(x.pending(),null);
 assert.match(x.context.msg,/Sign-in failed/);
});

function recoveryFixture(sender){
 let now=5000000,calls=0;
 const submit={disabled:false,isConnected:true};
 const resumed={dataset:{}};
 const feedback={textContent:'',innerHTML:'',querySelector:()=>resumed};
 const emailField={value:'owner@example.invalid'};
 const D=class extends Date{static now(){return now}};
 const context={
  $:s=>s==='#u'?emailField:s==='#fz'?feedback:null,
  document:{getElementById:id=>id==='forgot-reset-submit'?submit:null},
  Date:D,msg:'',emailPattern:/^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  t:k=>k,tr:()=>false,renderAppOrAuth:()=>{},
  sbRecover:async(email)=>{calls++;return sender(email)}
 };
 vm.createContext(context);
 vm.runInContext("function captchaErrorText(err){\n  if(!/captcha/i.test(String(err?.code||'')+' '+String(err?.message||'')))return '';\n  return tr()?'Robot doğrulaması tamamlanamadı. Kutucuğu kontrol edip yeniden dene.':'Security verification failed. Check the verification box and try again.';\n}\n",context);
 vm.runInContext(recoverySource,context);
 return {context,submit,feedback,emailField,resumed,calls:()=>calls,advance:ms=>{now+=ms}};
}

test('rapid reset clicks send only one email, keep entered address, and honor cooldown',async()=>{
 let release;const deferred=new Promise(resolve=>{release=resolve});
 const x=recoveryFixture(()=>deferred);
 const first=x.context.fSend('email');
 await x.context.fSend('email');
 assert.equal(x.calls(),1);
 assert.equal(x.submit.disabled,true);
 release();await first;
 assert.equal(x.submit.disabled,false);
 assert.equal(x.resumed.dataset.email,'owner@example.invalid');
 await x.context.fSend('email');
 assert.equal(x.calls(),1);
 assert.match(x.feedback.textContent,/Please wait/);
 assert.equal(x.emailField.value,'owner@example.invalid');
 x.advance(61000);await x.context.fSend('email');
 assert.equal(x.calls(),2);
});

test('server HTTP 429 is explained and retry uses a bounded cooldown',async()=>{
 let attempt=0;const x=recoveryFixture(async()=>{if(++attempt===1)throw Object.assign(Error('Too Many Requests'),{status:429})});
 await x.context.fSend('email');
 assert.equal(x.calls(),1);
 assert.match(x.feedback.textContent,/Too many reset requests/);
 assert.equal(x.submit.disabled,false);
 await x.context.fSend('email');
 assert.equal(x.calls(),1);
 x.advance(61000);
 await x.context.fSend('email');
 assert.equal(x.calls(),2);
 assert.equal(x.resumed.dataset.email,'owner@example.invalid');
});

test('accepted Supabase credentials plus profile failure are not misreported as invalid password',async()=>{
 const x=loginFixture(Object.assign(Error('ignored'),{code:'not-used'}));
 x.context.sbSignIn=async()=>({access_token:'ok',user:{id:'owner-id',email:'owner@example.invalid'}});
 x.context.activateCloudUser=async()=>{throw Object.assign(Error('RPC missing'),{status:404})};
 await x.context.login();
 assert.equal(x.context.view,'login');
 assert.match(x.context.msg,/Sign-in succeeded but your account data could not be loaded/);
 assert.doesNotMatch(x.context.msg,/Check email and password/);
});

test('registration gives required field errors, preserves optional bio and checks terms and personal passwords',()=>{
 const c={tr:()=>true,t:x=>x,userRe:/^[a-z0-9_.-]{3,20}$/i,emailPattern:/^[^@\s]+@[^@\s]+\.[^@\s]+$/,findUser:()=>null,DB:{accounts:{sample:{email:'registered@example.invalid'}}}};
 vm.runInNewContext(slice('function pwOk(p,u){','function mon(d){')+slice('function signupErrors(','function showSignupError('),c);
 const missing=c.signupErrors('','','','','',false);
 for(const key of ['u','n','e','p','p2','signup-terms'])assert.ok(missing[key],key);
 assert.equal(missing.b,undefined);
 const validate=(email,p,confirm=p,ack=true)=>c.signupErrors('sample','Deniz',email,p,confirm,ack);
 assert.match(validate('registered@example.invalid','Blue-Mint-70!').e,/kayıtlı/);
 assert.match(validate('owner@example.invalid','Deniz-A!375').p,/kişisel/);
 assert.match(validate('owner@example.invalid','K!29.07.2005').p,/doğum tarihi/);
 assert.ok(validate('owner@example.invalid','Blue-Mint-70!','wrong').p2);
 assert.ok(Object.values(validate('owner@example.invalid','Blue-Mint-70!')).every(value=>!value));
});

test('journal appends up to 2000 characters and preserves a full or legacy entry when another save would overflow',()=>{
 const input={value:'b'.repeat(997)},owner={journal:{day:{text:'a'.repeat(1001)}}};
 const c={document:{getElementById:()=>input},A:owner,today:()=>'day',recordActivity(){},P:{home(){}},toast(){},tr:()=>true,t:x=>x,updateJournalCounter(){}};
 vm.runInNewContext(slice('function saveJournal(){','function journalDate('),c);
 c.saveJournal();assert.equal(owner.journal.day.text.length,2000);
 const before=JSON.stringify(owner);input.value='extra';c.saveJournal();assert.equal(JSON.stringify(owner),before);assert.equal(input.value,'extra');
});
