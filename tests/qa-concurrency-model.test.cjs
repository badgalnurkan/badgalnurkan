'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Inline QA application script not found');
const start=script.indexOf('const cloudSyncState=');
const end=script.indexOf('// The database owns the old/new-user cutoff;',start);
assert.ok(start>=0&&end>start,'QA cloud CAS section absent');
const sync=script.slice(start,end);
const clone=value=>JSON.parse(JSON.stringify(value));

function serverWithAccounts(count){
 const rows=new Map();
 for(let i=0;i<count;i++)rows.set('account-'+i,{u:'user'+i,tasks:[]});
 const reads=[],writes=[];
 const connect=uid=>({
  read:async()=>{reads.push(uid);return clone(rows.get(uid))},
  cas:async(expected,desired)=>{
   await Promise.resolve(); // An interleaving point before the atomic compare.
   const current=rows.get(uid);
   if(JSON.stringify(current)!==JSON.stringify(expected))return false;
   rows.set(uid,clone(desired));writes.push(uid);return true;
  }
 });
 return {rows,reads,writes,connect};
}
function browser(uid,server){
 const route=server.connect(uid);
 const context={A:{authUid:uid,u:uid.replace('account-','user'),tasks:[]},console,
  tr:()=>false,toast:()=>context.warnings++,warnings:0,
  sbSession:()=>({user:{id:uid}}),sbRefresh:async()=>false,schedulePush:()=>{},
  sb:async(path,options)=>{
   if(path.includes('iydu_load'))return [{data:await route.read()}];
   if(path.includes('iydu_save_cas'))return route.cas(options.body.p_expected_data,options.body.p_data);
   throw Error('Blind overwrite detected: '+path);
  }
 };
 vm.createContext(context);vm.runInContext(sync,context);
 return context;
}

test('independent user identities cannot exchange writes during 120 concurrent QA simulations',async()=>{
 const n=120,db=serverWithAccounts(n),contexts=[];
 for(let i=0;i<n;i++){
  const x=browser('account-'+i,db);
  await x.sbPull();
  x.A.tasks.push('only-'+i);
  contexts.push(x);
 }
 const results=await Promise.all(contexts.map(x=>x.sbPush()));
 assert.ok(results.every(v=>v===true));
 assert.equal(db.writes.length,n);
 for(let i=0;i<n;i++){
  const row=db.rows.get('account-'+i);
  assert.deepEqual(row.tasks,['only-'+i],'account '+i+' must retain only its own task');
 }
});
test('two browsers with the same account cannot both overwrite one snapshot',async()=>{
 const db=serverWithAccounts(1),first=browser('account-0',db),second=browser('account-0',db);
 await Promise.all([first.sbPull(),second.sbPull()]);
 first.A.tasks.push('first-tab');
 second.A.tasks.push('second-tab');
 const outcomes=await Promise.all([first.sbPush(),second.sbPush()]);
 assert.deepEqual(outcomes.sort(),[false,true]);
 const tasks=db.rows.get('account-0').tasks;
 assert.ok(tasks.length===1&&['first-tab','second-tab'].includes(tasks[0]));
 assert.equal(first.warnings+second.warnings,1);
});
test('a login identity change between read and write fails closed',async()=>{
 const db=serverWithAccounts(2),x=browser('account-0',db);
 await x.sbPull();
 x.A.authUid='account-1';x.A.tasks.push('must-not-commit');
 assert.equal(await x.sbPush(),false);
 assert.deepEqual(db.rows.get('account-0').tasks,[]);
 assert.deepEqual(db.rows.get('account-1').tasks,[]);
});
