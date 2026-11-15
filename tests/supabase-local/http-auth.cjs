'use strict';
// Real HTTP integration against LOCAL Supabase Auth + PostgREST.
// No real addresses, users, tokens, hosted URLs or production credentials.
const assert=require('node:assert/strict');

const base=(process.env.API_URL||'').replace(/\/$/,'');
const anon=process.env.ANON_KEY||'';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)){
  throw Error('Safety gate: API_URL MUST be a localhost Supabase endpoint');
}
if(!anon)throw Error('Missing local ANON_KEY');

const prefix='iydu-ci-'+Date.now().toString(36)+'-';
const password='Synthetic-CI-Passphrase-3492!';
const email=n=>prefix+n+'@example.com';
const heads=(token)=>({
  'apikey':anon,
  'Authorization':'Bearer '+(token||anon),
  'Content-Type':'application/json'
});
async function call(path,{method='POST',token,body}={}){
  const res=await fetch(base+path,{
    method,headers:heads(token),
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(15000)
  });
  const raw=await res.text();
  let data=null;
  if(raw)try{data=JSON.parse(raw)}catch{data=raw}
  return {status:res.status,ok:res.ok,data};
}
function check(res,label){
  assert.equal(res.ok,true,label+' failed: HTTP '+res.status+' '+JSON.stringify({
    code:res.data?.code,error:res.data?.error,message:res.data?.msg||res.data?.message
  }));
  return res.data;
}
async function register(n,metadata){
  const address=email(n);
  const user=check(await call('/auth/v1/signup',{
    body:{email:address,password,data:metadata}
  }),'GoTrue signup '+n);
  assert.ok(user?.user?.id,'GoTrue returned no Auth user id');
  const session=check(await call('/auth/v1/token?grant_type=password',{
    body:{email:address,password}
  }),'GoTrue password login '+n);
  assert.ok(session?.access_token,'GoTrue issued no bearer token');
  assert.equal(session.user.id,user.user.id,'Signup identity differs from login identity');
  return {uid:user.user.id,token:session.access_token,email:address};
}
async function rpc(name,token,payload={}){
  return call('/rest/v1/rpc/'+name,{token,body:payload});
}
async function rows(table,token,filter=''){
  return check(await call('/rest/v1/'+table+'?select=*'+filter,{
    token,method:'GET'
  }),table+' query');
}
async function readName(user){
  return check(await rpc('iydu_my_username',user.token),'own username');
}
async function assertNewSignup(user,expected){
  assert.equal(await readName(user),expected);
  const profile=await rows('profiles',user.token);
  assert.equal(profile.length,1);
  assert.equal(profile[0].username,expected);
  const data=await rows('user_data',user.token);
  assert.equal(data.length,1);
  assert.deepEqual(data[0].data,{},'Auth trigger intentionally leaves JSON empty until first app save');
}
async function assertTriple(user,expected){
  assert.equal(await readName(user),expected,'reservation was incorrect');
  const ownProfiles=await rows('profiles',user.token);
  assert.equal(ownProfiles.length,1,'profile RLS visibility');
  assert.equal(ownProfiles[0].username,expected,'profiles.username out of sync');
  const dataRows=await rows('user_data',user.token);
  assert.equal(dataRows.length,1,'user_data RLS visibility');
  assert.equal(dataRows[0].data.u,expected,'JSON identity out of sync');
}

