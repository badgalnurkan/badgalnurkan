'use strict';
const cacheName='iydu-offline-pad-20261124-v1';
const files=['/offline.html','/offline-pad.js','/growing-text.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(cacheName).then(c=>c.addAll(files)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith('iydu-offline-pad-')&&name!==cacheName)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'&&['/','/index.html'].includes(url.pathname)){
   event.respondWith(fetch(request).catch(()=>caches.open(cacheName).then(c=>c.match('/offline.html'))));return;
 }
 if(files.includes(url.pathname)&&!url.search)event.respondWith(fetch(request).catch(()=>caches.open(cacheName).then(c=>c.match(url.pathname))));
});
