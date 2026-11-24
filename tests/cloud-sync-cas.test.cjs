'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'Application script missing');
const begin=source.indexOf('const cloudBaselines=new Map();');
const end=source.indexOf('// The database owns the old/new-user cutoff;',begin);
assert.ok(begin>=0&&end>begin,'Cloud CAS section missing');
const cloudCode=source.slice(begin,end);
function fixture(){
 const account={u:'first',nick:'First',authUid:'owner-one',pw:'private-password',salt:'do-not-upload',tasks:[{t:'Keep existing task'}]};
 let session={access_token:'test-token',user:{id:'owner-one'}};
 const calls=[],notices=[],timers=[];
 const context={
  A:account,view:'app',tr:()=>false,toast:text=>notices.push(text),
  sbSession:()=>session,sbRefresh:async()=>false,
  sb:async(path,options)=>{calls.push({path,options});return true},
  setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},
  schedulePush:()=>{context.scheduled=(context.scheduled||0)+1}
 };
 vm.createContext(context);
 vm.runInContext(cloudCode+'\nthis.cloudApi={sbPush,sbPull,cloudBaselines,cloudPushInFlight,cloudProfilePayload};',context);
 return {context,api:context.cloudApi,account,calls,notices,timers,setSession(value){session=value}};
}
const original={u:'first',nick:'Remote first',authUid:'owner-one',tasks:[]};
test('a verified cloud pull establishes the exact account-scoped comparison baseline',async()=>{
 const f=fixture();
 f.context.sb=async(path)=>{assert.match(path,/iydu_load/);return [{data:original}]};
 const profile=await f.api.sbPull();
 assert.equal(profile.nick,'Remote first');
 assert.equal(f.api.cloudBaselines.get('owner-one'),JSON.stringify(original));
 assert.equal(f.api.cloudBaselines.has('owner-two'),false);
});
test('CAS sends the last observed profile; password and salt never reach the cloud',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 assert.equal(await f.api.sbPush(),true);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].path,'/rest/v1/rpc/iydu_sync_profile');
 assert.equal(JSON.stringify(f.calls[0].options.body.p_expected_data),JSON.stringify(original));
 assert.equal(f.calls[0].options.body.p_data.authUid,'owner-one');
 assert.equal(f.calls[0].options.body.p_data.pw,'');
 assert.equal('salt' in f.calls[0].options.body.p_data,false);
 assert.equal(JSON.parse(f.api.cloudBaselines.get('owner-one')).pw,'');
});
test('CAS conflict never falls back to a destructive unconditional overwrite',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 f.context.sb=async(path,options)=>{f.calls.push({path,options});return false};
 const before=JSON.stringify(f.account);
 assert.equal(await f.api.sbPush(),false);
 assert.equal(JSON.stringify(f.account),before);
 assert.equal(f.api.cloudBaselines.get('owner-one'),JSON.stringify(original));
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].path,'/rest/v1/rpc/iydu_sync_profile');
 assert.equal(f.notices.length,1);
});
test('network failure retains local changes and does not invent a successful cloud write',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 f.context.sb=async()=>{throw new Error('Offline')};
 assert.equal(await f.api.sbPush(),false);
 assert.equal(f.account.tasks[0].t,'Keep existing task');
 assert.equal(f.api.cloudBaselines.get('owner-one'),JSON.stringify(original));
});
test('unknown cloud baseline or a different login identity blocks writes',async()=>{
 const f=fixture();
 assert.equal(await f.api.sbPush(),false);
 assert.equal(f.calls.length,0);
 f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 f.setSession({access_token:'second-token',user:{id:'owner-two'}});
 assert.equal(await f.api.sbPush(),false);
 assert.equal(f.calls.length,0);
});
test('simultaneous cloud saves are serialized per account',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 let resolve;
 f.context.sb=async(path,options)=>{f.calls.push({path,options});return await new Promise(done=>{resolve=done})};
 const first=f.api.sbPush(),second=f.api.sbPush();
 assert.equal(f.calls.length,1);
 resolve(true);
 assert.equal(await first,true);
 assert.equal(await second,true);
 assert.equal(f.calls.length,1);
});
test('a sign-out during an in-flight write cannot set a stale baseline for a new session',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 let resolve;f.context.sb=async()=>new Promise(done=>{resolve=done});
 const pending=f.api.sbPush();
 f.setSession({access_token:'other-token',user:{id:'owner-two'}});
 resolve(true);
 assert.equal(await pending,true);
 assert.equal(f.api.cloudBaselines.get('owner-one'),JSON.stringify(original));
 assert.equal(f.api.cloudBaselines.has('owner-two'),false);
});
test('edits made during an in-flight save trigger a follow-up save after success',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 let resolve;f.context.sb=async()=>new Promise(done=>{resolve=done});
 const pending=f.api.sbPush();
 f.account.tasks.push({t:'Edited while sending'});
 resolve(true);
 assert.equal(await pending,true);
 assert.equal(f.timers.length,1);
 assert.equal(f.timers[0].delay,0);
 f.timers[0].fn();
 assert.equal(f.context.scheduled,1);
});
test('an expired credential retries only for the original verified account',async()=>{
 const f=fixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 let attempts=0,refreshes=0;
 f.context.sb=async()=>{attempts++;if(attempts===1)throw Object.assign(new Error('Expired'),{status:401});return true};
 f.context.sbRefresh=async()=>{refreshes++;return true};
 assert.equal(await f.api.sbPush(),true);
 assert.equal(attempts,2);assert.equal(refreshes,1);
});


