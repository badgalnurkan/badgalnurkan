'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','device-push.js'),'utf8');
const markup=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sw=fs.readFileSync(path.join(__dirname,'..','push-sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'..','manifest.webmanifest'),'utf8'));
const UID='11111111-1111-4111-8111-111111111111';
function fixture(options={}){
 const calls={permission:0,register:0,save:[],send:[],messages:[],unsub:0};
 const values={status:''};
 const subscription={
  endpoint:'https://fcm.googleapis.com/fcm/send/pushfixture',
  toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/pushfixture',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}),
  unsubscribe:async()=>{calls.unsub++;return true}
 };
 let current=options.existingSubscription?subscription:null;
 const worker={postMessage(data,ports){calls.messages.push(data);ports[0].postMessage({ok:true})}};
 const registration={active:worker,pushManager:{
  getSubscription:async()=>current,
  subscribe:async()=>{current=subscription;return subscription}
 }};
 const swApi={
  register:async()=>{calls.register++;return registration},
  getRegistration:async()=>registration,
  ready:Promise.resolve(registration)
 };
 const notification={permission:options.permission||'granted',requestPermission:async()=>{
  calls.permission++;if(options.onPermission)options.onPermission(context);
  return options.permissionResult||'granted'
 }};
 const context={
  window:{isSecureContext:true,PushManager:function(){},Notification:notification,
   matchMedia:()=>({matches:!!options.standalone})},
  navigator:{serviceWorker:swApi,userAgent:options.userAgent||'Mozilla/5.0',standalone:false},
  Notification:notification,
  document:{addEventListener(){},getElementById:id=>id==='device-push-message'?{set textContent(value){values.status=value},get textContent(){return values.status}}:null},
  MessageChannel,Uint8Array,atob,AbortSignal,URL,setTimeout,clearTimeout,console,
  A:{authUid:UID},
  sbSession:()=>({user:{id:UID}}),
  tr:()=>false,
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_KEY:'public-key',
  fetch:async()=>({ok:true,json:async()=>({publicKey:'B'.repeat(87)})}),
  sb:async(_url,options)=>{calls.save.push(options.body);return true}
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,calls,values,subscription};
}
test('PWA manifest identifies the installable app and worker is registered only after user consent',async()=>{
 assert.equal(manifest.id,'/');
 assert.equal(manifest.display,'standalone');
 assert.match(markup,/rel="manifest"/);
 assert.match(markup,/device-push\.js/);
 assert.match(sw,/self\.addEventListener\('push'/);
 const {context,calls}=fixture();
 assert.equal(calls.register,0);
 await context.window.IYPush.enable();
 assert.equal(calls.register,1);
});
test('push subscription is registered with the authenticated account and no task text is transmitted',async()=>{
 const {context,calls,values}=fixture();
 await context.window.IYPush.enable();
 assert.equal(calls.permission,0);
 assert.equal(calls.save.length,1);
 assert.equal(calls.save[0].p_lang,'en');
 assert.equal(calls.save[0].p_endpoint,'https://fcm.googleapis.com/fcm/send/pushfixture');
 assert.deepEqual(Object.keys(calls.save[0].p_keys).sort(),['auth','p256dh']);
 assert.equal(calls.messages.at(-1).uid,UID);
 assert.match(values.status,/subscribed/);
});
test('identity changes during notification consent fail closed before storing subscriptions',async()=>{
 const {context,calls,values}=fixture({permission:'default',onPermission:c=>{c.A={authUid:'another-account'}}});
 await context.window.IYPush.enable();
 assert.equal(calls.register,0);
 assert.equal(calls.save.length,0);
 assert.match(values.status,/could not be enabled/);
});
test('iOS Home Screen install is required before a permission request is attempted',async()=>{
 const {context,calls}=fixture({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
 assert.equal(context.window.IYPush.needsHomeScreen(),true);
 await context.window.IYPush.enable();
 assert.equal(calls.permission,0);
 assert.equal(calls.register,0);
 assert.match(context.window.IYPush.settingsMarkup(),/Home Screen/);
});
test('disabling the device removes its exact endpoint and unsubscribes the browser',async()=>{
 const {context,calls,values}=fixture({existingSubscription:true});
 await context.window.IYPush.disable();
 assert.equal(calls.save.length,1);
 assert.equal(calls.save[0].p_keys,null);
 assert.equal(calls.save[0].p_endpoint,'https://fcm.googleapis.com/fcm/send/pushfixture');
 assert.equal(calls.unsub,1);
 assert.equal(calls.messages[0].uid,'');
 assert.match(values.status,/disabled/);
});
test('worker notification copy never echoes payload text or arbitrary URLs',()=>{
 const events={};
 const workerContext={self:{addEventListener:(name,handler)=>events[name]=handler},indexedDB:{}};
 vm.createContext(workerContext);
 vm.runInContext(sw+'\nthis.presentation=presentation;',workerContext);
 assert.ok(events.push&&events.message&&events.notificationclick);
 assert.deepEqual(Array.from(workerContext.presentation('project','en')),['Project reminder','Time to check your project.']);
 assert.equal(workerContext.presentation('unknown','en'),null);
 assert.equal(sw.includes('payload.body'),false);
});

test('server reminder kinds all render privacy-safe translations',()=>{
 const events={};const ctx={self:{addEventListener:(name,fn)=>events[name]=fn},indexedDB:{}};
 vm.createContext(ctx);vm.runInContext(sw+'\nthis.presenter=presentation;',ctx);
 for(const kind of ['morning','study','tasks','evening','project','pomo-five','pomo-break','pomo-focus']){
   const [title,body]=ctx.presenter(kind,'en')||[];
   assert.ok(title&&body,kind+' should be shown');
   assert.equal(/private title|password|user name/i.test(title+' '+body),false);
 }
});
test('device push worker suppresses events after logout and for another account',async()=>{
 let owner=null;const sent=[],notifications=[],handlers={};
 const database={createObjectStore(){},close(){},transaction(){
   const transaction={};
   transaction.objectStore=()=>({
     put(value){queueMicrotask(()=>{owner=value;transaction.oncomplete?.()})},
     get(){const request={};queueMicrotask(()=>{request.result=owner;request.onsuccess?.()});return request}
   });
   return transaction;
 }};
 const indexedDB={open(){const request={};queueMicrotask(()=>{request.result=database;request.onsuccess?.()});return request}};
 const ctx={indexedDB,self:{
   addEventListener:(name,fn)=>handlers[name]=fn,
   registration:{showNotification:async(title,options)=>notifications.push({title,options})},
   clients:{matchAll:async()=>[],openWindow:async()=>null},
   location:{origin:'https://badgalnurkan.com'}
 }};
 vm.createContext(ctx);vm.runInContext(sw,ctx);
 const message=async uid=>{
   let pending;
   handlers.message({data:{type:'iydu-push-owner',uid},ports:[{postMessage:msg=>sent.push(msg)}],waitUntil:p=>pending=p});
   await pending;
 };
 const push=async payload=>{
   let pending;
   handlers.push({data:{json:()=>payload},waitUntil:p=>pending=p});
   await pending;
 };
 await message(UID);
 assert.equal(sent.at(-1).ok,true);
 await push({owner:'22222222-2222-4222-8222-222222222222',kind:'tasks',id:'other'});
 assert.equal(notifications.length,0,'another account must never show notifications');
 await push({owner:UID,kind:'project',id:'our-project',body:'secret task title'});
 assert.equal(notifications.length,1);
 assert.equal(notifications[0].options.body.includes('secret task title'),false,'notification must not echo server input');
 await message('');
 await push({owner:UID,kind:'study',id:'after-logout'});
 assert.equal(notifications.length,1,'old notifications must be suppressed after logout');
});

test('signed-out users cannot silently subscribe or request notification permission',async()=>{
 const {context,calls,values}=fixture({permission:'default'});
 context.A=null;
 await context.window.IYPush.enable();
 assert.equal(calls.permission,0);
 assert.equal(calls.register,0);
 assert.equal(calls.save.length,0);
 assert.match(values.status,/Sign in/);
});
test('an installed iOS Home Screen web app may explicitly opt into push',async()=>{
 const {context,calls}=fixture({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',standalone:true});
 assert.equal(context.window.IYPush.needsHomeScreen(),false);
 await context.window.IYPush.enable();
 assert.equal(calls.save.length,1);
});
