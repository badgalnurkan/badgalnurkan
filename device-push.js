/* Improvin' Your Day — optional device push opt-in.
   No subscription is created without a user click and notification permission. */
(function(){
'use strict';
const SW_PATH='/push-sw.js';
let busy=false;
function userId(){return typeof A==='object'&&A?.authUid||null}
function identityMatches(uid){
  return !!uid&&userId()===uid&&typeof sbSession==='function'&&sbSession()?.user?.id===uid;
}
function supportsPush(){
  return !!(window.isSecureContext&&navigator.serviceWorker&&window.PushManager&&window.Notification);
}
function needsHomeScreen(){
  return /iPhone|iPad|iPod/i.test(navigator.userAgent||'')&&!window.matchMedia?.('(display-mode: standalone)')?.matches&&!navigator.standalone;
}
function message(text){
  const el=document.getElementById('device-push-message');
  if(el)el.textContent=text;
}
function wording(trText,enText){return typeof tr==='function'&&tr()?trText:enText}
function settingsMarkup(){
  if(!userId())return '';
  const supported=supportsPush(),ios=needsHomeScreen();
  const help=ios?wording('iPhone/iPad: önce Paylaş > Ana Ekrana Ekle ile uygulamayı yükle, ardından ana ekrandan aç.','iPhone/iPad: add this website to your Home Screen and open it there before enabling notifications.'):
    supported?wording('Bildirim izni yalnızca etkinleştir düğmesine bastığında istenir. Tarayıcı izin vermeli; teslim zamanı cihaz ve işletim sistemine bağlıdır.','Permission is requested only when you enable notifications. Delivery depends on the browser and operating system.'):
    wording('Bu tarayıcıda Web Push desteklenmiyor. Uygulama içi bildirimler çalışmaya devam eder.','Web Push is not available in this browser. In-app reminders still work.');
  return '<section class="card device-push-card" aria-labelledby="device-push-title">'+
    '<h2 id="device-push-title">'+wording('Cihaz bildirimleri','Device notifications')+'</h2>'+
    '<p class="mut">'+help+'</p>'+
    '<div class="row">'+
    '<button type="button" class="g" onclick="IYPush.enable()" '+(!supported||ios?'disabled':'')+'>'+wording('Bu cihazda etkinleştir','Enable on this device')+'</button>'+
    '<button type="button" class="g d" onclick="IYPush.disable()">'+wording('Bu cihazda kapat','Disable on this device')+'</button></div>'+
    '<p class="mut" id="device-push-message" role="status" aria-live="polite">'+wording('Açık olup olmadığını öğrenmek için etkinleştir veya kapat düğmesini kullan.','Use Enable or Disable to update notification access on this device.')+'</p>'+
    '</section>';
}
function b64UrlToBytes(value){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid VAPID public key');
  const normalized=value.replace(/-/g,'+').replace(/_/g,'/');
  const decoded=atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='));
  return Uint8Array.from(decoded,character=>character.charCodeAt(0));
}
async function pushRegistration(create=false){
  if(!navigator.serviceWorker)return null;
  if(create)return navigator.serviceWorker.register(SW_PATH,{scope:'/'});
  return navigator.serviceWorker.getRegistration('/');
}
async function markOwner(uid,create=false){
  if(!navigator.serviceWorker)return false;
  const registration=await pushRegistration(create);
  const worker=registration?.active||registration?.waiting||registration?.installing;
  if(!worker)return false;
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();resolve(false)},4500);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();resolve(event.data?.ok===true)};
    try{worker.postMessage({type:'iydu-push-owner',uid:typeof uid==='string'?uid:''},[channel.port2])}
    catch(_){clearTimeout(timer);channel.port1.close();resolve(false)}
  });
}
async function remoteKey(){
  const response=await fetch(SUPABASE_URL+'/functions/v1/device-push?key=1',{
    headers:{apikey:SUPABASE_KEY},cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw Error('Push key unavailable');
  const data=await response.json();
  if(typeof data?.publicKey!=='string')throw Error('Invalid push key');
  return b64UrlToBytes(data.publicKey);
}
async function saveSubscription(subscription,language){
  const data=subscription?.toJSON?.();
  if(typeof data?.endpoint!=='string'||!data.keys?.auth||!data.keys?.p256dh)
    throw Error('Invalid browser push subscription');
  return sb('/rest/v1/rpc/iydu_set_push',{method:'POST',
    body:{p_endpoint:data.endpoint,p_keys:{p256dh:data.keys.p256dh,auth:data.keys.auth},p_lang:language}});
}
async function enable(){
  if(busy)return;
  const uid=userId();
  if(!identityMatches(uid)){message(wording('Önce bulut hesabına giriş yap.','Sign in to your cloud account first.'));return}
  if(!supportsPush()||needsHomeScreen()){message(wording('Bildirimler bu tarayıcıda kullanılamıyor.','Notifications are unavailable in this browser.'));return}
  // Must be invoked directly from the user's click, before other async work.
  busy=true;
  try{
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted'){message(wording('Bildirim izni verilmedi.','Notification permission was not granted.'));return}
    if(!identityMatches(uid))throw Error('Account changed');
    const registration=await pushRegistration(true);
    await navigator.serviceWorker.ready;
    const publicKey=await remoteKey();
    if(!identityMatches(uid))throw Error('Account changed');
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
    if(!identityMatches(uid)){await subscription.unsubscribe();throw Error('Account changed')}
    const locale=typeof tr==='function'&&tr()?'tr':'en';
    let accepted=await saveSubscription(subscription,locale);
    if(accepted!==true){
      await subscription.unsubscribe();
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
      accepted=await saveSubscription(subscription,locale);
    }
    if(accepted!==true)throw Error('Subscription rejected');
    if(!identityMatches(uid)){await subscription.unsubscribe();throw Error('Account changed')}
    if(!await markOwner(uid))throw Error('Worker not ready');
    message(wording('Bu cihazın aboneliği kaydedildi. Bildirimler iznin ve tarayıcının desteğiyle çalışır.','This device is subscribed. Notification delivery depends on your permission and browser support.'));
  }catch(error){
    console.warn('Device push subscribe failed:',error?.message||error);
    message(wording('Cihaz bildirimi etkinleştirilemedi. Daha sonra tekrar dene.','Device notifications could not be enabled. Try again later.'));
  }finally{busy=false}
}
async function disable(){
  if(busy)return;
  busy=true;
  const uid=userId();
  try{
    await markOwner(null);
    const reg=await pushRegistration();
    const subscription=await reg?.pushManager?.getSubscription();
    if(subscription){
      const endpoint=subscription.endpoint;
      if(identityMatches(uid)){
        try{await sb('/rest/v1/rpc/iydu_set_push',{method:'POST',body:{p_endpoint:endpoint,p_keys:null,p_lang:'tr'}})}
        catch(error){console.warn('Push device deregistration pending:',error?.message||error)}
      }
      await subscription.unsubscribe();
    }
    message(wording('Bu cihazda bildirim aboneliği kapatıldı.','Device notifications were disabled.'));
  }catch(error){
    message(wording('Bildirim aboneliği kapatılamadı; tarayıcı izinlerinden de kapatabilirsin.','Could not disable the subscription. You can also block notifications in browser settings.'));
  }finally{busy=false}
}
function resetScope(){void markOwner(null).catch(()=>{})}
function syncScope(){
  const uid=userId();
  if(identityMatches(uid))void markOwner(uid).catch(()=>{});
}
window.IYPush={settingsMarkup,enable,disable,markOwner,syncScope,resetScope,supportsPush,needsHomeScreen};
document.addEventListener('DOMContentLoaded',syncScope,{once:true});
})();