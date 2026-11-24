/* Daily task suggestions, focus patterns and the account's expired items. */
'use strict';
const IYDayTools=(()=>{
 const suggestions=[
  ['Beş dakika boyunca masanın bir köşesini düzenle.','Spend five minutes clearing one corner of your desk.'],
  ['Bugün öğrendiğin bir şeyi kendi cümlenle yaz.','Write one thing you learned today in your own words.'],
  ['Sevdiğin bir parçanın ilk sekiz sayımını hareketle yorumla.','Move to the first eight counts of a favorite song.'],
  ['Yarım bıraktığın bir işin ilk küçük adımını tamamla.','Finish one small step of an unfinished task.'],
  ['Bir kitaptan iki sayfa oku ve aklında kalan cümleyi yaz.','Read two pages of a book and note one sentence you remember.'],
  ['Bir arkadaşına kısa bir teşekkür mesajı yaz.','Write a short thank-you note to a friend.'],
  ['Pencereden gördüğün bir ayrıntıyı çiz.','Sketch one detail you can see from a window.'],
  ['Yarın için ihtiyacın olacak bir şeyi şimdiden hazırla.','Set aside one thing you will need tomorrow.'],
  ['Sık kullandığın bir dosyayı kolay bulunacak bir yere taşı.','Move a frequently used file somewhere easy to find.'],
  ['On dakika ayırıp merak ettiğin bir sorunun cevabını oku.','Spend ten minutes reading about a question you are curious about.'],
  ['Bir sonraki çalışman için üç maddelik bir kontrol listesi hazırla.','Make a three-item checklist for your next work session.'],
  ['İki dakika sessizce etrafını dinle ve üç sesi not et.','Listen for two minutes and note three sounds around you.']
 ];
 let pool=[],last=-1;
 function suggest(turkish,random=Math.random){
   if(!pool.length){pool=suggestions.map((_,i)=>i);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
     if(pool[pool.length-1]===last)[pool[0],pool[pool.length-1]]=[pool[pool.length-1],pool[0]];
   }
   last=pool.pop();return suggestions[last][turkish?0:1];
 }
 function showSuggestion(){
   const slot=document.getElementById('task-suggestion');if(!slot)return;
   slot.hidden=false;slot.querySelector('span').textContent=suggest(tr());
 }
 function addSuggestion(){
   const text=document.querySelector('#task-suggestion span')?.textContent,field=document.getElementById('nt');
   if(!text||!field)return;
   const manual=field.value;field.value=text;addT();
   const current=document.getElementById('nt');if(current){current.value=manual;fitTextField(current)}
 }
 const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',hourCycle:'h23'});
 function focusPatterns(history,days,start,end){
   const hours=Array(24).fill(0),buckets=Array.from({length:7},()=>({days:0,tasks:0,unfinished:0}));
   let sessions=0;
   for(const r of Array.isArray(history)?history:[]){
     if(!r||r.completed!==true||!Number.isFinite(r.at)||!(r.seconds>0&&r.seconds<=36000))continue;
     let counted=false;
     for(const part of Array.isArray(r.parts)?r.parts:[r]){
       if(!Number.isFinite(part?.at)||!(part.seconds>0&&part.seconds<=36000))continue;
       let pos=Math.max(start,part.at-part.seconds*1000),stop=Math.min(end,part.at);
       while(pos<stop){const next=Math.min(stop,(Math.floor(pos/3600000)+1)*3600000);
         hours[Number(hourFormat.format(new Date(pos)))]+=(next-pos)/1000;pos=next;counted=true;
       }
     }
     if(counted)sessions++;
   }
   for(const [day,tasks] of Object.entries(days||{})){
     const stamp=Date.parse(day+'T00:00:00+03:00');
     if(!Number.isFinite(stamp)||stamp<start||stamp+86400000>end||!Array.isArray(tasks))continue;
     const entries=tasks.filter(t=>String(typeof t==='string'?t:t?.t||t?.text||t?.title||'').trim());
     if(!entries.length)continue;
     const b=buckets[(new Date(day+'T12:00Z').getUTCDay()+6)%7];b.days++;b.tasks+=entries.length;
     b.unfinished+=entries.filter(t=>t?.s!=='done'&&!(t?.s==null&&t?.done===true)).length;
   }
   const peak=hours.indexOf(Math.max(...hours));
   const ranked=buckets.map((x,i)=>({...x,i})).filter(x=>x.unfinished&&x.days).sort((a,b)=>b.unfinished/b.days-a.unfinished/a.days||b.days-a.days||a.i-b.i);
   return {sessions,peak,hours,heavy:ranked[0]||null};
 }
 function focusCard(){
   const now=Date.now(),last=istanbulDayKey(new Date(now)),start=Date.parse(addD(last,-27)+'T00:00:00+03:00');
   const data=focusPatterns(A.focusHistory,A.hist,start,now);
   const hh=n=>String(n%24).padStart(2,'0')+'.00';
   const duration=Math.round(data.hours[data.peak]/60);
   const focus=data.sessions?(tr()?`En çok odak süren ${hh(data.peak)}–${hh(data.peak+1)} arasında: ${duration} dakika. Toplam ${data.sessions} tamamlanmış oturum incelendi.`:`Most recorded focus time fell between ${hh(data.peak)} and ${hh(data.peak+1)}: ${duration} minutes across the hour. The period includes ${data.sessions} completed sessions.`):(tr()?'İlk tamamlanmış Pomodoro oturumunla saat dağılımın görünür.':'Complete a Pomodoro session to see your hours.');
   const h=data.heavy,weekdays=tr()?['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar']:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
   const load=h?(tr()?`Kayıtlı gün başına en çok yarım kalan görev ${weekdays[h.i]} günlerinde. ${h.days} günde ${h.tasks} görevin ${h.unfinished} tanesi yarım kaldı.`:`${weekdays[h.i]} had the most unfinished tasks per recorded day. ${h.unfinished} of ${h.tasks} tasks across ${h.days} days were unfinished.`):(tr()?'Bitmiş günlerde henüz yarım kalmış görev kaydı yok.':'No unfinished tasks recorded on past days yet.');
   return `<section class="card"><h2>${tr()?'Kişisel odak istatistikleri':'Personal focus statistics'}</h2><small class="mut">${tr()?'Son 28 gün · Türkiye saati':'Last 28 days · Istanbul time'}</small><p>${focus}</p><p>${load}</p></section>`;
 }
 function archiveButton(){return `<button type="button" class="g s" onclick="IYDayTools.openArchive()">${tr()?'Arşiv':'Archive'} (${Object.keys(A.timedArchive||{}).length})</button>`}
 function openArchive(){
   const owner=A;if(!owner)return;document.getElementById('timed-archive')?.remove();
   const entries=Object.entries(A.timedArchive||{}).filter(([,e])=>e&&['note','reminder'].includes(e.kind)).sort((a,b)=>b[1].expiredAt-a[1].expiredAt);
   const rows=entries.map(([id,e])=>`<article class="note-tile"><small class="mut">${e.kind==='note'?t('futureNotes'):t('projectReminders')} · ${esc(e.day)}</small><p>${esc(e.text)}</p><button class="g s" data-key="${esc(id)}">${tr()?'Düzenle / geri taşı':'Edit / restore'}</button></article>`).join('');
   openModal('timed-archive',`<h2>${tr()?'Süresi dolanlar arşivi':'Expired items archive'}</h2>${rows||`<p class="mut">${tr()?'Arşiv boş.':'The archive is empty.'}</p>`}<button class="g" onclick="closeModal('timed-archive')">${t('back')}</button>`);
   const modal=document.getElementById('timed-archive');modal._owner=owner;
   modal.querySelectorAll('[data-key]').forEach(b=>{b.onclick=()=>{if(A===owner)editArchive(owner,b.dataset.key)}});
 }
 function editArchive(owner,id){
   const entry=owner.timedArchive?.[id];if(A!==owner||!entry)return;
   document.getElementById('timed-archive')?.remove();
   const note=entry.kind==='note',tomorrow=addD(istanbulDayKey(),1);
   const options=(owner.projects||[]).map(p=>`<option value="${esc(projectId(p))}" ${p.id===entry.projectId?'selected':''}>${esc(p.n)}</option>`).join('');
   const picker=note?'':`<label for="archive-project">${tr()?'Proje':'Project'}</label><select id="archive-project">${options}</select>`;
   openModal('timed-archive',`<h2>${note?t('futureNotes'):t('projectReminders')}</h2><label for="archive-text">${tr()?'Arşivdeki metin':'Archived text'}</label><textarea id="archive-text" maxlength="${note?500:120}">${esc(entry.text)}</textarea>${picker}<label for="archive-when">${tr()?'Geri taşıma tarihi':'Restore date'}${note?'':tr()?' (Türkiye saati)':' (Istanbul time)'}</label><input id="archive-when" type="${note?'date':'datetime-local'}" value="${tomorrow}${note?'':'T09:00'}"><p id="archive-message" role="status"></p><div class="row"><button data-action="restore">${tr()?'Geri taşı':'Restore'}</button><button class="g" data-action="save">${t('save')}</button><button class="g d" data-action="delete">${tr()?'Kalıcı sil':'Delete permanently'}</button><button class="g" data-action="back">${t('back')}</button></div>`);
   const modal=document.getElementById('timed-archive');modal._owner=owner;
   modal.onclick=ev=>{
     const action=ev.target.closest('[data-action]')?.dataset.action;if(!action||A!==owner||owner.timedArchive?.[id]!==entry)return;
     const draft=modal.querySelector('#archive-text').value.trim(),when=modal.querySelector('#archive-when').value;
     const status=modal.querySelector('#archive-message');
     if(action==='back'){openArchive();return}
     if(action==='delete'){
       if(!window.confirm(tr()?'Bu arşiv kaydı kalıcı olarak silinsin mi?':'Permanently delete this archive entry?'))return;
       delete owner.timedArchive[id];
     }else{
       if(!draft){status.textContent=tr()?'Bir metin gir.':'Enter some text.';return}
       if(action==='save'){entry.text=draft}
       if(action==='restore'){
         const date=Date.parse(when+(note?'T23:59:59+03:00':':00+03:00'));
         if(!Number.isFinite(date)||date<=Date.now()){status.textContent=tr()?'Geçerli, ileri bir tarih seç.':'Choose a valid upcoming date.';return}
         if(note){
           if(owner.future?.[when]){status.textContent=tr()?'Bu tarihte bir notun var. Başka tarih seç.':'A note already exists on this date. Choose another date.';return}
           (owner.future||={})[when]=draft;(owner.futureMeta||={})[when]={...entry.meta,createdAt:Date.now(),expireAfterDay:when};
         }else{
           const p=owner.projects?.find(p=>p.id===modal.querySelector('#archive-project').value);
           if(!p||projectReminderTime(p)>Date.now()){status.textContent=tr()?'Etkin hatırlatması olmayan bir proje seç.':'Select a project without an active reminder.';return}
           p.reminderAt=new Date(date).toISOString();p.reminderEnabled=true;p.reminderLabel=draft;
         }
         delete owner.timedArchive[id];
       }
     }
     save();renderPage();openArchive();
   };
 }
 return {suggest,showSuggestion,addSuggestion,focusPatterns,focusCard,archiveButton,openArchive};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=IYDayTools;
