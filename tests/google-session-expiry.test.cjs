'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','browser-verification.js'),'utf8');
const id='ab000000-0000-4000-8000-000000000011';
function jwt(method,ageMinutes){
 const payload={sub:id,role:'authenticated',
  session_id:'ac100000-0000-4000-8000-000000000011',
  amr:method?[{method,timestamp:Math.floor(Date.now()/1000-ageMinutes*60)}]:undefined};
 return ['header',Buffer.from(JSON.stringify(payload)).toString('base64url'),'signature'].join('.');
}
function fixture(method,ageMinutes){
 const session={access_token:jwt(method,ageMinutes),user:{id}};
 const log=[];
 const context={
  window:{addEventListener(){}},document:{addEventListener(){},querySelectorAll(){return []}},
  setInterval(){},atob:globalThis.atob,
  sbSession(){return session},sbClear(){log.push('clear')},
  closeModal(){log.push('close')},
  renderAppOrAuth(){log.push('render')},
  toast(x){log.push(['toast',x])},
  tr(){return true},A:{authUid:id},view:'app',pg:'home'
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,log,api:context.window.IYBrowserGate};
}
test('fresh signed OAuth method keeps active application session',()=>{
 const x=fixture('oauth',29);
 assert.equal(x.api.enforceSessionLifetime(),true);
 assert.equal(x.log.length,0);
 assert.equal(x.context.view,'app');
});
test('Google OAuth signs out local session after the 30-minute mark',()=>{
 const x=fixture('oauth',31);
 assert.equal(x.api.enforceSessionLifetime(),false);
 assert.equal(x.context.view,'login');
 assert.equal(x.context.A,null);
 assert.deepEqual(x.log.slice(0,3),['close','clear','render']);
});
test('password session remains available after thirty minutes',()=>{
 const x=fixture('password',75);
 assert.equal(x.api.oauthExpiry(),null);
 assert.equal(x.api.enforceSessionLifetime(),true);
 assert.equal(x.log.length,0);
});
test('missing optional AMR does not impersonate OAuth; server still checks persisted session method',()=>{
 const x=fixture(null,75);
 assert.equal(x.api.oauthExpiry(),null);
 assert.equal(x.api.enforceSessionLifetime(),true);
 assert.equal(x.log.length,0);
});
