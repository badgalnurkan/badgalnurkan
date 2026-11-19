'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function extract(from,to){const a=source.indexOf(from),b=source.indexOf(to,a+from.length);assert.ok(a>=0&&b>a,from);return source.slice(a,b)}
function fixture(){
 const context={
  A:{day:'2026-11-15',tasks:[],hist:{},backlog:[],completedBatches:{},plans:{},future:{},futureMeta:{},fog:true},
  current:'2026-11-15',today:()=>context.current,tr:()=>context.language!=='en',
  t:key=>({done:context.language==='en'?'Done':'Yapıldı',notDone:context.language==='en'?'Not done':'Yapılmadı',notYetDone:context.language==='en'?'Not done yet':'Henüz yapılmadı',noRecords:'No records'})[key]||key,
  fmt:x=>x,closeMiniCal(){},openModal:(id,content)=>{context.modal={id,content}},toast(){},P:{todo(){}},
  save:()=>{context.saves=(context.saves||0)+1},recordActivity:()=>{context.activities=(context.activities||0)+1},vibrateTask(){},
 };
 vm.createContext(context);
 vm.runInContext(extract('function taskStatus(task){','const okDay=')+extract('function fixTodoData(){','P.todo=')+extract('function mk(i,status){','function ensurePlans(){')+extract('function dayTaskRow(task){','function saveNote(k){')+extract('function esc(s){','const LETTERS=')+'\nthis.f={taskStatus,taskSnapshot,items,roll,fixTodoData,mk,openDay,dayTaskRow};',context);
 return {context,f:context.f};
}
test('only an explicit cross is missed; unmarked and legacy false records remain pending',()=>{
 const {f}=fixture();
 for(const [record,status] of [[{s:''},'pending'],[{s:'pending'},'pending'],[{s:'done'},'done'],[{s:'miss'},'miss'],[{done:true},'done'],[{done:false},'pending'],[{},'pending']])assert.equal(f.taskStatus(record),status);
});
test('today exposes three distinct states while preserving completion booleans and saved batches',()=>{
 const {f,context}=fixture();context.A.tasks=[{t:'Checked',s:'done'},{t:'Crossed',s:'miss'},{t:'Untouched',s:''}];
 context.A.completedBatches[context.current]=[{t:'Earlier batch',done:true}];const before=JSON.stringify(context.A);
 const rows=f.items(context.current);assert.deepEqual(Array.from(rows,x=>x.s),['done','done','miss','pending']);assert.deepEqual(Array.from(rows,x=>x.done),[true,true,false,false]);assert.equal(JSON.stringify(context.A),before);
});
test('historical false records are displayed conservatively without rewriting saved history',()=>{
 const {f,context}=fixture();context.A.hist['2026-11-14']=Object.freeze([Object.freeze({t:'Old unmarked task',done:false}),Object.freeze({t:'Explicit cross',done:false,s:'miss'}),Object.freeze({t:'Completed',done:true})]);
 const before=JSON.stringify(context.A.hist);assert.deepEqual(Array.from(f.items('2026-11-14'),x=>x.s),['pending','miss','done']);assert.equal(JSON.stringify(context.A.hist),before);
});
test('day rollover keeps pending separate from missed and starts tomorrow plans unmarked',()=>{
 const {f,context}=fixture();context.A.tasks=[{t:'Completed',s:'done'},{t:'Crossed',s:'miss'},{t:'Unmarked',s:''}];context.A.plans['2026-11-16']=['Tomorrow'];context.current='2026-11-16';f.roll();
 assert.deepEqual(Array.from(context.A.hist['2026-11-15'],x=>x.s),['done','miss','pending']);
 assert.deepEqual(Array.from(context.A.backlog),['Crossed','Unmarked']);assert.equal(context.A.tasks[0].s,'');assert.equal(f.items('2026-11-15')[2].s,'pending');assert.equal(f.items('2026-11-16')[0].s,'pending');assert.equal(context.saves,1);
});
test('an explicit empty status does not regain a stale legacy done flag during normalization',()=>{
 const {f,context}=fixture();context.A.tasks=[{t:'Cleared',s:'',done:true},{t:'Legacy done',done:true}];f.fixTodoData();
 assert.equal(context.A.tasks[0].s,'');assert.equal(context.A.tasks[1].s,'done');assert.equal(f.items(context.current)[0].done,false);
});
test('both tick and cross can be toggled back to the pending state',()=>{
 for(const mark of ['done','miss']){const {f,context}=fixture();context.A.tasks=[{t:'Test',s:''},{t:'Keep list open',s:''}];f.mk(0,mark);assert.equal(f.items(context.current)[0].s,mark);f.mk(0,mark);assert.equal(f.items(context.current)[0].s,'pending');assert.equal(context.A.tasks[0].s,'')}
});
test('all-complete archiving retains completed status and never creates pending copies',()=>{
 const {f,context}=fixture();context.A.tasks=[{t:'First',s:''},{t:'Second',s:''}];f.mk(0,'done');f.mk(1,'done');
 assert.equal(context.A.tasks.length,0);assert.deepEqual(Array.from(f.items(context.current),x=>x.s),['done','done']);assert.equal(context.A.completedBatches[context.current].length,2);
});
test('the Turkish date dialog uses a neutral pending label instead of a cross',()=>{
 const {f,context}=fixture();context.A.tasks=[{t:'Pending task',s:''},{t:'Missed task',s:'miss'},{t:'Done task',s:'done'}];f.openDay(context.current);
 assert.equal(context.modal.id,'day-modal');assert.match(context.modal.content,/data-task-status="pending"><span>Pending task<\/span><b>○ Henüz yapılmadı/);
 assert.match(context.modal.content,/data-task-status="miss"><span>Missed task<\/span><b>✕ Yapılmadı/);assert.match(context.modal.content,/✓ Yapıldı/);assert.doesNotMatch(context.modal.content,/✕ Henüz yapılmadı/);
});
test('English date dialogs keep pending, missed and completed labels distinct',()=>{
 const {f,context}=fixture();context.language='en';context.A.tasks=[{t:'Pending',s:''},{t:'Missed',s:'miss'},{t:'Done',s:'done'}];f.openDay(context.current);
 assert.match(context.modal.content,/○ Not done yet/);assert.match(context.modal.content,/✕ Not done/);assert.match(context.modal.content,/✓ Done/);
});
test('date-dialog task names stay escaped for every status',()=>{
 const {f}=fixture();const row=f.dayTaskRow({t:'<img src=x onerror=alert(1)>',s:''});assert.ok(row.includes('&lt;img'));assert.ok(!row.includes('<img'));
});

