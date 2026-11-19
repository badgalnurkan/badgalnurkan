'use strict';
// Uses actual LOCAL Supabase Auth and PostgREST, with synthetic users only.
// An executable proof, NOT a claim that legacy clients have been made safe.
const assert=require('node:assert/strict');
const base=String(process.env.API_URL||'').replace(/\/$/,'');
const anon=process.env.ANON_KEY;
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)||!anon){
  throw Error('Safety gate: local-only Supabase endpoint/key required');
}
async function request(endpoint,token,body,method='POST'){
  const r=await fetch(base+endpoint,{
    method,headers:{apikey:anon,Authorization:'Bearer '+(token||anon),
      'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),
    signal:AbortSignal.timeout(15000)
  });
  const raw=await r.text();let data=raw;
  try{if(raw)data=JSON.parse(raw)}catch(_){}
  return {ok:r.ok,status:r.status,data};
}
function ok(r,label){assert.equal(r.ok,true,label+': '+r.status+' '+JSON.stringify(r.data));return r.data}
async function signIn(email,password){
  const r=await request('/auth/v1/token?grant_type=password',undefined,{email,password});
  return ok(r,'password login').access_token;
}
async function load(token){
  return ok(await request('/rest/v1/rpc/iydu_load',token,{p_username:''}),'load')[0].data;
}
async function cas(token,expected,newData){
  return request('/rest/v1/rpc/iydu_save_cas',token,{
    p_expected_data:expected,p_data:newData
  });
}
async function main(){
  const email='cas-test-'+Date.now().toString(36)+'@example.com';
  const password='CAS-Synthetic-Valid-Password-2026!';
  const username='CasProbe';
  ok(await request('/auth/v1/signup',undefined,{
    email,password,data:{username,nick:'Synthetic'}
  }),'signup');
  // Separate sessions for the same real auth.uid(), representing two devices.
  const a=await signIn(email,password);
  const b=await signIn(email,password);
  const first=await load(a),second=await load(b);
  assert.deepEqual(first,{},'Signup trigger should leave initial user JSON empty');
  assert.deepEqual(second,first);
  const fromA={u:username,tasks:[{id:'a'}],journal:{key:'A'}};
  const fromB={u:username,tasks:[{id:'b'}],journal:{key:'B'}};

  const [ra,rb]=await Promise.all([
    cas(a,first,fromA),cas(b,second,fromB)
  ]);
  const responses=[ra,rb].map(r=>ok(r,'CAS request'));
  assert.deepEqual(responses.sort(),[false,true],
    'One concurrent request should fail due to a changed base JSON');
  const committed=await load(a);
  const winner=ra.data===true?fromA:fromB;
  assert.deepEqual(committed,winner,'Losing writer overwrote winning state');
  assert.equal((await cas(b,second,fromB)).data,false,
    'Stale retry should not change remote data');

  // After explicitly loading current state, a new update can succeed.
  const refreshed=await load(b);
  const good={...refreshed,tasks:[...refreshed.tasks,{id:'fresh'}]};
  assert.equal(ok(await cas(b,refreshed,good),'fresh CAS'),true);
  assert.deepEqual(await load(a),good);

  // No client can save a different username from its reservation.
  const badName=await cas(a,good,{...good,u:'OtherName'});
  assert.equal(badName.ok,false);
  assert.equal(badName.data?.code,'22023');
  assert.deepEqual(await load(a),good);

  // Existing deployed clients are denied blind writes; the pending draft
  // remains in their browser rather than destroying newer cloud edits.
  const old=await request('/rest/v1/rpc/iydu_save',a,{
    p_username:username,p_nick:'Synthetic',p_data:fromA
  });
  assert.equal(old.ok,false,'Legacy writer was not blocked');
  assert.equal(old.data?.code,'P0001','Legacy writer should report client upgrade');
  assert.deepEqual(await load(b),good,'Legacy writer changed CAS state');

  // Authenticated role cannot directly bypass RPC through the Data API.
  const direct=await request('/rest/v1/user_data?user_id=eq.'+
    (await request('/auth/v1/user',a,undefined,'GET')).data.id,a,
    {data:fromA},'PATCH');
  assert.equal(direct.ok,false,'Direct table writer bypassed CAS');

  // Regression: a diary written on 19 November must not disappear when a
  // second device sends a stale snapshot with a different day's diary.
  // All texts below are synthetic and this script refuses hosted endpoints.
  const diaryBase=await load(a);
  const desktopDiary={...diaryBase,journal:{
    ...(diaryBase.journal||{}),
    '2026-11-19':{text:'synthetic desktop diary',updatedAt:1795046400000}
  }};
  const phoneDiary={...diaryBase,journal:{
    ...(diaryBase.journal||{}),
    '2026-11-20':{text:'synthetic phone diary',updatedAt:1795132800000}
  }};
  assert.equal(ok(await cas(a,diaryBase,desktopDiary),'desktop diary CAS'),true);
  assert.equal(ok(await cas(b,diaryBase,phoneDiary),'stale phone diary CAS'),false,
    'A stale phone must not erase the 19 November diary');
  assert.deepEqual(await load(a),desktopDiary,
    '19 November diary was overwritten by the phone snapshot');

  // After a fresh read, reconciling disjoint calendar days is safe.
  // This explicitly models a review/merge; the app does not silently
  // auto-merge drafts, and concurrent edits of the SAME day need review.
  const recent=await load(b);
  const reviewed={...recent,journal:{...recent.journal,
    '2026-11-20':phoneDiary.journal['2026-11-20']}};
  assert.equal(ok(await cas(b,recent,reviewed),'reviewed diary CAS'),true);
  const both=await load(a);
  assert.equal(both.journal['2026-11-19'].text,'synthetic desktop diary');
  assert.equal(both.journal['2026-11-20'].text,'synthetic phone diary');

  const staleSameDay={...both,journal:{...both.journal,
    '2026-11-19':{text:'synthetic phone conflicting edit'}}};
  const desktopEdit={...both,journal:{...both.journal,
    '2026-11-19':{text:'synthetic desktop updated edit'}}};
  assert.equal(ok(await cas(a,both,desktopEdit),'same-day desktop CAS'),true);
  assert.equal(ok(await cas(b,both,staleSameDay),'same-day stale CAS'),false);
  assert.equal((await load(a)).journal['2026-11-19'].text,
    'synthetic desktop updated edit',
    'A conflicting same-day edit overwrote the newer diary');

  console.log('PASS: two concurrent CAS writes serialize; stale retries are rejected.');
  console.log('PASS: legacy blind writer and direct UPDATE are denied by the staged server rollout.');
  console.log('Not tested by this test: browser conflict UI, production rollout or Google provider.');
}
main().catch(e=>{console.error('CAS experiment failed:',e.stack||e);process.exitCode=1});
