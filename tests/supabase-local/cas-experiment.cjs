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

  // LIMITATION: prior iydu_save does not take expected_data. It is still
  // callable and can overwrite newer JSON! Prove the risk rather than hide it.
  ok(await request('/rest/v1/rpc/iydu_save',a,{
    p_username:username,p_nick:'Synthetic',p_data:fromA
  }),'legacy full-JSON writer');
  assert.deepEqual(await load(b),fromA,
    'Existing writer did not behave as audited; update rollout assessment');

  console.log('PASS: local Supabase CAS prevents two concurrent new-RPC writes and stale retries.');
  console.log('CONFIRMED RELEASE BLOCKER: legacy iydu_save can still overwrite a newer CAS state.');
  console.log('This experimental RPC is NOT deployable without a safe legacy-writer cutover and client conflict UX.');
}
main().catch(e=>{console.error('CAS experiment failed:',e.stack||e);process.exitCode=1});