test('tomorrow plans require every task to be done, survive today, and promote only once',()=>{
 const {f,context}=fixture();
 context.addD=(value,n)=>new Date(Date.parse(value+'T12:00Z')+n*864e5).toISOString().slice(0,10);
 context.$=()=>({value:'',focus(){}});
 vm.runInContext(extract('function allTodayTasksArchived()', '/* sis:')+extract('function sortTaskLists(', 'function moveTask('),context);
 context.A.tasks=[{t:'A',s:''},{t:'B',s:''}];
 assert.equal(context.addTomorrowPlan('Too early'),false);
 f.mk(0,'done');f.mk(1,'miss');assert.equal(context.addTomorrowPlan('Still early'),false);
 f.mk(1,'done');assert.equal(context.addTomorrowPlan('Çalış'),true);
 context.$=()=>({value:'Ara',focus(){}});context.addT();
 context.toggleTaskAlphabetical();assert.deepEqual(Array.from(context.A.plans['2026-11-16']),['Çalış','Ara'],'display sorting must not change saved plan order');
 f.roll();assert.equal(context.A.tasks.length,0);
 context.current='2026-11-16';f.roll();f.roll();
 assert.deepEqual(Array.from(context.A.tasks,x=>x.t),['Çalış','Ara'],'manual order must be retained when tomorrow opens');
 assert.deepEqual(Array.from(context.A.tasks,x=>x.s),['','']);assert.equal(context.A.plans['2026-11-16'],undefined);
 assert.equal(context.addTomorrowPlan('Premature again'),false);
});
test('returning late preserves unvisited plans on their actual date',()=>{
 const {f,context}=fixture();context.A.plans={'2026-11-16':['Scheduled Monday'],'2026-11-19':['Future']};
 context.current='2026-11-18';f.roll();f.roll();
 assert.equal(context.A.tasks.length,0);assert.deepEqual(Array.from(context.A.hist['2026-11-16'],x=>[x.t,x.s]),[['Scheduled Monday','pending']]);
 assert.deepEqual(Array.from(context.A.plans['2026-11-19']),['Future']);
});

test('removing the last pending item unlocks planning only if other tasks are actually completed',()=>{
 const {f,context}=fixture();vm.runInContext(extract('function allTodayTasksArchived()', '/* sis:'),context);
 context.A.tasks=[{t:'Unused',s:''}];context.delT(0);assert.equal(context.allTodayTasksArchived(),false);
 context.A.tasks=[{t:'Finished',s:'done'},{t:'Unneeded',s:''}];context.delT(1);
 assert.equal(context.allTodayTasksArchived(),true);assert.equal(f.items(context.current)[0].s,'done');
});
