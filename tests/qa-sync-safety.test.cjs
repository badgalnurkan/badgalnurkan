'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const start=script.indexOf('const cloudSyncState=');
const end=script.indexOf('// The database owns the old/new-user cutoff;',start);
assert.ok(start>0&&end>start,'QA compare-and-swap code not found');
const sync=script.slice(start,end);
function fixture(options={}){
 let server=JSON.parse(JSON.stringify(options.server||{u:'alpha',tasks:['start']})),requests=[];
 let resolveResponse=options.defer || null;
 const uid=options.uid||'qa-user-1';
 const ctx={
  A:{authUid:uid,u:'alpha',tasks:['start']},tr:()=>false,toast:()=>ctx.warnings++,warnings:0,
  sbSession:()=>({user:{id:uid}}),sbRefresh:async()=>false,schedulePush:()=>ctx.reschedules++,
  reschedules:0,
  sb:async(path,req)=>{
   requests.push({path,req});
   if(path.includes('iydu_load'))return [{data:JSON.parse(JSON.stringify(server))}];
   assert.ok(path.includes('iydu_save_cas'),'legacy blind overwrite is forbidden');
   if(resolveResponse)await resolveResponse;
   const expected=req.body.p_expected_data,data=req.body.p_data;
   if(options.failNetwork)throw Object.assign(Error('timeout'),{name:'AbortError'});
   if(JSON.stringify(server)!==JSON.stringify(expected))return false;
   server=JSON.parse(JSON.stringify(data));return true;
  },
  console,
 };
 vm.createContext(ctx);
 vm.runInContext(sync,ctx);
 return {ctx,requests,readServer:()=>server,overwriteServer:v=>{server=v}};
}
test('QA requires a cloud read before any save',async()=>{
 const f=fixture();
 assert.equal(await f.ctx.sbPush(),false);
 assert.equal(f.requests.length,0);
 assert.equal(f.ctx.warnings,1);
});
test('QA save uses a compare-and-swap snapshot and advances only after success',async()=>{
 const f=fixture();
 await f.ctx.sbPull();
 f.ctx.A.tasks.push('added');
 assert.equal(await f.ctx.sbPush(),true);
 assert.deepEqual(f.readServer().tasks,['start','added']);
 assert.equal(f.requests[1].req.body.p_expected_data.tasks[0],'start');
 assert.equal(f.requests[1].path,'/rest/v1/rpc/iydu_save_cas');
});
test('stale device cannot overwrite data written by another session',async()=>{
 const f=fixture();
 await f.ctx.sbPull();
 f.overwriteServer({u:'alpha',tasks:['updated-by-other-browser']});
 f.ctx.A.tasks.push('this-browser');
 assert.equal(await f.ctx.sbPush(),false);
 assert.deepEqual(f.readServer().tasks,['updated-by-other-browser']);
 assert.equal(f.ctx.warnings,1);
 assert.equal(await f.ctx.sbPush(),false,'blocked stale writer must not retry');
 assert.equal(f.requests.length,2);
});
test('timeout never triggers blind retries or reports success',async()=>{
 const f=fixture({failNetwork:true});
 await f.ctx.sbPull();
 f.ctx.A.tasks.push('offline');
 assert.equal(await f.ctx.sbPush(),false);
 assert.equal(f.requests.length,2);
 assert.equal(await f.ctx.sbPush(),false);
 assert.equal(f.ctx.warnings,1);
});
test('different authenticated identity is not allowed to write',async()=>{
 const f=fixture();
 await f.ctx.sbPull();
 f.ctx.A.authUid='other-account';
 assert.equal(await f.ctx.sbPush(),false);
 assert.equal(f.requests.length,1);
});
test('new browser username confusion message is explicit, not a false device diagnosis',()=>{
 assert.match(script,/cross-browser username login requires separate secure server verification/);
 assert.doesNotMatch(script,/Sign in with email on a new device\./);
});


test('simultaneous saves wait for confirmation of both changes, not a queued success',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const f=fixture({defer:gate});
 await f.ctx.sbPull();
 f.ctx.A.tasks.push('first-edit');
 const first=f.ctx.sbPush();
 f.ctx.A.tasks.push('second-edit');
 let secondResolved=false;
 const second=f.ctx.sbPush().then(result=>{secondResolved=true;return result});
 await Promise.resolve();
 assert.equal(secondResolved,false,'second save cannot claim success while the first is waiting');
 release();
 assert.equal(await first,true);
 assert.equal(await second,true);
 assert.equal(secondResolved,true);
 assert.deepEqual(f.readServer().tasks,['start','first-edit','second-edit']);
 assert.equal(f.requests.filter(x=>x.path.includes('iydu_save_cas')).length,2);
});
test('a conflict cannot be silently reset by another cloud pull',async()=>{
 const f=fixture();
 await f.ctx.sbPull();
 f.overwriteServer({u:'alpha',tasks:['remote-edit']});
 f.ctx.A.tasks.push('local-edit');
 assert.equal(await f.ctx.sbPush(),false);
 await assert.rejects(f.ctx.sbPull(),/CLOUD_SYNC_RECONCILIATION_REQUIRED/);
 assert.deepEqual(f.readServer().tasks,['remote-edit']);
 assert.equal(f.requests.filter(x=>x.path.includes('iydu_load')).length,1);
});
test('no-op save does not send a duplicate write',async()=>{
 const f=fixture({server:{authUid:'qa-user-1',u:'alpha',tasks:['start']}});
 await f.ctx.sbPull();
 f.ctx.A.tasks=['start'];
 assert.equal(await f.ctx.sbPush(),true);
 assert.equal(f.requests.filter(x=>x.path.includes('iydu_save_cas')).length,0);
});
