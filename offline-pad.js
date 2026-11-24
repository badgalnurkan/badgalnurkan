'use strict';
const IYOfflinePad=(()=>{
 const marker='iydu.offline.owner.v1',prefix='iydu.offline.entry.v1.';
 function owner(){try{return sessionStorage.getItem(marker)||localStorage.getItem(marker)||''}catch{return ''}}
 function remember(uid){try{sessionStorage.setItem(marker,uid);localStorage.setItem(marker,uid)}catch{}}
 function forget(uid){try{sessionStorage.removeItem(marker);if(!uid||localStorage.getItem(marker)===uid)localStorage.removeItem(marker)}catch{}}
 function prepareReturn(uid){try{if(uid&&uid===owner())sessionStorage.setItem('iydu.offline.return.v1',uid)}catch{}}
 function takeReturn(){try{const id=sessionStorage.getItem('iydu.offline.return.v1');sessionStorage.removeItem('iydu.offline.return.v1');return id===owner()?id:null}catch{return null}}
 function key(uid,id){return prefix+uid+'.'+id}
 function list(uid){
   if(!uid)return [];
   const result=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(!k?.startsWith(prefix+uid+'.'))continue;
     try{const e=JSON.parse(localStorage.getItem(k));if(e.uid===uid&&k===key(uid,e.id))result.push(e)}catch{}
   }
   return result.sort((a,b)=>a.at-b.at);
 }
 function put(e){const raw=JSON.stringify(e);localStorage.setItem(key(e.uid,e.id),raw);if(localStorage.getItem(key(e.uid,e.id))!==raw)throw Error('SAVE_FAILED')}
 function remove(uid,id){localStorage.removeItem(key(uid,id))}
 function newEntry(uid,kind,day,text){
   text=String(text||'').trim();const limit=kind==='task'?120:500;
   if(!uid||!['task','note'].includes(kind)||!text||text.length>limit||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('INVALID_DRAFT');
   const stamp=Date.parse(day+'T00:00Z');if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==day)throw Error('INVALID_DATE');
   const entry={uid,id:crypto.randomUUID(),kind,day,text,at:Date.now()};put(entry);return entry;
 }
 function apply(account,e){
   if(account.authUid!==e.uid)return 'owner';
   if(account.offlineDraftIds?.[e.id])return 'already';
   if(e.kind==='note'){
     if(account.future?.[e.day]&&account.future[e.day]!==e.text)return 'conflict';
     (account.future||={})[e.day]=e.text;
     const created=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(e.at);
     (account.futureMeta||={})[e.day]={...(account.futureMeta?.[e.day]||{}),createdAt:e.at,...(e.day>=created?{expireAfterDay:e.day}:{})};
   }else if(e.kind==='task'){
     const task={id:e.id,t:e.text,s:'',createdAt:e.at};
     if(e.day===account.day)(account.tasks||=[]).push(task);
     else if(e.day<account.day){
       ((account.hist||={})[e.day]||=[]).push({...task,done:false});
       if((account.backlog||=[]).length<10)account.backlog.push(e.text);
     }else ((account.plans||={})[e.day]||=[]).push(e.text);
   }else return 'invalid';
   (account.activeDays||={})[new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(e.at)]=true;
   (account.offlineDraftIds||={})[e.id]=true;return 'added';
 }
 return {owner,remember,forget,prepareReturn,takeReturn,list,newEntry,apply,put,remove};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=IYOfflinePad;
if(typeof document!=='undefined'&&document.querySelector('#offline-entry')){
 const form=document.querySelector('#offline-entry'),message=document.querySelector('#pad-status'),uid=IYOfflinePad.owner();
 let turkish=true;try{turkish=JSON.parse(localStorage.getItem('b1')||'{}').lang!=='en'}catch{}
 const tr=(a,b)=>turkish?a:b;
 document.documentElement.lang=turkish?'tr':'en';
 document.querySelectorAll('[data-en]').forEach(el=>{if(!turkish)el.textContent=el.dataset.en});
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul'}).format(new Date());form.elements.day.value=today;
 if(!uid){form.querySelector('fieldset').disabled=true;message.textContent=tr('Bu cihazda çevrimiçi giriş yaptıktan sonra çevrimdışı kayıt açılır.','Sign in online on this device first to enable offline entry.')}
 form.elements.kind.onchange=()=>{form.elements.body.maxLength=form.elements.kind.value==='task'?120:500};
 form.onsubmit=event=>{event.preventDefault();try{
   if(uid!==IYOfflinePad.owner())throw Error('OWNER');
   IYOfflinePad.newEntry(uid,form.elements.kind.value,form.elements.day.value,form.elements.body.value);form.elements.body.value='';
   message.textContent=tr('Bu cihazda saklandı. Aynı hesapla bağlantı kurulduğunda eşitlenecek.','Saved on this device. It will sync when this account reconnects.');
 }catch{message.textContent=tr('Kayıt saklanamadı. Metnin yazı alanında duruyor.','Could not save. Your text is still in the editor.')}};
 document.querySelector('a[href="/"]').addEventListener('click',()=>{if(navigator.onLine)IYOfflinePad.prepareReturn(uid)});
 window.addEventListener('online',()=>{if(!form.elements.body.value.trim()){IYOfflinePad.prepareReturn(uid);location.replace('/')}else message.textContent=tr('Bağlantı geri geldi. Metnini kaydettikten sonra uygulamaya dön.','Back online. Save your draft before returning to the app.')});
}
