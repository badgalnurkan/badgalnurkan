'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../email-change-otp.js'),'utf8');
const UID='ab000000-0000-4000-8000-000000000011';
const OLD='owner@example.invalid',NEW='updated@example.invalid';
function fixture(){
 let requestCount=0,verified=new Set(),user={id:UID,email:OLD,email_confirmed_at:'2026-11-19'};
 const log=[],nodes=new Map();
 const context={
  window:{},DB:{lang:'tr'},esc:String,
  document:{
   getElementById:id=>nodes.get(id)||null,
   querySelectorAll:()=>[]
  },
  sbSession:()=>({access_token:'mock-jwt-for-tests',user:{id:UID}}),
  sbCurrentUser:async()=>user,
  sbSave:s=>log.push(['save',s.user?.id]),
  sb:async (endpoint,config)=>{
   assert.equal(endpoint,'/auth/v1/verify');
   assert.equal(config.method,'POST');
   assert.equal(config.body.type,'email_change');
   requestCount++;
   const email=config.body.email,token=config.body.token;
   assert.match(token,/^[0-9]{6}$/);
   if(email===OLD&&token==='111111')verified.add('old');
   else if(email===NEW&&token==='222222')verified.add('new');
   else throw Error('INVALID_CHALLENGE');
   if(verified.has('old')&&verified.has('new'))user={id:UID,email:NEW,email_confirmed_at:'2026-11-20'};
   return {user:{id:UID}};
  },
  openModal:(name,html)=>{
   log.push(['open',name,html]);
   for(const id of ['email-change-old-code','email-change-new-code','email-change-otp-status']){
    nodes.set(id,{value:'',textContent:''});
   }
  },
  closeModal:name=>log.push(['close',name]),
  toast:message=>log.push(['toast',message]),
  IYAccount:{refresh:async()=>log.push(['refresh'])}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {api:context.window.IYEmailChange,log,nodes,get count(){return requestCount},get user(){return user}};
}
test('starting same-browser email change is strictly scoped to owner and distinct addresses',()=>{
 const f=fixture();
 assert.equal(f.api.start({uid:'different',oldEmail:OLD,newEmail:NEW}),false);
 assert.equal(f.api.start({uid:UID,oldEmail:OLD,newEmail:OLD}),false);
 assert.equal(f.log.length,0);
 assert.equal(f.api.start({uid:UID,oldEmail:OLD,newEmail:NEW}),true);
 assert.ok(f.log.some(x=>x[0]==='open'));
});
test('neither first mailbox OTP nor local state claims an email change before server does',async()=>{
 const f=fixture();
 f.api.start({uid:UID,oldEmail:OLD,newEmail:NEW});
 f.nodes.get('email-change-old-code').value='111111';
 assert.equal(await f.api.verify('old'),true);
 assert.equal(f.count,1);
 assert.equal(f.user.email,OLD);
 assert.equal(f.log.some(x=>x[0]==='toast'),false);
 assert.equal(f.nodes.get('email-change-old-code').value,'','OTP must be cleared after use');
 assert.match(f.nodes.get('email-change-otp-status').textContent,/diğer adresin onayı/);
 f.nodes.get('email-change-new-code').value='222222';
 assert.equal(await f.api.verify('new'),true);
 assert.equal(f.count,2);
 assert.equal(f.user.email,NEW);
 assert.ok(f.log.some(x=>x[0]==='refresh'));
 assert.ok(f.log.some(x=>x[0]==='toast'));
});
test('invalid numeric input is rejected before any network call',async()=>{
 const f=fixture();f.api.start({uid:UID,oldEmail:OLD,newEmail:NEW});
 for(const code of ['','123','1234567','hello!']){
  f.nodes.get('email-change-new-code').value=code;
  assert.equal(await f.api.verify('new'),false);
 }
 assert.equal(f.count,0);
});
test('a rejected proof does not change identity or falsely confirm the mailbox',async()=>{
 const f=fixture();f.api.start({uid:UID,oldEmail:OLD,newEmail:NEW});
 f.nodes.get('email-change-new-code').value='999999';
 assert.equal(await f.api.verify('new'),false);
 assert.equal(f.count,1);
 assert.equal(f.user.email,OLD);
 assert.equal(f.log.some(x=>x[0]==='toast'),false);
 assert.match(f.nodes.get('email-change-otp-status').textContent,/Kod doğrulanamadı/);
});
test('closing confirmation panel never performs a data mutation',()=>{
 const f=fixture();f.api.start({uid:UID,oldEmail:OLD,newEmail:NEW});
 f.api.cancel();
 assert.equal(f.count,0);
 assert.equal(f.log.filter(x=>x[0]==='close').length,1);
});
