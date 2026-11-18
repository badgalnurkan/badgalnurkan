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