/* Exercise the actual persistence function, not an independently reimplemented model. */
function persistenceFixture(persist){
 const start=source.indexOf('const save=()=>{');
 const stop=source.indexOf('/* oturum:',start);
 assert.ok(start>=0&&stop>start,'Local persistence function missing');
 const account={u:'fixture',tasks:[{t:'Unsynced draft'}]};
 const warnings=[];
 let pushes=0,touches=0;
 const context={A:account,DB:{accounts:{fixture:account}},LSK:'fixture-local-store',
  setItem:()=>persist(),touchSession:()=>{touches++},schedulePush:()=>{pushes++},
  view:'app',tr:()=>false,toast:message=>warnings.push(message),
  console:{warn:message=>warnings.push(message)}};
 vm.createContext(context);
 vm.runInContext(source.slice(start,stop)+'\nthis.persist=save;',context);
 return {account,warnings,run:()=>context.persist(),pushes:()=>pushes,touches:()=>touches};
}
test('successful local persistence schedules normal cloud sync without warning',()=>{
 const f=persistenceFixture(()=>true);f.run();
 assert.equal(f.pushes(),1);assert.equal(f.touches(),1);assert.equal(f.warnings.length,0);
});
test('failed durable local persistence is reported rather than silently swallowed',()=>{
 const f=persistenceFixture(()=>false);f.run();
 assert.equal(f.account.tasks[0].t,'Unsynced draft');
 assert.ok(f.warnings.length>0,'A failed persistent write must not be silently treated as saved');
});
test('a thrown storage exception is reported and leaves the in-memory draft intact',()=>{
 const f=persistenceFixture(()=>{throw new Error('Synthetic storage quota exceeded')});f.run();
 assert.equal(f.account.tasks[0].t,'Unsynced draft');
 assert.ok(f.warnings.length>0,'Storage exception must be surfaced');
});


