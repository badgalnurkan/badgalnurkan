import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHandler} from '../../supabase/functions/browser-verification/handler.mjs';
const endpoint=process.env.API_URL,anon=process.env.ANON_KEY;
if(!endpoint||!['127.0.0.1','localhost'].includes(new URL(endpoint).hostname)||!anon)throw Error('Run only on the disposable local Auth stack');
const box=new Map();
const handler=createHandler({env:k=>({SUPABASE_URL:endpoint,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:process.env.SERVICE_ROLE_KEY,RESEND_API_KEY:'test-only-mailbox',ACCOUNT_MAIL_FROM:'test@example.invalid'})[k],
 fetchImpl:async(url,options)=>{
  if(url==='https://api.resend.com/emails'){
   const mail=JSON.parse(options.body);box.set(mail.to[0],mail.text.match(/\b\d{6}\b/)[0]);
   return Response.json({id:randomUUID()});
  }
  assert.equal(new URL(url).origin,new URL(endpoint).origin);return fetch(url,options);
 }});
async function api(path,body,token){
 const r=await fetch(endpoint+path,{method:body===undefined?'GET':'POST',headers:{apikey:anon,Authorization:'Bearer '+(token||anon),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await r.json().catch(()=>null);return {status:r.status,ok:r.ok,value};
}
async function checked(path,body,token){const r=await api(path,body,token);assert.ok(r.ok,path+' HTTP '+r.status+' '+String(r.value?.code||r.value?.error_code||''));return r.value}
async function gate(session,action,extra={}){
 const r=await handler(new Request('http://localhost/verify',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({action,...extra})}));
 const body=await r.json();assert.ok(r.ok,'Browser email '+action+' '+(body.code||r.status));return body;
}
const write=(s,baseline,data)=>checked('/rest/v1/rpc/iydu_sync_profile',{p_expected_data:baseline,p_data:data},s.access_token);
const read=async s=>(await checked('/rest/v1/rpc/iydu_load',{p_username:''},s.access_token))[0]?.data||{};
async function signIn(record){
 const session=await checked('/auth/v1/token?grant_type=password',{email:record.email,password:record.password});
 assert.equal((await gate(session,'status')).verified,false);
 assert.equal((await api('/rest/v1/rpc/iydu_sync_profile',{p_expected_data:{},p_data:{authUid:session.user.id}},session.access_token)).ok,false);
 const challenge=await gate(session,'request');
 assert.ok((await gate(session,'confirm',{id:challenge.id,code:box.get(record.email)})).verified);
 return session;
}
const people=[];
for(let i=0;i<3;i++){
 const record={email:'qa-'+randomUUID()+'@example.invalid',password:randomUUID()+'Aa7!'};
 await checked('/auth/v1/signup',{email:record.email,password:record.password,data:{username:'qa'+i}});
 const session=await signIn(record),doc={authUid:session.user.id,u:'qa'+i,tasks:[{id:randomUUID(),t:'Private '+i}],future:{}};
 assert.ok(await write(session,{},doc));people.push({record,session,doc});
}
// The per-account code delivery cooldown also applies on a different device.
await new Promise(resolve=>setTimeout(resolve,61000));
const a=people[0],second=await signIn(a.record),base=await read(a.session);
const desktop={...base,future:{'2030-05-01':'From desktop'}},phone={...base,future:{'2030-05-02':'From phone'}};
const race=await Promise.all([write(a.session,base,desktop),write(second,base,phone)]);
assert.deepEqual([...race].sort(),[false,true]);
const latest=await read(second),loser=race[0]?phone:desktop;
const {default:merge}=await import('../../profile-merge.js');
const joined=merge.merge(base,loser,latest);assert.deepEqual(joined.conflicts,[]);assert.equal(await write(second,latest,joined.merged),true);
assert.deepEqual((await read(a.session)).future,{'2030-05-01':'From desktop','2030-05-02':'From phone'});
for(const {session,doc} of people){
 assert.deepEqual((await read(session)).tasks,doc.tasks);
 const rows=await checked('/rest/v1/user_data?select=user_id',undefined,session.access_token);assert.deepEqual(rows,[{user_id:session.user.id}]);
}
console.log('PASS: three Auth signups, four password sessions with separate email challenges, PostgREST RLS, simultaneous CAS and reconciled readback.');
