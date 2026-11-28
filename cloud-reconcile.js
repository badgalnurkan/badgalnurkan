'use strict';
const IYReconcile=(()=>{
 let work=null,issue=null,timer=0,wait=900;
 const active=uid=>!!uid&&A?.authUid===uid&&sbSession()?.user?.id===uid;
 const text=(a,b)=>tr()?a:b;
 const clone=value=>JSON.parse(JSON.stringify(value));
 function later(delay=900){
  clearTimeout(timer);timer=setTimeout(()=>{timer=0;check()},delay);
 }
 function busy(uid){return work?.uid===uid?work.promise:null}
 function afterEntry(uid){
  if(!active(uid))return;
  IYOfflinePad.remember(uid);
  if('serviceWorker' in navigator&&window.isSecureContext&&['/','/index.html'].includes(location.pathname))navigator.serviceWorker.register('/sw.js').catch(()=>{});
  later(100);
 }
 function release(uid){if(issue?.uid===uid)issue=null;clearTimeout(timer);timer=0;IYOfflinePad.forget(uid);document.getElementById('sync-review')?.remove()}
 function acceptedProfile(uid,remote){
  if(!active(uid)||!remote?.u||remote.authUid!==uid)return false;
  if(cloudContent(A)===cloudContent(remote))return true;
  if(document.activeElement?.matches('input,textarea,select')||document.querySelector('.modal:not(.is-closing)'))return false;
  v13ProtectLegacyCollision(remote.u,uid);
  const old=A.u,next=norm(clone(remote));next.email=A.email;next.mail=A.mail;
  if(next.u!==old)delete DB.accounts[old];
  DB.accounts[next.u]=next;DB.lastUser=next.u;A=next;setItem(LSK,JSON.stringify(DB));
  if(view==='app'){applyTheme();renderPage()}return true;
 }
 // A server-confirmed entry can be acknowledged independently of rendering.
 // Never delete a local entry using an unverified account or local-only marker.
 function acknowledgePad(uid,remote){
  if(!active(uid)||remote?.authUid!==uid)return;
  for(const e of IYOfflinePad.list(uid)){
   if(Object.hasOwn(remote.offlineDraftIds||{},e.id)&&remote.offlineDraftIds[e.id]===true)IYOfflinePad.remove(uid,e.id);
  }
 }
 function importPad(uid,remote){
  acknowledgePad(uid,remote);
  let added=false;
  for(const e of IYOfflinePad.list(uid)){
   if(IYOfflinePad.apply(A,e)==='added')added=true;
  }
  if(added){save();if(view==='app'&&!document.activeElement?.matches('input,textarea,select')&&!document.querySelector('.modal:not(.is-closing)'))renderPage()}
  return added;
 }
 async function reconcile(uid,choice){
  if(!active(uid)||document.hidden||!navigator.onLine)return false;
  let latest=await sbPull(false)||{};
  if(!active(uid))return false;
  // Drain historical snapshots before creating a new snapshot from the offline pad.
  // Otherwise two snapshots with the same stale base can conflict with each other.
  acknowledgePad(uid,latest);
  if(!cloudDraftEntries(uid).length)importPad(uid,latest);
  const display=cloudContent(A);
  const previous=cloudBaselines.get(uid);
  if(!cloudDraftEntries(uid).length&&previous&&display!==cloudContent(JSON.parse(previous))){
   if(!cloudStageDraft(A))return false;
  }
  for(let i=0;i<20;i++){
   if(!active(uid))return false;
   const entries=cloudDraftEntries(uid),entry=entries[0];
   if(!entry){
    if(cloudContent(A)!==display){later();return false}
    if(Object.keys(latest).length&&!acceptedProfile(uid,latest)){later(2500);return false}
    cloudBaselines.set(uid,JSON.stringify(latest));cloudBlockedDrafts.delete(uid);cloudRecoveredDrafts.delete(uid);issue=null;
    const imported=importPad(uid,latest);wait=900;
    if(imported){later(0);return false}
    return true;
   }
   const result=cloudMergeDraft(entry.base,entry.profile,latest);
   let next=result.merged;
   if(result.conflicts.length){
    if(!choice||choice.uid!==uid||choice.key!==entry.key||!IYProfileMerge.equal(latest,choice.remote)){
     issue={uid,key:entry.key,local:entry.profile,remote:clone(latest),paths:result.conflicts};
     if(!cloudBlockedDrafts.has(uid))cloudOwnDrafts.delete(uid);
     cloudBlockedDrafts.add(uid);return false;
    }
    next=cloudMergeDraft(entry.base,entry.profile,latest,path=>choice.local.has(path)).merged;
    // Keep both exact versions before acknowledging an explicit decision.
    const backup='iydu.resolved.v1.'+uid+'.'+rndHex(16);
    const raw=JSON.stringify({base:entry.base,profile:entry.profile,cloud:latest,at:Date.now()});
    localStorage.setItem(backup,raw);if(localStorage.getItem(backup)!==raw)throw Error('Storage write failed');
    choice=null;
   }
   if(!active(uid)||localStorage.getItem(entry.key)===null)continue;
   if(next.authUid!==uid)throw Error('Account identity changed');
   if(cloudContent(next)!==cloudContent(latest)){
    const accepted=await sb('/rest/v1/rpc/iydu_sync_profile',{method:'POST',body:{p_expected_data:latest,p_data:cloudProfilePayload(next)}});
    if(!accepted){later();return false}
    if(!active(uid))return false;
    latest=await sbPull(false)||{};
    if(!active(uid))return false;
    acknowledgePad(uid,latest);
   }
   cloudRemoveDraft(entry.key);
   if(localStorage.getItem(entry.key)!==null)throw Error('Draft acknowledgement failed');
   if(cloudOwnDrafts.get(uid)===entry.key)cloudOwnDrafts.delete(uid);
  }
  later();return false;
 }
 function check(choice=null){
  const uid=A?.authUid;if(!active(uid))return Promise.resolve(false);
  if(work?.uid===uid)return work.promise;
  const task={uid};
  task.promise=(async()=>{try{
   const sending=cloudPushInFlight.get(uid);if(sending)await sending;
   if(!active(uid))return false;
   return await reconcile(uid,choice);
  }catch{if(active(uid)&&navigator.onLine){later(wait);wait=Math.min(60000,wait*2)}return false}
  finally{if(work===task)work=null}})();
  work=task;return task.promise;
 }
 const dateGroup=['day','tasks','completedBatches','hist','plans','backlog','backlogArchive'];
 const labels={
  day:['Günlük kayıtlar','Daily entries'],tasks:['Bugünkü görevler','Today’s tasks'],
  completedBatches:['Tamamlanan görevler','Completed tasks'],hist:['Geçmiş görevler','Past tasks'],
  plans:['Planlanan görevler','Planned tasks'],backlog:['Birikim','Backlog'],backlogArchive:['Birikim arşivi','Backlog archive'],
  journal:['Günlük','Journal'],future:['Geleceğe notlar','Future notes'],futureMeta:['Not tarihleri','Note dates'],
  timedArchive:['Not ve hatırlatma arşivi','Notes and reminders archive'],notes:['Notlar','Notes'],
  projects:['Projeler','Projects'],presets:['Pomodoro süreleri','Pomodoro presets'],pomo:['Pomodoro sayacı','Pomodoro timer'],
  focusHistory:['Odak oturumları','Focus sessions'],stopwatch:['Kronometre','Stopwatch'],laps:['Turlar','Laps'],
  qs:['Rapor yanıtları','Report answers'],planningQs:['Rapor planları','Report plans'],annualReports:['Yıllık özet','Annual summary'],
  answers:['Yanıtlar','Answers'],notificationPrefs:['Bildirim tercihleri','Notification preferences'],
  notifications:['Bildirimler','Notifications'],theme:['Tema','Theme'],nick:['Görünen ad','Display name'],
  bio:['Hakkında','Bio'],u:['Kullanıcı adı','Username'],taskOrder:['Görev sıralaması','Task order'],
  fog:['Geçmiş gün görünümü','Past days display'],
 };
 const dateLabel=day=>{
  const monthOnly=day.length===7,date=monthOnly?day+'-01':day;
  return date.length===10&&Number.isFinite(Date.parse(date+'T12:00:00+03:00'))?reportDateLabel(date,monthOnly):day;
 };
 const heading=path=>{
  const [key,...parts]=path.split('.');
  const dates=parts.filter(part=>/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(part)).map(dateLabel);
  return [text(...(Object.hasOwn(labels,key)?labels[key]:['Hesap ayarı','Account setting'])),...dates].join(' · ');
 };
 const field=(value,path)=>path==='$'?value:path.split('.').reduce((parent,key)=>Object.hasOwn(parent||{},key)?parent[key]:undefined,value);
 const privateFields=new Set(['authUid','user_id','id','qid','pw','salt','email','mail','phone','updatedAt','createdAt','archivedAt','submittedAt','iyduSyncVersion','offlineDraftIds']);
 function readable(value,group,depth=0){
  if(value==null||value==='')return '';
  if(typeof value==='boolean')return esc(value?text('Açık','On'):text('Kapalı','Off'));
  if(typeof value==='string'||typeof value==='number')return '<span class="sync-entry-text">'+esc(String(value))+ '</span>';
  if(depth>8)return '';
  const list=entries=>entries.length?'<ul>'+entries.map(item=>'<li>'+item+'</li>').join('')+'</ul>':'';
  if(Array.isArray(value))return list(value.map(item=>readable(item,group,depth+1)).filter(Boolean));
  if(Number.isFinite(value.w)&&Number.isFinite(value.b)){
   return esc(fmtDuration(value.w)+' '+t('focus')+' / '+fmtDuration(value.b)+' '+t('break'));
  }
  const title=value.t||value.text||value.title||value.n||value.q;
  if(typeof title==='string'&&title.trim()){
   const task=['tasks','hist','completedBatches'].includes(group)||value.s==='done'||value.s==='miss'||typeof value.done==='boolean';
   const status=task?taskStatus(value):'';
   const label=status==='done'?t('done'):status==='miss'?t('notDone'):t('notYetDone');
   const recordDate=value.d||value.key;
   return readable(title,group,depth+1)+(status?' <small>· '+esc(label)+'</small>':'')
    +(typeof recordDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(recordDate)?' <small>· '+esc(dateLabel(recordDate))+'</small>':'')
    +(typeof value.a==='string'&&value.a?'<div>'+readable(value.a,group,depth+1)+'</div>':'')
    +(Array.isArray(value.tasks)?readable(value.tasks,'tasks',depth+1):'');
  }
  if(Number.isFinite(value.at)&&Number.isFinite(value.seconds)&&Math.abs(value.at)<=8640000000000000){
   return esc(dateLabel(istanbulDayKey(new Date(value.at)))+' · '+clk(value.seconds*1000));
  }
  return list(Object.entries(value).filter(([key])=>!privateFields.has(key)).flatMap(([key,entry])=>{
   const details=readable(entry,Object.hasOwn(labels,key)?key:group,depth+1);
   if(!details)return [];
   const label=Object.hasOwn(labels,key)||/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(key);
   return [label?'<b>'+esc(heading(Object.hasOwn(labels,key)?key:group+'.'+key))+'</b> '+details:details];
  }));
 }
 function preview(value,path){
  if(value===undefined)return '<p class="mut">'+text('Kaldırılmış','Removed')+'</p>';
  const rendered=readable(value,path.split('.')[0]);
  if(rendered)return rendered;
  const empty=value===null||value===''||typeof value==='object'&&!Object.keys(value).length;
  return '<p class="mut">'+(empty?text('Kayıt yok','No entries'):text('Kayıt ayrıntıları güncellenmiş','Entry details updated'))+'</p>';
 }
 function show(){
  const uid=A?.authUid;if(!active(uid))return;
  document.getElementById('sync-review')?.remove();
  const old=issue?.uid===uid?issue:null;
  const grouped=old?.paths.includes('day');
  const backlogGrouped=!grouped&&old?.paths.includes('backlog')&&old.paths.includes('backlogArchive');
  const paths=old?old.paths.filter(p=>(!grouped||p==='day'||!dateGroup.includes(p.split('.')[0]))&&(!backlogGrouped||p!=='backlogArchive')):[];
  const value=(doc,path)=>grouped&&path==='day'?Object.fromEntries(dateGroup.map(k=>[k,doc[k]])):backlogGrouped&&path==='backlog'?{backlog:doc.backlog,backlogArchive:doc.backlogArchive}:field(doc,path);
  const rows=paths.map((path,i)=>`<fieldset><legend>${esc(heading(path))}</legend><div class="sync-option-list">${[
   ['device',text('Bu cihazdaki','On this device'),old.local],['cloud',text('Buluttaki','In the cloud'),old.remote],
  ].map(([side,label,doc])=>`<div class="sync-option"><label><input type="radio" name="choice-${i}" value="${side}" required> ${label}</label>${preview(value(doc,path),path)}</div>`).join('')}</div></fieldset>`).join('');
  const padEntries=IYOfflinePad.list(uid);
  const notes=padEntries.filter(e=>e.kind==='note'&&!A.offlineDraftIds?.[e.id]&&A.future?.[e.day]&&A.future[e.day]!==e.text);
  const dates=notes.map((e,i)=>`<article><b>${esc(e.day)}</b><p>${esc(e.text)}</p><label>${text('Bu tarihte başka not var. Bu nota yeni tarih seç.','Another note uses this date. Choose a date for this note.')} <input type="date" data-note="${i}"></label></article>`).join('');
  const pending=cloudDraftEntries(uid).length||padEntries.length;
  const status=!navigator.onLine
    ?text('Çevrimdışısın. Kayıtların bu cihazda saklanıyor.','You are offline. Your entries are stored on this device.')
    :pending?text('Cihazdaki değişiklikler eşitlenmeyi bekliyor.','Changes on this device are waiting to sync.'):text('Bekleyen kayıt yok.','No pending entries.');
  openModal('sync-review',`<h2>${text('Kayıtları eşitle','Sync entries')}</h2><p role="status">${old?text('Her değişiklik için saklamak istediğin sürümü seç.','Choose which version to keep for each change.'):status}</p><form>${rows}${old?`<button type="submit">${text('Seçimlerimi kaydet','Save my choices')}</button>`:''}</form>${dates}<button class="g" data-retry>${text('Eşitlemeyi dene','Retry sync')}</button><button class="g" onclick="closeModal('sync-review')">${t('back')}</button>`);
  const modal=document.getElementById('sync-review');modal.dataset.owner=uid;
  const run=async choice=>{if(!active(uid))return;modal.remove();await check(choice);if(active(uid))show()};
  modal.querySelector('form').onsubmit=e=>{e.preventDefault();if(!old||issue!==old||!active(uid))return;
   const values=new FormData(e.target),local=new Set(paths.filter((_,i)=>values.get('choice-'+i)==='device'));run({...old,local});
  };
  modal.querySelector('[data-retry]').onclick=()=>run(null);
  for(const input of modal.querySelectorAll('[data-note]'))input.onchange=()=>{
   if(!active(uid)||!validProgressDate(input.value)||A.future?.[input.value])return;
   const e=notes[Number(input.dataset.note)];IYOfflinePad.put({...e,day:input.value});run(null);
  };
 }
 window.addEventListener('online',()=>later(0));
 window.addEventListener('focus',()=>later());document.addEventListener('visibilitychange',()=>{if(!document.hidden)later()});
 return {check,later,busy,show,release,afterEntry};
})();
