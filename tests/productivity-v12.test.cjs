'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'App script should be present');
function extract(from,to){
 const first=source.indexOf(from),last=source.indexOf(to,first+from.length);
 assert.ok(first>=0&&last>first,'Cannot locate: '+from);
 return source.slice(first,last);
}
function fixture(){
 const state={A:{tasks:[{t:'First',s:''},{t:'Second',s:'done'},{t:'Third',s:''}]},saves:0,activity:0,renders:0,language:'en',value:'',modal:null,toasts:[]};
 const context={
  A:state.A,
  P:{todo(){state.renders++}},
  save(){state.saves++},recordActivity(){state.activity++},
  tr(){return state.language==='tr'},t(key){return key},
  esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"\'":'&#39;'}[c]))},
  openModal(id,content){state.modal={id,content}},
  closeModal(id){state.closed=id},toast(value){state.toasts.push(value)},
  document:{
   getElementById(id){return id==='task-edit-text'?{value:state.value,focus(){}}:null},
   querySelector(){return null}
  },
  today(){return '2026-11-18'},
  dd(a,b){return Math.round((Date.parse(b+'T00:00Z')-Date.parse(a+'T00:00Z'))/86400000)}
 };
 vm.createContext(context);
 vm.runInContext(
  extract('function moveTask(', 'function taskReorderKey(')+
  extract('function editTask(', 'function allTodayTasksArchived(')+
  extract('function futureNoteCountdown(', 'P.pc=()=>')+
  '\nthis.features={moveTask,editTask,saveTaskEdit,futureNoteCountdown};',context
 );
 return {state,features:context.features,context};
}
test('task reorder preserves identity, status and moves only valid indices',()=>{
 const {state,features}=fixture();
 const edited=state.A.tasks[0];
 assert.equal(features.moveTask(0,2),true);
 assert.equal(state.A.tasks[2],edited);
 assert.deepEqual(state.A.tasks.map(x=>x.t),['Second','Third','First']);
 assert.equal(state.A.tasks[0].s,'done');
 assert.equal(features.moveTask(-1,0),false);
 assert.equal(features.moveTask(0,99),false);
 assert.equal(state.saves,1);
 assert.equal(state.renders,1);
});
test('task edit preserves other task fields and rejects empty values',()=>{
 const {state,features}=fixture();
 const original=state.A.tasks[1];
 features.editTask(1);
 assert.equal(state.modal.id,'task-edit-modal');
 state.value='  Revised task  ';
 features.saveTaskEdit();
 assert.equal(original.t,'Revised task');
 assert.equal(original.s,'done');
 assert.equal(state.activity,1);
 assert.equal(state.closed,'task-edit-modal');
 features.editTask(1);
 state.value='   ';
 features.saveTaskEdit();
 assert.equal(original.t,'Revised task');
 assert.equal(state.activity,1);
 assert.equal(state.toasts.length,1);
});
test('future notes show correct remaining days in Turkish and English',()=>{
 const {state,features}=fixture();
 assert.equal(features.futureNoteCountdown('2026-11-19'),'1 day left');
 assert.equal(features.futureNoteCountdown('2026-11-21'),'3 days left');
 assert.equal(features.futureNoteCountdown('2026-11-18'),'Today');
 assert.equal(features.futureNoteCountdown('2026-11-17'),'1 day ago');
 state.language='tr';
 assert.equal(features.futureNoteCountdown('2026-11-21'),'3 gün kaldı');
 assert.equal(features.futureNoteCountdown('2026-11-18'),'Bugün');
});

test('focus summary separates elapsed focus time from completed sessions',()=>{
 const context={D:d=>d.toISOString().slice(0,10)};
 vm.createContext(context);
 vm.runInContext(extract('function focusSummary(', 'function focusHistoryCard(')+'\nthis.focusSummary=focusSummary',context);
 const stamp=Date.parse('2026-11-18T12:00:00Z');
 const history=[
  {at:stamp,seconds:1500,completed:true},
  {at:stamp+1000,seconds:300,completed:false},
  {at:stamp,seconds:-3,completed:true},
  {at:Date.parse('2026-10-18T12:00:00Z'),seconds:3000,completed:true}
 ];
 const data=context.focusSummary(history,'2026-11-01','2026-11-30');
 assert.equal(data.seconds,1800);
 assert.equal(data.sessions,1);
 assert.equal(data.perDay['2026-11-18'].seconds,1800);
});
test('new account percentage requires activity and resets after a seven-day gap',()=>{
 const context={
  validProgressDate:day=>/^\d{4}-\d{2}-\d{2}$/.test(day),
  progressDayDistance:(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000)
 };
 vm.createContext(context);
 vm.runInContext(extract('function activityBasedProgressPercent(', 'function accountProgressPercent(')+'\nthis.activityProgress=activityBasedProgressPercent',context);
 const pct=context.activityProgress;
 assert.equal(pct({activeDays:{}},'2026-11-18'),1);
 assert.equal(pct({activeDays:{'2026-11-15':true}},'2026-11-18'),1);
 assert.equal(pct({activeDays:{'2026-11-15':true,'2026-11-18':true}},'2026-11-18'),2);
 assert.equal(pct({activeDays:{'2026-11-01':true,'2026-11-18':true}},'2026-11-18'),1);
 const many={};
 for(let i=0;i<101;i++)many[new Date(Date.parse('2026-05-01T00:00:00Z')+i*86400000).toISOString().slice(0,10)]=true;
 assert.equal(pct({activeDays:many},'2026-08-09'),1);
});
test('a stale task edit cannot modify a different signed-in account',()=>{
 const {state,features,context}=fixture(),original=state.A.tasks[0];
 features.editTask(0);
 state.A={tasks:[{t:'Other account task',s:''}]};context.A=state.A;
 state.value='Unsafe edit';
 features.saveTaskEdit();
 assert.equal(original.t,'First');
 assert.equal(state.A.tasks[0].t,'Other account task');
});
