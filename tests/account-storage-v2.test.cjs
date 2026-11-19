'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {key,readAccount,saveAccount,migrateLegacyCloudAccounts}=require('../account-storage-v2.js');
const ids=[
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
];
function storage(overrides={}){
 const map=new Map();
 return {
   getItem:key=>map.has(key)?map.get(key):null,
   setItem:(key,value)=>{if(overrides.beforeSet)overrides.beforeSet(key,value);map.set(key,String(value))},
   removeItem:key=>map.delete(key),
   dump:()=>Object.fromEntries(map)
 };
}
function cloud(uid,task,extra={}){return {authUid:uid,u:'shared-name',tasks:[{t:task}],pw:'never-copy',salt:'never-copy',...extra}}
test('three cloud accounts have distinct physical keys even if usernames collide',()=>{
 const s=storage();
 ids.forEach((uid,i)=>saveAccount(s,uid,cloud(uid,'task-'+i)));
 assert.equal(Object.keys(s.dump()).length,3);
 ids.forEach((uid,i)=>{
  assert.equal(readAccount(s,uid).account.tasks[0].t,'task-'+i);
  assert.equal(readAccount(s,uid).account.pw,undefined);
  assert.equal(readAccount(s,uid).account.salt,undefined);
 });
 assert.equal(new Set(ids.map(key)).size,3);
});
test('editing one account cannot mutate other accounts or their storage bytes',()=>{
 const s=storage();ids.forEach((uid,i)=>saveAccount(s,uid,cloud(uid,'task-'+i)));
 const previous=s.dump(),a=readAccount(s,ids[0]).account;
 a.tasks[0].t='Edited only A';
 saveAccount(s,ids[0],a);
 assert.equal(readAccount(s,ids[0]).account.tasks[0].t,'Edited only A');
 assert.equal(s.dump()[key(ids[1])],previous[key(ids[1])]);
 assert.equal(s.dump()[key(ids[2])],previous[key(ids[2])]);
 assert.equal(readAccount(s,ids[0]).account.tasks[0].t,'Edited only A');
});
test('corrupted one account falls back only to its own verified backup',()=>{
 const s=storage();
 ids.forEach((uid,i)=>saveAccount(s,uid,cloud(uid,'task-'+i)));
 saveAccount(s,ids[0],cloud(ids[0],'new-A'));
 s.setItem(key(ids[0]),'corrupt JSON');
 assert.equal(readAccount(s,ids[0]).source,'backup');
 assert.equal(readAccount(s,ids[0]).account.tasks[0].t,'task-0');
 assert.equal(readAccount(s,ids[1]).account.tasks[0].t,'task-1');
 assert.equal(readAccount(s,ids[2]).account.tasks[0].t,'task-2');
 assert.throws(()=>saveAccount(s,ids[0],cloud(ids[0],'not-authorized')),/ACCOUNT_PRIMARY_CORRUPT/);
});
test('wrong owner UID or unsafe key cannot access a different account',()=>{
 const s=storage();saveAccount(s,ids[0],cloud(ids[0],'A'));
 assert.throws(()=>saveAccount(s,ids[1],cloud(ids[0],'A')),/ACCOUNT_OWNER_MISMATCH/);
 assert.throws(()=>key('../other'),/INVALID_ACCOUNT_UID/);
 assert.equal(readAccount(s,ids[1]),null);
 assert.equal(readAccount(s,ids[0]).account.tasks[0].t,'A');
});
test('legacy migration copies cloud accounts but leaves original blob untouched',()=>{
 const s=storage(),old={
  accounts:{alice:cloud(ids[0],'A'),bob:cloud(ids[1],'B'),charlie:cloud(ids[2],'C'),guest:{u:'guest',tasks:[{t:'local'}],pw:'local-only'}}
 };
 const original=JSON.stringify(old);
 s.setItem('b1',original);
 const result=migrateLegacyCloudAccounts(s,old);
 assert.equal(result.migrated.length,3);
 assert.deepEqual(result.skipped,['guest']);
 assert.equal(s.getItem('b1'),original);
 ids.forEach((uid,i)=>assert.equal(readAccount(s,uid).account.tasks[0].t,['A','B','C'][i]));
 const second=migrateLegacyCloudAccounts(s,old);
 assert.equal(second.migrated.length,0);
 assert.equal(second.existing.length,3);
});
test('migration never overwrites previously saved newer scoped account data',()=>{
 const s=storage(),record=cloud(ids[0],'latest');
 saveAccount(s,ids[0],record);
 const old={accounts:{old:cloud(ids[0],'stale')}};
 const result=migrateLegacyCloudAccounts(s,old);
 assert.equal(result.migrated.length,0);
 assert.equal(result.existing.length,1);
 assert.equal(readAccount(s,ids[0]).account.tasks[0].t,'latest');
});
test('ambiguous duplicate Auth UIDs abort migration before writing anything',()=>{
 const s=storage();
 const old={accounts:{alpha:cloud(ids[0],'A'),beta:cloud(ids[0],'different-A')}};
 assert.throws(()=>migrateLegacyCloudAccounts(s,old),/DUPLICATE_LEGACY_AUTH_UID/);
 assert.deepEqual(s.dump(),{});
});
test('storage quota failure does not delete the legacy data or healthy profiles',()=>{
 const s=storage({beforeSet:(k)=>{if(k===key(ids[1]))throw Error('QuotaExceededError')}});
 const old={accounts:{a:cloud(ids[0],'A'),b:cloud(ids[1],'B')}};
 s.setItem('b1',JSON.stringify(old));
 assert.throws(()=>migrateLegacyCloudAccounts(s,old),/QuotaExceededError/);
 assert.ok(s.getItem('b1'));
 assert.equal(readAccount(s,ids[0]).account.tasks[0].t,'A');
 assert.equal(readAccount(s,ids[1]),null);
});
test('non-persistent storage reads are not mistaken for successful writes',()=>{
 const s={getItem:()=>null,setItem:()=>{}};
 assert.throws(()=>saveAccount(s,ids[0],cloud(ids[0],'A')),/ACCOUNT_READBACK_FAILED/);
});
