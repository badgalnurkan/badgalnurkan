'use strict';
const fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function fixture(){
 const c={A:{projects:[],future:{},futureMeta:{},journal:{'2026-11-18':{text:'Keep'}}},Date,save(){c.saves++},recordActivity(){c.saves++},saves:0,
  today:()=>c.todayKey||'2026-11-24',istanbulDayKey:at=>new Date(at.getTime()+10800000).toISOString().slice(0,10),
  tr:()=>true,t:x=>x,esc:x=>String(x),toast(x){c.toasts.push(x)},toasts:[],openModal(id,markup){c.modal={id,markup}},closeModal(){},
  document:{getElementById:()=>null},P:{home(){},pc(){}},pg:'home'
 };
 vm.createContext(c);
 const start=html.indexOf('function projectReminderTime('),end=html.indexOf('function checkAppReminders(',start);
 assert.ok(start>=0&&end>start);
 vm.runInContext(html.slice(start,end),c);
 return c;
}
test('expired project reminder archives without losing project or tasks',()=>{
 const c=fixture(),now=Date.parse('2026-11-23T09:00:00+03:00');
 c.A.projects=[{id:'one',n:'Keep project',d:'2026-11-23',tasks:[{t:'Keep task'}]}];
 assert.equal(c.expireTimedRecords(now),true);
 assert.equal(c.A.projects.length,1);
 assert.equal(c.A.projects[0].reminderEnabled,false);
 assert.equal(c.A.projects[0].archivedAt,now);
 assert.equal(c.A.projects[0].tasks.length,1);
 assert.equal(c.projectReminderTime(c.A.projects[0]),NaN);
 assert.equal(c.expireTimedRecords(now),false);
});
test('future note moves to recoverable archive at Istanbul midnight only once',()=>{
 const c=fixture(),key='2026-11-23';
 c.A.future={[key]:'Expire'};
 c.A.futureMeta={[key]:{expireAfterDay:key}};
 c.expireTimedRecords(Date.parse('2026-11-23T23:59:59+03:00'));
 assert.equal(c.A.future[key],'Expire');
 c.expireTimedRecords(Date.parse('2026-11-24T00:00:00+03:00'));
 assert.equal(c.A.future[key],undefined);
 assert.equal(c.A.timedArchive.notes.length,1);
 assert.equal(c.A.timedArchive.notes[0].text,'Expire');
 c.expireTimedRecords(Date.parse('2026-11-24T00:00:30+03:00'));
 assert.equal(c.A.timedArchive.notes.length,1);
 assert.equal(c.A.journal['2026-11-18'].text,'Keep');
});
test('historical and same-day calendar notes are never misclassified as future notes',()=>{
 const c=fixture();
 c.A.future={'2026-11-18':'Daily note','2026-11-23':'Old future note','2026-11-24':'Today note'};
 c.A.futureMeta={'2026-11-23':{createdAt:Date.parse('2026-11-17T12:00Z')}};
 c.expireTimedRecords(Date.parse('2026-11-24T12:00:00+03:00'));
 assert.equal(c.A.future['2026-11-18'],'Daily note');
 assert.equal(c.A.future['2026-11-24'],'Today note');
 assert.equal(c.A.futureMeta['2026-11-24'],undefined);
 assert.equal(c.A.future['2026-11-23'],undefined);
 assert.equal(c.A.timedArchive.notes[0].text,'Old future note');
});
test('restore refuses invalid dates and never overwrites an existing note',()=>{
 const c=fixture();c.A.timedArchive={notes:[{key:'2026-11-23',text:'Safe text'}]};
 c.restoreTimedArchiveNote(0);
 const input={value:'2026-11-31'};c.document.getElementById=()=>input;
 c.saveRestoredTimedArchiveNote(0);assert.equal(c.A.timedArchive.notes.length,1);
 input.value='2026-12-01';c.A.future['2026-12-01']='Keep existing';
 c.saveRestoredTimedArchiveNote(0);assert.equal(c.A.future['2026-12-01'],'Keep existing');
 assert.equal(c.A.timedArchive.notes.length,1);
 delete c.A.future['2026-12-01'];c.saveRestoredTimedArchiveNote(0);
 assert.equal(c.A.future['2026-12-01'],'Safe text');assert.equal(c.A.timedArchive.notes.length,0);
});
test('archive actions do not cross between different signed-in account objects',()=>{
 const c=fixture();c.A.timedArchive={notes:[{key:'2026-11-23',text:'Owner one'}]};const owner=c.A;
 c.restoreTimedArchiveNote(0);
 c.A={projects:[],future:{},futureMeta:{},timedArchive:{notes:[{key:'2026-11-23',text:'Owner two'}]}};
 c.document.getElementById=()=>({value:'2026-12-01'});
 c.saveRestoredTimedArchiveNote(0);
 assert.equal(c.A.future['2026-12-01'],undefined);
 assert.equal(c.A.timedArchive.notes[0].text,'Owner two');
 assert.equal(owner.timedArchive.notes[0].text,'Owner one');
});
test('archived project can be restored with a new date without losing project identity',()=>{
 const c=fixture();
 const project={id:'project-1',n:'Before',d:'2026-11-20',archivedAt:Date.now(),reminderEnabled:false,tasks:[{t:'Keep'}]};
 c.A.projects=[project];c.restoreTimedArchiveProject(0);
 c.document.getElementById=id=>({value:id==='timed-project-name'?'After':'2026-12-05'});
 c.saveRestoredTimedArchiveProject(0);
 assert.equal(project.id,'project-1');assert.equal(project.n,'After');
 assert.equal(project.d,'2026-12-05');assert.equal(project.archivedAt,undefined);
 assert.equal(project.reminderEnabled,true);assert.equal(project.tasks[0].t,'Keep');
});
