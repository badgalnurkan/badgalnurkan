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

test('manual archive preserves full records, cancel is safe and account switches invalidate approval',()=>{
 const c=archiveFixture();vm.runInContext(extract('let archiveRequest=null;','function st(a,b)'),c);
 c.A.future['2026-11-29']='Private note';c.A.futureMeta['2026-11-29']={createdAt:123};c.A.projects=[{id:'p',n:'Project',d:'2026-11-30',tasks:[{t:'Subtask'}]}];
 c.delNote('2026-11-29');c.cancelArchiveRequest();assert.equal(c.A.future['2026-11-29'],'Private note');assert.equal(c.A.timedArchive.notes.length,0);
 c.delNote('2026-11-29');assert.equal(c.applyArchiveRequest(),true);assert.equal(c.A.future['2026-11-29'],undefined);assert.equal(c.A.timedArchive.notes[0].meta.createdAt,123);
 c.confirmArchiveProject(0);const first=c.A;c.A={projects:[{n:'Other'}],future:{},timedArchive:{notes:[]}};assert.equal(c.applyArchiveRequest(),false);assert.equal(first.projects[0].archivedAt,undefined);
 c.A=first;c.confirmArchiveProject(0);assert.equal(c.applyArchiveRequest(),true);assert.equal(first.projects[0].tasks[0].t,'Subtask');assert.equal(first.projects[0].reminderEnabled,false);
});
test('overflow archives oldest entries without loss and does not duplicate on later render',()=>{
 const c={A:{tasks:[],backlog:Array.from({length:13},(_,i)=>'Task '+i),hist:{}},save(){c.saves++},saves:0,taskStatus:()=>''};
 vm.createContext(c);vm.runInContext(extract('function fixTodoData(){','P.todo=()=>'),c);
 c.fixTodoData();assert.equal(c.A.backlog.length,10);assert.deepEqual(Array.from(c.A.backlogArchive),['Task 0','Task 1','Task 2']);
 c.fixTodoData();assert.equal(c.A.backlogArchive.length,3);assert.equal(c.saves,1);
});
test('archived backlog moves to today only in the selected account',()=>{
 const c={A:{tasks:[],backlog:['Current'],backlogArchive:['Archived']},P:{todo(){}},allTodayTasksArchived:()=>false,rndHex:()=> 'test-id',recordActivity(){}};
 vm.createContext(c);vm.runInContext(extract('function fromBack(','function delT('),c);c.fromBack(0,true);
 assert.equal(c.A.tasks[0].t,'Archived');assert.deepEqual(c.A.backlog,['Current']);assert.equal(c.A.backlogArchive.length,0);
});
test('running and paused Pomodoro preserve phase, countdown, interval and focus parts while presets can reorder',()=>{
 const c={pm:{w:25,b:5,ph:'w',left:1234,run:1,end:12345,n:0,iv:11,focusParts:[{seconds:5}]},A:{presets:[{w:25,b:5},{w:50,b:10}]},tr:()=>true,toast(){},save(){},P:{pomo(){}},clearInterval(){throw Error('active timer cleared')},persistPomodoroState(){throw Error('active timer overwritten')}};
 vm.createContext(c);vm.runInContext(extract('function pomoInProgress(){','let editIdx=-1;'),c);const before=JSON.stringify(c.pm);
 assert.equal(c.setP(50,10),false);assert.equal(JSON.stringify(c.pm),before);
 assert.equal(c.movePreset(0,1),true);assert.equal(c.A.presets[0].w,50);assert.equal(JSON.stringify(c.pm),before);
 c.pm.run=0;const paused=JSON.stringify(c.pm);assert.equal(c.setP(50,10),false);assert.equal(JSON.stringify(c.pm),paused);
});
test('calendar direct month jump retains the existing lower bound',()=>{
 const elements={'#progress-year':{value:'2028'},'#progress-month':{value:'1'},'#progress-month-error':{}};
 const c={A:{},P:{pc(){}},tr:()=>true,$:key=>elements[key],closeModal(){},calOff:0,Date};
 vm.createContext(c);vm.runInContext(extract('function openProgressMonth(','function st(a,b)'),c);assert.equal(c.jumpProgressMonth(),true);
 const now=new Date();assert.equal(c.calOff,(2028-now.getFullYear())*12+1-now.getMonth());
 elements['#progress-year'].value='2026';elements['#progress-month'].value='9';const saved=c.calOff;assert.equal(c.jumpProgressMonth(),false);assert.equal(c.calOff,saved);
});
test('concurrent backlog/archive movements require a single decision rather than splitting records',()=>{
 const merge=require('../profile-merge.js').merge;
 const base={day:'2026-11-24',backlog:['one','two'],backlogArchive:[]};
 const local={...base,backlog:['two'],backlogArchive:['one']};
 const remote={...base,backlog:['one','two','three']};
 const result=merge(base,local,remote,true);assert.ok(result.conflicts.includes('backlog'));assert.ok(result.conflicts.includes('backlogArchive'));
 assert.deepEqual(result.merged.backlog,local.backlog);assert.deepEqual(result.merged.backlogArchive,local.backlogArchive);
});
