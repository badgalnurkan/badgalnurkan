'use strict';
const IYCloud=(()=>{
 let handle=null,status='idle',timer=0,checkFlight=null;
 const snapshot=a=>{const d=JSON.parse(JSON.stringify(a));d.pw='';delete d.salt;delete d.iyduSyncVersion;return d};
 const logical=a=>{const d=JSON.parse(JSON.stringify(a||{}));delete d.iyduSyncVersion;return d};
 const current=h=>handle===h&&sbSession()?.user?.id===h.uid;
 const matches=h=>current(h)&&A?.authUid===h.uid;
 const memory=new Map();
 const temporary={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
 function tabId(){
   try{const k='iydu.sync.tab.v2';let id=sessionStorage.getItem(k);if(!id){id=crypto.randomUUID();sessionStorage.setItem(k,id)}return id}catch{return crypto.randomUUID()}
 }
 function stop(){const uid=handle?.uid;handle=null;status='idle';clearTimeout(timer);IYOfflinePad.forget(uid);document.getElementById('sync-details')?.remove()}
 function statusText(){
   if(!handle)return '';
   if(!handle.durable)return tr()?'Kalıcı cihaz depolaması kullanılamıyor.':'Device storage is unavailable.';
   if(status==='conflict')return tr()?'İki sürümü incele':'Review two versions';
   if(status==='unsafe')return tr()?'Cihaz kaydını kontrol et':'Check device storage';
   if(status==='other-pending')return tr()?'Diğer sekmede kayıt var':'Another tab has saved edits';
   if(status==='offline'||!navigator.onLine)return tr()?'Çevrimdışı · bu cihazda':'Offline · on this device';
   if(status==='pending'||status==='remote-pending')return tr()?'Eşitleme bekliyor':'Waiting to sync';
   return tr()?'Eşitleme':'Sync';
 }
 function badge(){
   const el=document.getElementById('sync-status');if(!el)return;el.textContent=statusText();
   el.hidden=!handle||!matches(handle)||(status==='synced'&&handle.durable&&navigator.onLine&&!IYOfflinePad.list(handle.uid).length);el.dataset.state=status;
 }
 function readCloud(h){if(!current(h))throw Error('ACCOUNT_CHANGED');return sbPull().then(d=>{if(!current(h))throw Error('ACCOUNT_CHANGED');return logical(d)})}
 function createEngine(h,id,secondary=false){
   return IYSync.create({uid:h.uid,tabId:id,storage:h.storage,load:()=>readCloud(h),
     cas:async(expected,next)=>{
       if(!matches(h)||next.authUid!==h.uid)throw Error('ACCOUNT_CHANGED');
       const run=()=>sb('/rest/v1/rpc/iydu_sync_profile',{method:'POST',body:{p_expected_data:expected,p_data:next}});
       try{return await run()===true}catch(e){if(e.status!==401||!await sbRefresh()||!matches(h))throw e;return await run()===true}
     },
     onRemote:d=>secondary?true:applyCloud(h,d),
     onStatus:s=>{if(current(h)&&!secondary){status=s;badge()}}
   });
 }
 function start(uid,remote){
   const storage=store(),h={uid,storage:storage||temporary,durable:!!storage,id:tabId()};
   handle=h;checkFlight=null;h.engine=createEngine(h,h.id);
   const pending=h.engine.initialize(logical(remote));status=h.engine.getStatus();IYOfflinePad.remember(uid);if(pending?.authUid&&pending.authUid!==uid)throw Error('CLOUD_PROFILE_IDENTITY_MISMATCH');return pending;
 }
 function applyCloud(h,d){
   if(!matches(h))return false;
   if(IYSync.equal(snapshot(A),d))return true;
   const active=document.activeElement;
   if(active?.matches('textarea,input:not([type="button"]),select')||document.querySelector('.modal:not(.is-closing)'))return false;
   if(!d.u||d.authUid&&d.authUid!==h.uid)return false;
   const next=norm(JSON.parse(JSON.stringify(d))),old=A.u;
   if(DB.accounts[next.u]&&DB.accounts[next.u].authUid!==h.uid)return false;
   next.authUid=h.uid;next.accountOrigin='cloud';next.pw='';delete next.salt;
   next.email=A.email;next.mail=A.mail;next.loginMethod=A.loginMethod;
   if(next.u!==old)delete DB.accounts[old];DB.accounts[next.u]=next;DB.lastUser=next.u;A=next;
   setItem(LSK,JSON.stringify(DB));if(view==='app'){applyTheme();renderPage()}badge();return true;
 }
 function enqueue(){
   const h=handle;if(!h||!matches(h))return false;
   return h.engine.enqueue(snapshot(A));
 }
 async function flush(){const h=handle;if(!h||!matches(h)||!navigator.onLine)return false;return h.engine.flush()}
 function importPad(h){
   if(!matches(h))return;
   const entries=IYOfflinePad.list(h.uid);let added=false;
   for(const e of entries){if(h.engine.getBase()?.offlineDraftIds?.[e.id]){IYOfflinePad.remove(h.uid,e.id);continue}
     if(IYOfflinePad.apply(A,e)==='added')added=true;
   }
   if(added){save();if(view==='app'&&!document.activeElement?.matches('input,textarea,select'))renderPage()}
 }
 async function check(){
   const h=handle;if(!h||!matches(h)||document.hidden||!navigator.onLine)return;
   if(checkFlight)return checkFlight;
   const work=(async()=>{try{
     if(h.durable)importPad(h);await h.engine.refresh();if(matches(h)&&h.durable)importPad(h);
   }catch{if(current(h)){status='offline';badge()}}})();
   checkFlight=work;try{await work}finally{if(checkFlight===work)checkFlight=null}
 }
 function afterEntry(){clearTimeout(timer);timer=setTimeout(()=>{badge();check()},50)}
 function renderDetails(){
   const h=handle;if(!h||!matches(h))return;
   document.getElementById('sync-details')?.remove();
   const issue=h.engine.conflict(),pad=h.durable?IYOfflinePad.list(h.uid):[],others=h.engine.orphaned();
   const dump=v=>esc(typeof v==='string'?v:JSON.stringify(v,null,2)??'—');
   const at=(v,path)=>path.split('.').reduce((obj,k)=>obj?.[k],v);
   const diff=issue?issue.paths.map(path=>`<article><b>${esc(path)}</b><p>${tr()?'Bu cihaz':'This device'}</p><pre>${dump(at(issue.local,path))}</pre><p>${tr()?'Bulut':'Cloud'}</p><pre>${dump(at(issue.remote,path))}</pre></article>`).join(''):'';
   const blocked=pad.filter(e=>e.kind==='note'&&!A.offlineDraftIds?.[e.id]&&A.future?.[e.day]&&A.future[e.day]!==e.text);
   const rows=blocked.map(e=>`<article><p>${esc(e.day)} · ${esc(e.text)}</p><label>${tr()?'Bu tarihte not var. Başka tarih seç':'A note exists on this date. Pick another date'} <input type="date" data-entry="${esc(e.id)}"></label></article>`).join('');
   openModal('sync-details',`<h2>${tr()?'Eşitleme':'Sync'}</h2><p role="status">${esc(statusText())}</p>${diff}${issue?`<div class="row"><button data-resolve="local">${tr()?'Çakışanlarda cihazdakini kullan':'Use device values for conflicts'}</button><button class="g" data-resolve="cloud">${tr()?'Çakışanlarda buluttakini kullan':'Use cloud values for conflicts'}</button></div>`:''}${rows}${others.map((e,i)=>`<button class="g" data-other="${i}">${tr()?'Başka sekmedeki taslağı kurtar':'Recover draft from another tab'}</button>`).join('')}<button class="g" onclick="closeModal('sync-details')">${tr()?'Kapat':'Close'}</button>`);
   const modal=document.getElementById('sync-details');modal._owner=h.uid;
   modal.querySelectorAll('[data-resolve]').forEach(b=>{b.onclick=async()=>{if(!matches(h))return;modal.remove();try{await h.engine.resolveFields(b.dataset.resolve==='local')}catch{}if(matches(h))renderDetails()}});
   modal.querySelectorAll('[data-entry]').forEach(input=>{input.onchange=()=>{if(!matches(h)||!validProgressDate(input.value)||A.future?.[input.value])return;const e=blocked.find(e=>e.id===input.dataset.entry);if(!e)return;IYOfflinePad.put({...e,day:input.value});modal.remove();check();badge()}});
   modal.querySelectorAll('[data-other]').forEach(b=>{b.onclick=async()=>{
     if(!matches(h))return;const orphan=others[Number(b.dataset.other)];if(!orphan)return;
     const old=createEngine(h,orphan.tabId,true);modal.remove();
     try{old.initialize(await readCloud(h));await old.flush();if(old.conflict()){
       const choice=window.confirm(tr()?'İki sürüm var. Önceki sekmenin çakışan değerleri kullanılsın mı? İptal edersen iki kopya saklanır.':'Use the older tab’s conflicting values? Cancelling keeps both copies.');
       if(choice&&matches(h))await old.resolveFields(true);
     }await check()}catch{}if(matches(h))renderDetails();
   }});
 }
 window.addEventListener('online',check);window.addEventListener('offline',badge);
 window.addEventListener('focus',check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
 document.addEventListener('focusout',()=>{if(status==='remote-pending')setTimeout(check,0)});
 return {start,stop,enqueue,flush,check,afterEntry,renderDetails,badge,owns:uid=>!!handle&&handle.uid===uid,cached:uid=>!!handle&&handle.uid===uid&&handle.durable};
})();
if('serviceWorker' in navigator&&['/','/index.html'].includes(location.pathname)&&window.isSecureContext){
 navigator.serviceWorker.register('/sw.js').catch(()=>{});
}