function profileCollisionFixture(accounts){
 const start=source.indexOf('function v13ProtectLegacyCollision(');
 const stop=source.indexOf('/* V13.1:',start);
 assert.ok(start>=0&&stop>start);
 const context={DB:{accounts},findUser:name=>Object.keys(accounts).find(k=>k.toLowerCase()===String(name).toLowerCase()),accountCloudHints:a=>!!(a.authUid||a.accountOrigin==='cloud')};
 vm.createContext(context);
 vm.runInContext(source.slice(start,stop)+'\nthis.guard=v13ProtectLegacyCollision;',context);
 return context.guard;
}
test('a renamed cloud account cannot replace a different cached identity even with a legacy migration flag',()=>{
 const accounts={Sample:{authUid:'owner-one',accountOrigin:'cloud',tasks:[{t:'first owner'}]},other:{authUid:'owner-two',accountOrigin:'cloud'},third:{authUid:'owner-three',accountOrigin:'cloud'}};
 const before=JSON.stringify(accounts),guard=profileCollisionFixture(accounts);
 for(const allow of [false,true])assert.throws(()=>guard('sample','owner-two',allow),/V13_LOCAL_USERNAME_COLLISION/);
 assert.equal(JSON.stringify(accounts),before);
});
test('the same cloud UUID and a genuinely free username are allowed',()=>{
 const guard=profileCollisionFixture({Sample:{authUid:'owner-one',accountOrigin:'cloud'}});
 assert.doesNotThrow(()=>guard('Sample','owner-one'));
 assert.doesNotThrow(()=>guard('available','owner-two'));
});
test('only an explicitly approved legacy migration may replace a legacy local account',()=>{
 const guard=profileCollisionFixture({sample:{accountOrigin:'local',pw:'synthetic-local-hash'}});
 assert.throws(()=>guard('sample','owner-one'),/V13_LOCAL_USERNAME_COLLISION/);
 assert.doesNotThrow(()=>guard('sample','owner-one',true));
});


