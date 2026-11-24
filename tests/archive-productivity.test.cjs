'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'Application script must be present');
function extract(from,to){
 const a=source.indexOf(from),b=source.indexOf(to,a+from.length);
 assert.ok(a>=0&&b>a,'Missing source section: '+from);
 return source.slice(a,b);
}
const day='2026-11-24';
const plusDays=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function archiveFixture(){
 const account={projects:[],future:{},futureMeta:{},timedArchive:{notes:[]},tasks:[{t:'Retain task'}],journal:{'2026-11-20':{text:'Retain journal'}}};
 const c={A:account,Date,pg:'pc',P:{pc(){},home(){}},t:x=>x,tr:()=>true,esc:x=>String(x),
  today:()=>day,save(){c.saves++},saves:0,recordActivity(){c.saves++},toast(){c.toasts++},toasts:0,
  openModal(id,markup){c.modal={id,markup}},closeModal(){},document:{getElementById(id){
   if(id==='timed-restore-date')return {value:c.nextDate};
   if(id==='timed-project-date')return {value:c.nextDate};
   if(id==='timed-project-name')return {value:c.nextName};
   return null;
  }},
  istanbulDayKey:at=>new Date(at.getTime()+3*3600000).toISOString().slice(0,10)};
 vm.createContext(c);
 vm.runInContext(extract('function projectReminderTime(', 'function checkAppReminders('),c);
 return c;
}
test('expired notes and projects archive without erasing unrelated records',()=>{
 const c=archiveFixture();
 c.A.future['2026-11-23']='Remember this';
 c.A.futureMeta['2026-11-23']={expireAfterDay:'2026-11-23',createdAt:123};
 c.A.projects=[{id:'p1',n:'Retain project',d:'2026-11-23',tasks:[{t:'Subtask'}]}];
 const now=Date.parse('2026-11-24T00:00:00+03:00');
 assert.equal(c.expireTimedRecords(now),true);
 assert.equal(c.A.future['2026-11-23'],undefined);
 assert.equal(c.A.timedArchive.notes.length,1);
 assert.equal(c.A.timedArchive.notes[0].text,'Remember this');
 assert.equal(c.A.timedArchive.notes[0].meta.createdAt,123);
 assert.equal(c.A.projects[0].n,'Retain project');
 assert.equal(c.A.projects[0].archivedAt,now);
 assert.equal(c.A.projects[0].tasks[0].t,'Subtask');
 assert.equal(c.A.journal['2026-11-20'].text,'Retain journal');
 assert.equal(c.A.tasks[0].t,'Retain task');
 assert.equal(c.timedArchiveCount(),2);
 assert.equal(c.expireTimedRecords(now),false);
 assert.equal(c.A.timedArchive.notes.length,1);
});
test('restoring a note requires a future unoccupied date and keeps historical notes untouched',()=>{
 const c=archiveFixture();
 c.A.timedArchive.notes=[{key:'2026-11-22',text:'Archived'}];
 c.A.future['2026-11-28']='Original';
 c.restoreTimedArchiveNote(0);
 c.nextDate='2026-11-28';
 c.saveRestoredTimedArchiveNote(0);
 assert.equal(c.A.future['2026-11-28'],'Original');
 assert.equal(c.A.timedArchive.notes.length,1);
 c.nextDate='2026-11-29';
 c.saveRestoredTimedArchiveNote(0);
 assert.equal(c.A.future['2026-11-29'],'Archived');
 assert.equal(c.A.futureMeta['2026-11-29'].expireAfterDay,'2026-11-29');
 assert.equal(c.A.timedArchive.notes.length,0);
 assert.equal(c.A.future['2026-11-28'],'Original');
});
test('stale restore dialog cannot write into a second signed-in account',()=>{
 const c=archiveFixture(),first=c.A;
 first.timedArchive.notes=[{key:'2026-11-22',text:'Private note'}];
 c.restoreTimedArchiveNote(0);
 c.A={projects:[],future:{},futureMeta:{},timedArchive:{notes:[]}};
 c.nextDate='2026-11-29';
 c.saveRestoredTimedArchiveNote(0);
 assert.equal(c.A.future['2026-11-29'],undefined);
 assert.equal(first.timedArchive.notes.length,1);
});
test('restoring an expired project updates its date without creating a duplicate',()=>{
 const c=archiveFixture(),time=Date.parse('2026-11-23T09:00:00+03:00');
 c.A.projects=[{id:'p1',n:'Old project',d:'2026-11-23',archivedAt:time,reminderEnabled:false,tasks:[{t:'Subtask'}]}];
 c.restoreTimedArchiveProject(0);
 c.nextDate='2026-11-30';c.nextName='Revised project';
 c.saveRestoredTimedArchiveProject(0);
 assert.equal(c.A.projects.length,1);
 assert.equal(c.A.projects[0].n,'Old project');assert.equal(c.A.projects[0].reminderLabel,'Revised project');
 assert.equal(c.A.projects[0].d,'2026-11-23');assert.equal(c.A.projects[0].reminderAt,'2026-11-30T06:00:00.000Z');
 assert.equal(c.A.projects[0].archivedAt,undefined);
 assert.equal(c.A.projects[0].reminderEnabled,true);
 assert.equal(c.A.projects[0].tasks[0].t,'Subtask');
});
test('daily information picks one bilingual source-linked fact for each date',()=>{
 const c={istanbulDayKey:()=>day,tr:()=>true,esc:x=>x};
 vm.createContext(c);
 vm.runInContext(extract('const DAILY_FACTS=', 'P.home=()=>'),c);
 const fact=c.dailyFactFor(day);
 assert.ok(fact.tr&&fact.en&&fact.source);
 assert.match(fact.url,/^https:\/\/(science\.nasa\.gov|www\.nasa\.gov|www\.fisheries\.noaa\.gov|oceanservice\.noaa\.gov)\//);
 assert.match(c.dailyFactCard(),/Günün bilgisi/);
});
test('suggested tasks preserve existing records and use the following day after completion',()=>{
 const c={A:{day,tasks:[{t:'Existing',s:''}],plans:{}},P:{todo(){this.renders++},renders:0},
  t:x=>x,tr:()=>true,today:()=>day,addD:plusDays,recordActivity(){c.activities++},activities:0,
  rndHex:()=>String(Math.random()),toast(){},finished:false,allTodayTasksArchived:()=>c.finished,ensurePlans(){if(!c.A.plans)c.A.plans={}}};
 vm.createContext(c);
 vm.runInContext(extract('const TASK_SUGGESTIONS=', '/* sis:'),c);
 assert.equal(c.suggestRandomTask(),true);
 assert.equal(c.A.tasks.length,2);
 assert.equal(c.A.tasks[0].t,'Existing');
 c.finished=true;
 assert.equal(c.suggestRandomTask(),true);
 assert.equal(c.A.tasks.length,2);
 assert.equal(c.A.plans['2026-11-25'].length,1);
 assert.equal(c.activities,2);
});
test('focus patterns count completed sessions and highlight unfinished tasks without making causal claims',()=>{
 const c={A:{hist:{'2026-11-23':[{done:false},{done:false},{done:true}]}},
  addD:plusDays,istanbulDayKey:at=>at?new Date(at.getTime()+3*3600000).toISOString().slice(0,10):day};
 vm.createContext(c);
 vm.runInContext(extract('function focusPatternSummary(', 'function focusHistoryCard('),c);
 const at=Date.parse('2026-11-23T16:10:00+03:00');
 const result=c.focusPatternSummary([{at,seconds:1500,completed:true},{at,seconds:100,completed:false}],day);
 assert.equal(result.hour[0],16);
 assert.equal(result.hour[1],1);
 assert.equal(result.heavy.day,'2026-11-23');
 assert.equal(result.heavy.unfinished,2);
});
