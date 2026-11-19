'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const tag=html.indexOf('<script>'),endTag=html.indexOf('</script>',tag+8);
if(tag<0||endTag<0)throw Error('No app script');
const script=html.slice(tag+8,endTag);
const start=script.indexOf('function taskSortMode(){'),end=script.indexOf('function taskReorderKey(',start);
if(start<0||end<=start)throw Error('Sort block missing');
function fixture(tasks){
 const calls={saved:0,rendered:0};
 const ctx={A:{tasks,taskOrder:'manual'},tr:()=>false,save:()=>calls.saved++,P:{todo:()=>calls.rendered++},Intl,Number};
 vm.createContext(ctx);
 vm.runInContext(script.slice(start,end)+'\nthis.api={sortTaskLists,setTaskOrder,moveTask};',ctx);
 return {ctx,calls,api:ctx.api};
}
test('four sorting choices never mutate manual storage order',()=>{
 const tasks=[{t:'Zulu',createdAt:100},{t:'Apple',createdAt:300},{t:'Mars',createdAt:200}];
 const f=fixture(tasks),order=()=>Array.from(f.api.sortTaskLists(),x=>x.task.t);
 assert.deepEqual(order(),['Zulu','Apple','Mars']);
 f.api.setTaskOrder('alpha');assert.deepEqual(order(),['Apple','Mars','Zulu']);
 f.api.setTaskOrder('newest');assert.deepEqual(order(),['Apple','Mars','Zulu']);
 f.api.setTaskOrder('reverse');assert.deepEqual(order(),['Mars','Apple','Zulu']);
 f.api.setTaskOrder('manual');assert.deepEqual(order(),['Zulu','Apple','Mars']);
 assert.deepEqual(f.ctx.A.tasks,tasks);assert.equal(f.calls.saved,4);
});
test('sorting keeps original action indexes and task completion states',()=>{
 const f=fixture([{t:'Z',s:'done'},{t:'A',s:'miss'},{t:'M',s:''}]);
 f.api.setTaskOrder('alpha');
 const view=Array.from(f.api.sortTaskLists(),x=>[x.index,x.task.s]);
 assert.deepEqual(view,[[1,'miss'],[2,''],[0,'done']]);
});
test('newest added handles older tasks without creation timestamps',()=>{
 const f=fixture([{t:'Legacy one'},{t:'Legacy two'},{t:'New task',createdAt:1000}]);
 f.api.setTaskOrder('newest');
 assert.deepEqual(Array.from(f.api.sortTaskLists(),x=>x.task.t),['New task','Legacy two','Legacy one']);
});
test('dragging switches back to manual without losing task object identity',()=>{
 const tasks=[{t:'B',s:'done'},{t:'A',s:''},{t:'C',s:'miss'}];
 const originalTask=tasks[0];
 const f=fixture(tasks);f.api.setTaskOrder('alpha');
 assert.equal(f.api.moveTask(0,2),true);assert.equal(f.ctx.A.taskOrder,'manual');
 assert.deepEqual(Array.from(f.ctx.A.tasks,x=>x.t),['A','C','B']);
 assert.equal(f.ctx.A.tasks[2],originalTask);assert.equal(f.ctx.A.tasks[2].s,'done');
});
test('invalid sort names are rejected',()=>{
 const f=fixture([{t:'A'}]);
 assert.equal(f.api.setTaskOrder('__proto__'),false);
 assert.equal(f.api.setTaskOrder(null),false);
 assert.equal(f.calls.saved,0);
});
