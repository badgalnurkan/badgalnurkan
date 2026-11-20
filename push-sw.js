/* Improvin' Your Day — account-scoped, privacy-preserving push worker */
'use strict';
const DB_NAME='iydu-push-device-v1';
function db(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('config');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function readOwner(){
  const conn=await db();
  try{return await new Promise((resolve,reject)=>{
    const transaction=conn.transaction('config','readonly');
    const request=transaction.objectStore('config').get('owner');
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error);
  })}finally{conn.close()}
}
async function writeOwner(uid){
  const conn=await db();
  try{return await new Promise((resolve,reject)=>{
    const transaction=conn.transaction('config','readwrite');
    transaction.objectStore('config').put(uid||null,'owner');
    transaction.oncomplete=()=>resolve(true);
    transaction.onerror=()=>reject(transaction.error);
  })}finally{conn.close()}
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='iydu-push-owner')return;
  const uid=typeof event.data.uid==='string'&&/^[a-f0-9-]{36}$/i.test(event.data.uid)?event.data.uid:null;
  event.waitUntil(writeOwner(uid).then(()=>{
    event.ports?.[0]?.postMessage({ok:true});
  }).catch(()=>event.ports?.[0]?.postMessage({ok:false})));
});
function presentation(kind,lang){
  const tr=lang==='tr';
  switch(kind){
    case 'tasks':return tr?['Küçük bir hatırlatma','Bugünkü planına göz atmak ister misin?']:['A gentle reminder','Ready to check today’s plan?'];
    case 'project':return tr?['Proje hatırlatması','Projene göz atma zamanı.']:['Project reminder','Time to check your project.'];
    case 'morning':return tr?['Günaydın!','Bugün için küçük bir adımla başlayabilirsin.']:['Good morning!','Start the day with one small step.'];
    case 'evening':return tr?['Günün nasıl geçti?','Kendine ayırdığın küçük anları hatırla.']:['A little evening check-in','Take a moment to reflect on your day.'];
    case 'pomo-five':return tr?['Molaya az kaldı','Beş dakika sonra kısa bir mola verebilirsin.']:['Almost break time','Five minutes until a short break.'];
    case 'pomo-break':return tr?['Mola zamanı','Odak oturumun tamamlandı. Biraz dinlen.']:['Break time','Focus session complete. Enjoy a little rest.'];
    case 'pomo-focus':return tr?['Yeniden odaklanma zamanı','Yeni bir çalışma aralığına başlayabilirsin.']:['Focus time again','Ready for another focus session?'];
    case 'study':case 'focus':case 'pomo':return tr?['Odaklanma zamanı','Küçük bir çalışma adımı ile başlayabilirsin.']:['Time to focus','Start with a small study step.'];
    case 'daily':case 'motivation':return tr?['Bugün için küçük bir adım','Kendin için ayırdığın zamanı hatırla.']:['One small step today','Remember the time you set aside for yourself.'];
    default:return null;
  }
}
self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    let payload;
    try{payload=event.data?.json()}catch{return}
    if(!payload||typeof payload!=='object'||typeof payload.owner!=='string')return;
    const current=await readOwner().catch(()=>null);
    if(!current||current!==payload.owner)return;
    const pair=presentation(payload.kind,payload.lang);
    if(!pair)return;
    const tag='iydu-'+String(payload.id||payload.kind).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70);
    await self.registration.showNotification(pair[0],{
      body:pair[1],tag,icon:'/app-icon.svg',badge:'/app-icon.svg',
      data:{path:'/'},renotify:false
    });
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL('/',self.location.origin).href;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin);
    if(existing){await existing.focus();return}
    await self.clients.openWindow(url);
  })());
});