async function run(){
  const first=await register('first',{username:'FirstUser',nickname:'First Display'});
  await assertNewSignup(first,'FirstUser');
  assert.equal(check(await rpc('iydu_username_available',first.token,{
    p_username:'firstuser'
  }),'availability'),false,'existing username advertised available');

  // Independent identity may not see or mutate first account's RLS rows.
  const second=await register('second',{username:'SecondUser',nickname:'Second Display'});
  await assertNewSignup(second,'SecondUser');
  assert.equal(check(await rpc('iydu_save_cas',second.token,{
    p_expected_data:{},p_data:{u:'SecondUser'}
  }),'second CAS first app save'),true);
  await assertTriple(second,'SecondUser');
  assert.deepEqual(await rows('user_data',second.token,'&user_id=eq.'+first.uid),[],
    'User 2 read User 1 data via PostgREST');
  assert.deepEqual(await rows('profiles',second.token,'&id=eq.'+first.uid),[],
    'User 2 read User 1 profile via PostgREST');

  // CAS requires canonical name; old blind writes must fail closed.
  const oldWriter=await rpc('iydu_save',first.token,{
    p_username:'OldAlias',p_nick:'A',
    p_data:{u:'OldAlias',tasks:[{id:'obsolete'}]}
  });
  assert.equal(oldWriter.ok,false,'Old blind writer still allowed');
  const wrongName=await rpc('iydu_save_cas',first.token,{
    p_expected_data:{},p_data:{u:'OldAlias',tasks:[{id:'task-ci'}]}
  });
  assert.equal(wrongName.ok,false,'CAS accepted username mismatch');
  assert.equal(check(await rpc('iydu_save_cas',first.token,{
    p_expected_data:{},
    p_data:{u:'FirstUser',tasks:[{id:'task-ci'}],journal:{today:'synthetic journal'}}
  }),'first CAS write'),true);
  await assertTriple(first,'FirstUser');
  const before=check(await rpc('iydu_load',first.token,{p_username:''}),'load');
  assert.equal(before[0].data.tasks[0].id,'task-ci');
  assert.equal(before[0].data.journal.today,'synthetic journal');

  check(await rpc('iydu_set_username',first.token,{
    p_username:'NewFirst'
  }),'rename');
  await assertTriple(first,'NewFirst');
  assert.equal(check(await rpc('iydu_username_available',first.token,{
    p_username:'FirstUser'
  }),'old name availability'),true);
  const after=check(await rpc('iydu_load',first.token,{p_username:''}),'post rename load');
  assert.deepEqual(after[0].data.tasks,before[0].data.tasks,'rename changed tasks');
  assert.deepEqual(after[0].data.journal,before[0].data.journal,'rename changed journal');

  const conflict=await rpc('iydu_set_username',second.token,{
    p_username:'NEWFIRST'
  });
  assert.equal(conflict.ok,false,'Duplicate case-insensitive name unexpectedly allowed');
  assert.equal(conflict.data?.code,'23505','Wrong duplicate name error code');
  await assertTriple(second,'SecondUser');

  // Google-style first account: GoTrue user created without username metadata.
  // (NOT a claim that Google OAuth redirect itself was tested.)
  const noName=await register('no-username',{nickname:'No Name Yet'});
  assert.equal(await readName(noName),null,'Missing metadata unexpectedly reserved name');
  const unclaimed=await rpc('iydu_save_cas',noName.token,{
    p_expected_data:{},p_data:{u:'Unverified',tasks:[]}
  });
  assert.equal(unclaimed.ok,false,'Unclaimed identity wrote cloud JSON');
  assert.equal(unclaimed.data?.code,'P0001');
  check(await rpc('iydu_set_username',noName.token,{
    p_username:'ClaimedNow'
  }),'first-name claim');
  await assertTriple(noName,'ClaimedNow');
  assert.deepEqual((await rows('user_data',noName.token))[0].data,{u:'ClaimedNow'});

  // Browser preflight is only a hint; backend UNIQUE must reject parallel/duplicate writes.
  const duplicate=await call('/auth/v1/signup',{
    body:{email:email('duplicate'),password,data:{username:'newfirst'}}
  });
  assert.equal(duplicate.ok,false,
    'Duplicate username bypassed auth.users signup trigger');

  const directOverwrite=await call('/rest/v1/user_data?user_id=eq.'+first.uid,{
    method:'PATCH',token:first.token,
    body:{data:{u:'NewFirst',tasks:[{id:'blocked'}]}}
  });
  assert.equal(directOverwrite.ok,false,'Direct table UPDATE bypasses CAS');
  const directTruncate=await rows('user_data',first.token);
  assert.equal(directTruncate.length,1);
  const anonLookup=await rpc('iydu_my_username',undefined);
  assert.equal(anonLookup.ok,false,'Anonymous role called a private identity RPC');

  console.log('PASS local Supabase HTTP: Auth signup/login, triggers, RLS, claim, rename, conflicts, data preservation.');
  console.log('Not tested: actual Google OAuth provider, public deployment, cross-device JSON lost updates.');
}
run().catch(err=>{
  console.error('FAIL local Supabase HTTP checks:',err.stack||err);
  process.exitCode=1;
});
