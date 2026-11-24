'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),pad=require('../offline-pad.js');
const entries=new Map(),sessions=new Map();
const storage=m=>({getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),key:i=>[...m.keys()][i],get length(){return m.size}});
Object.defineProperty(globalThis,'localStorage',{value:storage(entries),configurable:true});Object.defineProperty(globalThis,'sessionStorage',{value:storage(sessions),configurable:true});
test.beforeEach(()=>{entries.clear();sessions.clear()});
test('offline entry is account-scoped, survives reopening and is applied only once',()=>{
 pad.remember('owner-a');const a=pad.newEntry('owner-a','task','2026-11-24','  Write today  ');
 pad.newEntry('owner-b','note','2026-11-24','Other account');
 sessions.clear();assert.equal(pad.owner(),'owner-a');assert.deepEqual(pad.list('owner-a'),[a]);
 const profile={authUid:'owner-a',day:a.day};assert.equal(pad.apply({authUid:'owner-b'},a),'owner');
 assert.equal(pad.apply(profile,a),'added');assert.equal(pad.apply(profile,a),'already');assert.equal(profile.tasks[0].t,'Write today');
 pad.forget('owner-a');assert.equal(pad.owner(),'');assert.equal(pad.list('owner-a').length,1);
 pad.remove('owner-a',a.id);assert.equal(pad.list('owner-b').length,1);
});
test('notes competing for the same date both survive until the author selects another date',()=>{
 const profile={authUid:'u',day:'2026-11-24',future:{'2026-11-30':'Other device'}};
 const e=pad.newEntry('u','note','2026-11-30','Offline text');assert.equal(pad.apply(profile,e),'conflict');
 assert.equal(profile.future[e.day],'Other device');assert.deepEqual(pad.list('u'),[e]);assert.equal(profile.offlineDraftIds,undefined);
 const moved={...e,day:'2026-12-01'};pad.put(moved);assert.equal(pad.apply(profile,moved),'added');assert.equal(profile.future[moved.day],'Offline text');
});
test('offline dates use the civil calendar and previous and future tasks keep their dates',()=>{
 assert.throws(()=>pad.newEntry('u','note','2027-02-29','invalid'));const profile={authUid:'u',day:'2028-03-01'};
 const a=pad.newEntry('u','task','2028-02-29','leap day'),b=pad.newEntry('u','task','2028-03-02','tomorrow');
 assert.equal(pad.apply(profile,a),'added');assert.equal(profile.hist[a.day][0].id,a.id);assert.equal(pad.apply(profile,b),'added');assert.deepEqual(profile.plans[b.day],['tomorrow']);
});

const vm=require('node:vm'),fs=require('node:fs');
function reconciliationFixture(accept){
 const uid='fixture-owner',copy=v=>JSON.parse(JSON.stringify(v));
 const local={u:'fixture',authUid:uid,day:'2026-11-24',tasks:[]};
 let server={...copy(local),theme:'dark'},pending=null;
 const entry=pad.newEntry(uid,'task',local.day,'Saved while offline');
 const context={
  A:local,view:'app',tr:()=>false,sbSession:()=>({user:{id:uid}}),
  navigator:{onLine:true},window:{addEventListener(){}},
  document:{hidden:false,activeElement:{matches:()=>true},querySelector:()=>null,getElementById:()=>null,addEventListener(){}},
  IYOfflinePad:pad,cloudBlockedDrafts:new Set(),cloudRecoveredDrafts:new Map(),cloudOwnDrafts:new Map(),
  cloudPushInFlight:new Map(),cloudBaselines:new Map([[uid,JSON.stringify(local)]]),
  cloudContent:JSON.stringify,cloudProfilePayload:copy,
  cloudDraftEntries:()=>pending?[pending]:[],
  cloudStageDraft:()=>{pending={key:'fixture-draft',base:copy(local),profile:copy(local)};entries.set(pending.key,'pending');return pending.key},
  save:()=>context.cloudStageDraft(),
  cloudMergeDraft:(_base,profile,latest)=>({merged:{...profile,theme:latest.theme},conflicts:[]}),
  cloudRemoveDraft:key=>{entries.delete(key);pending=null},
  sbPull:async()=>copy(server),
  sb:async(_path,{body})=>{assert.deepEqual(body.p_expected_data,server);if(accept)server=copy(body.p_data);return accept},
  localStorage:storage(entries),setTimeout:()=>1,clearTimeout(){}
 };
 vm.createContext(context);
 vm.runInContext(fs.readFileSync('cloud-reconcile.js','utf8')+'\nthis.reconcile=IYReconcile;',context);
 return {uid,entry,local,context,remote:()=>server,pending:()=>pending};
}
test('server-confirmed offline entry is acknowledged even when a focused editor prevents profile rendering',async()=>{
 const f=reconciliationFixture(true);
 assert.equal(await f.context.reconcile.check(),false,'focused input prevents a full profile refresh');
 assert.equal(f.remote().offlineDraftIds[f.entry.id],true);
 assert.equal(f.remote().tasks[0].id,f.entry.id);
 assert.equal(pad.list(f.uid).length,0);
 assert.equal(f.pending(),null);
});
test('a rejected server write retains the offline entry and the pending snapshot',async()=>{
 const f=reconciliationFixture(false);
 assert.equal(await f.context.reconcile.check(),false);
 assert.equal(f.remote().offlineDraftIds,undefined);
 assert.equal(pad.list(f.uid).length,1);
 assert.ok(f.pending());
});
