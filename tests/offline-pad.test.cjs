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
