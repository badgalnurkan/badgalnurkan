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
  const DB={accounts},archives=new Map();
  const setItem=(k,v)=>{archives.set(k,v);return true};
  const rndHex=()=> 'beefcafe';
  return {DB,archives,...new Function('DB','A','setItem','rndHex',code+';return {findUser,cachedUsernameConflict,cacheCloudAccount,rekeyCachedAccount};')(DB,A,setItem,rndHex)};
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
  const {DB,archives,cacheCloudAccount}=helpers({Eski:a,Diger:other},a);
  cacheCloudAccount({u:'Öznur',authUid:'uid-1'});
  assert.deepEqual(Object.keys(DB.accounts).sort(),['Diger','Öznur']);
  assert.strictEqual(DB.accounts.Diger,other);
  assert.equal(archives.size,1);
  assert.equal(JSON.parse([...archives.values()][0]).accounts.Eski.u,'Eski');
});
test('cloud restore must not overwrite a different identity under the same name',()=>{
  const a={u:'Eski',authUid:'uid-1'},other={u:'Öznur',authUid:'uid-2'};
  const {DB,cacheCloudAccount}=helpers({Eski:a,'Öznur':other},a);
  assert.throws(()=>cacheCloudAccount({u:'Öznur',authUid:'uid-1'}),/LOCAL_USERNAME_CACHE_CONFLICT/);
  assert.strictEqual(DB.accounts['Öznur'],other);
  assert.strictEqual(DB.accounts.Eski, a);
});
test('cloud alias cleanup fails closed when durable backup storage is unavailable',()=>{
  const old={u:'Eski',authUid:'uid-1'};
  const DB={accounts:{Eski:old}};
  const code=section('const usernameIdentityKey=', '/* hesap kaydi her zaman localStorage');
  const f=new Function('DB','A','setItem','rndHex',code+';return {cacheCloudAccount};')(
    DB,old,()=>false,()=> 'beefcafe'
  );
  assert.throws(()=>f.cacheCloudAccount({u:'Yeni',authUid:'uid-1'}),/LOCAL_ALIAS_BACKUP_FAILED/);
  assert.strictEqual(DB.accounts.Eski,old);
  assert.equal(DB.accounts.Yeni,undefined);
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
  assert.match(message({message:'Failed to fetch'}),/sunucu hatası/i);
  assert.equal(message({code:'23505'}),'Bu kullanıcı adı alınmış.');
});
test('profile rename checks server independently and sync errors are visible',()=>{
  const hint=section('async function profileUsernameHint(name,targetId){','function usernameUpdateErrorMessage(error){');
  assert.match(hint,/iydu_username_available/);
  assert.match(hint,/if\(A\.authUid\)/);
  assert.match(script,/function warnCloudSyncFailure\(/);
  assert.match(script,/if\(A\.authUid&&!await sbPush\(\)\)/);
});


test('valid password with failing profile download never reports invalid credentials',async()=>{
  const loginCode=section('async function login(){','async function setup(){');
  const run=new Function(loginCode+`
    let authBusy=false, msg='', loginDat={u:'',p:''}, A=null;
    const DB={accounts:{}}, tr=()=>true;
    const $=sel=>({value:sel==='#u'?'test@example.com':'correct-password'});
    const findUser=()=>undefined;
    const loginBusy=()=>{};
    const sbSignIn=async()=>({access_token:'valid',user:{id:'u1',email:'test@example.com'}});
    const activateCloudUser=async()=>{throw new Error('profile network error')};
    const renderAppOrAuth=()=>{};
    const greetThen=()=>{throw Error('Should not greet if profile download failed')};
    const authErrorMessage=()=> 'credentials';
    const accountCloudHints=()=>true, pwMatch=async()=>false, sbClear=()=>{};
    const norm=x=>x, restorePomodoroState=()=>{},applyTheme=()=>{},save=()=>{},goTo=()=>{},toast=()=>{};
    return async()=>{await login();return msg};
  `)();
  const message=await run();
  assert.match(message,/profil verilerin yüklenemedi/i);
  assert.ok(!/şifreni kontrol et/i.test(message));
});

test('profile changes never announce confirmed sync when server write fails',async()=>{
  const profileCode=section('async function saveProfile(){','/* Return one month of header buttons');
  const run=new Function(profileCode+`
    const A={u:'Eski',nick:'Old',authUid:'u1'};
    const DB={accounts:{Eski:A},last:'Old'};
    const userRe=/^.{3,20}$/;
    let notice='', syncWarning=false, closed=false;
    const $=sel=>({value:({'#prof-u':'Eski','#prof-n':'Changed','#prof-b':''})[sel]});
    const tr=()=>true, t=()=> 'Kaydedildi';
    const toast=msg=>{notice=msg};
    const cachedUsernameConflict=()=>false,rekeyCachedAccount=()=>{};
    const sb=async()=>true,profileUsernameHint=async()=>{};
    const usernameUpdateErrorMessage=()=> 'error';
    const save=()=>{},closeModal=()=>{closed=true},shell=()=>{};
    const sbPush=async()=>false,warnCloudSyncFailure=()=>{syncWarning=true};
    return async()=>{await saveProfile();return {notice,syncWarning,closed}};
  `)();
  const result=await run();
  assert.equal(result.notice,'');
  assert.equal(result.syncWarning,true);
  assert.equal(result.closed,true);
});
