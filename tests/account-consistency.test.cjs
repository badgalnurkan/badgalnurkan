// Regression coverage for the deployed index.html account-identity logic.
// Run: node --test tests/account-consistency.test.cjs
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';

function section(start,end){
  const a=script.indexOf(start),b=script.indexOf(end,a+start.length);
  assert.ok(a>=0 && b>a,'Missing code section: '+start);
  return script.slice(a,b);
}
function helpers(accounts,A=null){
  const code=section('const usernameIdentityKey=', '/* hesap kaydi her zaman localStorage');
  const DB={accounts};
  return {DB,...new Function('DB','A',code+';return {findUser,cachedUsernameConflict,cacheCloudAccount,rekeyCachedAccount};')(DB,A)};
}

test('deployed index.html JavaScript has valid syntax',()=>{
  assert.ok(script.length>1000);
  assert.doesNotThrow(()=>new Function(script));
});
test('Turkish username case-folding agrees on İ / i and Ö / ö',()=>{
  const {findUser}=helpers({'İrem':{u:'İrem'},'Öznur':{u:'Öznur'}});
  assert.equal(findUser('irem'),'İrem');
  assert.equal(findUser('öznur'),'Öznur');
});
test('cloud restore removes old username alias for the same auth UID',()=>{
  const a={u:'Eski',authUid:'uid-1'},other={u:'Diger',authUid:'uid-2'};
  const {DB,cacheCloudAccount}=helpers({Eski:a,Diger:other},a);
  cacheCloudAccount({u:'Öznur',authUid:'uid-1'});
  assert.deepEqual(Object.keys(DB.accounts).sort(),['Diger','Öznur']);
  assert.strictEqual(DB.accounts.Diger,other);
});
test('cloud restore must not overwrite a different identity under the same name',()=>{
  const a={u:'Eski',authUid:'uid-1'},other={u:'Öznur',authUid:'uid-2'};
  const {DB,cacheCloudAccount}=helpers({Eski:a,'Öznur':other},a);
  assert.throws(()=>cacheCloudAccount({u:'Öznur',authUid:'uid-1'}),/LOCAL_USERNAME_CACHE_CONFLICT/);
  assert.strictEqual(DB.accounts['Öznur'],other);
  assert.strictEqual(DB.accounts.Eski, a);
});
test('local rename preserves all unrelated accounts and removes the old alias',()=>{
  const a={u:'Eski',authUid:'uid-1'},other={u:'Diger',authUid:'uid-2'};
  const {DB,rekeyCachedAccount}=helpers({Eski:a,Diger:other},a);
  rekeyCachedAccount(a,'Öznur');
  assert.deepEqual(Object.keys(DB.accounts).sort(),['Diger','Öznur']);
  assert.equal(DB.accounts['Öznur'].u,'Öznur');
  assert.strictEqual(DB.accounts.Diger,other);
});
test('username update differentiates network, permission, and actual uniqueness errors',()=>{
  const code=section('function usernameUpdateErrorMessage(error){','function profilePasswordMarkup(){');
  const message=new Function('tr','t',code+';return usernameUpdateErrorMessage;')(()=>true,()=> 'Bu kullanıcı adı alınmış.');
  assert.match(message({name:'AbortError'}),/zaman aşımı/);
  assert.match(message({status:403}),/yetki/);
  assert.match(message({message:'Failed to fetch'}),/sunucu hatası/);
  assert.equal(message({code:'23505'}),'Bu kullanıcı adı alınmış.');
});
test('profile rename checks server independently and sync errors are visible',()=>{
  const hint=section('async function profileUsernameHint(name,targetId){','function usernameUpdateErrorMessage(error){');
  assert.match(hint,/iydu_username_available/);
  assert.match(hint,/if\(A\.authUid\)/);
  assert.match(script,/function warnCloudSyncFailure\(/);
  assert.match(script,/if\(A\.authUid&&!await sbPush\(\)\)/);
});