function draftStorage(){
 const records=new Map();
 return {get length(){return records.size},key:i=>[...records.keys()][i]??null,getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,String(value)),removeItem:key=>records.delete(key)};
}
let draftSequence=0;
function durableFixture(storage=draftStorage(),uid='owner-one'){
 const f=fixture();
 f.context.localStorage=storage;
 f.context.rndHex=()=>String(++draftSequence).padStart(32,'0');
 f.account.authUid=uid;
 f.setSession({access_token:'synthetic-token',user:{id:uid}});
 vm.runInContext('this.drafts={cloudStageDraft,cloudDraftEntries,cloudResumeProfile,cloudMergeDraft,cloudBlockedDrafts,cloudForgetDrafts};',f.context);
 return {...f,storage,drafts:f.context.drafts};
}
test('offline snapshot survives creation of a fresh application context',async()=>{
 const f=durableFixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 f.context.sb=async()=>{throw Error('Synthetic offline')};
 assert.equal(await f.api.sbPush(),false);
 assert.equal(f.drafts.cloudDraftEntries('owner-one').length,1);
 const reopened=durableFixture(f.storage);reopened.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 const recovered=reopened.drafts.cloudResumeProfile('owner-one',original);
 assert.equal(recovered.tasks[0].t,'Keep existing task');
 assert.equal(reopened.drafts.cloudBlockedDrafts.has('owner-one'),false);
 reopened.context.A=recovered;
 assert.equal(await reopened.api.sbPush(),true);
 assert.equal(reopened.drafts.cloudDraftEntries('owner-one').length,0);
});
test('independent fields merge, same-field edits and deletion conflicts do not',()=>{
 const f=durableFixture();
 const base={authUid:'owner-one',tasks:[],nick:'Initial',journal:{day:'initial'}};
 const remote={...base,nick:'Server name'};
 const local={...base,tasks:[{t:'New task'}]};
 const result=f.drafts.cloudMergeDraft(base,local,remote);
 assert.equal(result.conflicts.length,0);
 assert.equal(result.merged.nick,'Server name');
 assert.equal(result.merged.tasks[0].t,'New task');
 const conflict=f.drafts.cloudMergeDraft(base,local,{...remote,tasks:[{t:'Other task'}]});
 assert.equal(conflict.conflicts.join(','),'tasks');
 const deleted={...base};delete deleted.journal;
 assert.equal(f.drafts.cloudMergeDraft(base,deleted,{...base,journal:{day:'Edited'}}).conflicts.join(','),'journal');
});
test('ambiguous array conflict pauses automatic writes and keeps the durable draft',async()=>{
 const f=durableFixture();
 f.api.cloudBaselines.set('owner-one',JSON.stringify(original));f.drafts.cloudStageDraft(f.account);
 const remote={...original,tasks:[{t:'Another device task'}]};
 const reopened=durableFixture(f.storage);
 reopened.api.cloudBaselines.set('owner-one',JSON.stringify(remote));
 const recovered=reopened.drafts.cloudResumeProfile('owner-one',remote);
 assert.equal(recovered.tasks[0].t,'Another device task');
 assert.equal(reopened.drafts.cloudBlockedDrafts.has('owner-one'),true);
 reopened.context.A=recovered;
 assert.equal(await reopened.api.sbPush(),false);
 assert.equal(reopened.calls.length,0);
 assert.ok(reopened.drafts.cloudDraftEntries('owner-one').some(d=>d.profile.tasks[0].t==='Keep existing task'));
});
test('three synthetic identities have independent drafts in the same browser storage',()=>{
 const storage=draftStorage();
 for(const uid of ['owner-one','owner-two','owner-three']){
  const f=durableFixture(storage,uid);f.api.cloudBaselines.set(uid,JSON.stringify({}));
  f.account.tasks=[{t:uid}];f.drafts.cloudStageDraft(f.account);
 }
 for(const uid of ['owner-one','owner-two','owner-three']){
  const f=durableFixture(storage,uid);
  const entries=f.drafts.cloudDraftEntries(uid);
  assert.equal(entries.length,1);assert.equal(entries[0].profile.tasks[0].t,uid);
  assert.throws(()=>f.drafts.cloudResumeProfile('different-owner',null),/Account changed/);
 }
});
test('two tabs of the same synthetic account use separate durable snapshot keys',()=>{
 const storage=draftStorage(),a=durableFixture(storage),b=durableFixture(storage);
 for(const f of [a,b])f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 a.account.tasks=[{t:'Tab A'}];b.account.tasks=[{t:'Tab B'}];
 a.drafts.cloudStageDraft(a.account);b.drafts.cloudStageDraft(b.account);
 assert.equal(a.drafts.cloudDraftEntries('owner-one').length,2);
 a.account.tasks.push({t:'Tab A second'});a.drafts.cloudStageDraft(a.account);
 const entries=b.drafts.cloudDraftEntries('owner-one');
 assert.equal(entries.length,2);assert.ok(entries.some(d=>d.profile.tasks[0].t==='Tab B'));
});
test('a previously committed snapshot with lost response is acknowledged on re-entry',()=>{
 const f=durableFixture();f.api.cloudBaselines.set('owner-one',JSON.stringify(original));
 f.drafts.cloudStageDraft(f.account);
 const remote=JSON.parse(JSON.stringify(f.api.cloudProfilePayload(f.account)));remote.iyduSyncVersion='new-server-version';
 const reopened=durableFixture(f.storage);
 reopened.drafts.cloudResumeProfile('owner-one',remote);
 assert.equal(reopened.drafts.cloudDraftEntries('owner-one').length,0);
});
test('a malformed outbox record never gets silently removed or uploaded',()=>{
 const f=durableFixture();
 const key='iydu.outbox.v1.owner-one.invalid';
 f.storage.setItem(key,JSON.stringify({uid:'owner-one',base:{},profile:{authUid:'owner-two'}}));
 assert.throws(()=>f.drafts.cloudResumeProfile('owner-one',original),/Invalid account outbox record/);
 assert.ok(f.storage.getItem(key));
});
