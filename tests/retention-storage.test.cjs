'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');

const core = import('../supabase/functions/retention-storage/handler.mjs');
const TOKEN = 'fixture-retention-cron-secret-longer-than-thirty-two-characters';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
function fixture({items=[],errorAt='',cronSecret=TOKEN,serviceKey='eyJfixture',presented=TOKEN,vaultAccept=false}={}) {
 const calls=[];
 const values={
  SUPABASE_URL:'https://fixture.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:serviceKey,
  RETENTION_CRON_SECRET:cronSecret
 };
 const fetchImpl=async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/rpc/iydu_retention_token_valid')){
   if(errorAt==='vault')return Response.json({code:'NOT_CONFIGURED'},{status:503});
   return Response.json(vaultAccept);
  }
  if(url.includes('/rpc/iydu_due_storage_objects')){
   if(errorAt==='rpc')return Response.json({code:'ERROR'},{status:503});
   return Response.json(items);
  }
  if(url.includes('/storage/v1/object/')){
   if(errorAt==='storage')return Response.json({code:'ERROR'},{status:503});
   return Response.json(items.map(i=>({name:i.object_name})));
  }
  throw Error('Unexpected endpoint: '+url);
 };
 const req=(value=presented)=>new Request('https://fixture.supabase.co/functions/v1/retention-storage',{
  method:'POST',headers:{'x-iydu-retention-token':value}
 });
 const handlerPromise=core.then(({createRetentionHandler})=>createRetentionHandler({
  env:name=>values[name]||'',fetchImpl,cryptoImpl:webcrypto
 }));
 return {calls,values,req,run:async request=>(await handlerPromise)(request||req())};
}

test('denies missing and wrong cron credentials before inspecting any records',async()=>{
 const f=fixture();
 for(const secret of ['', 'wrong-secret']){
  const response=await f.run(f.req(secret));
  assert.equal(response.status,401);
  assert.equal((await response.json()).code,'UNAUTHORIZED');
 }
 assert.equal(f.calls.length,0);
});
test('fails closed when cron secret verifier or service credential is unavailable',async()=>{
 const missing=fixture({cronSecret:'',errorAt:'vault'});
 assert.equal((await missing.run()).status,503);
 assert.equal(missing.calls.length,1);
 const f=fixture({serviceKey:''});
 assert.equal((await f.run()).status,503);
 assert.equal(f.calls.length,0);
});
test('Vault-verified cron tokens permit only authorized server requests',async()=>{
 const valid=fixture({cronSecret:'',vaultAccept:true});
 assert.equal((await valid.run()).status,200);
 assert.match(valid.calls[0].url,/iydu_retention_token_valid/);
 assert.match(valid.calls[1].url,/iydu_due_storage_objects/);
 const invalid=fixture({cronSecret:'',vaultAccept:false});
 const reply=await invalid.run();
 assert.equal(reply.status,401);
 assert.equal((await reply.json()).code,'UNAUTHORIZED');
 assert.equal(invalid.calls.length,1);
});
test('rejects GET even when authorized',async()=>{
 const f=fixture();
 const r=await f.run(new Request('https://fixture.supabase.co/functions/v1/retention-storage',{
  method:'GET',headers:{'x-iydu-retention-token':TOKEN}
 }));
 assert.equal(r.status,405);
 assert.equal(f.calls.length,0);
});
test('empty database batch is a no-op and never calls Storage',async()=>{
 const f=fixture();
 const r=await f.run();
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,attempted:0,buckets:0});
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].options.method,'POST');
 assert.equal(JSON.parse(f.calls[0].options.body).p_limit,50);
});
test('removes only exact due object paths returned by the service-only RPC',async()=>{
 const items=[
  {user_id:OWNER,bucket_id:'private-uploads',object_name:'111/file one.png'},
  {user_id:OWNER,bucket_id:'private-uploads',object_name:'111/nested/file two.jpg'},
  {user_id:OTHER,bucket_id:'project-files',object_name:'222/report.pdf'}
 ];
 const f=fixture({items});
 const r=await f.run();
 const data=await r.json();
 assert.deepEqual(data,{ok:true,attempted:3,buckets:2});
 assert.equal(f.calls.length,3);
 for(const call of f.calls.slice(1)){
  assert.equal(call.options.method,'DELETE');
  assert.equal(call.options.headers.apikey,'eyJfixture');
  assert.equal(call.options.headers.Authorization,'Bearer eyJfixture');
  assert.deepEqual(Object.keys(JSON.parse(call.options.body)),['prefixes']);
 }
 assert.deepEqual(JSON.parse(f.calls[1].options.body).prefixes,
  ['111/file one.png','111/nested/file two.jpg']);
 assert.deepEqual(JSON.parse(f.calls[2].options.body).prefixes,['222/report.pdf']);
 assert.ok(!JSON.stringify(data).includes('file one.png'), 'paths must not enter logs/responses');
});
test('DB listing failure and malformed return data never delete files',async()=>{
 const failed=fixture({errorAt:'rpc'});
 assert.equal((await failed.run()).status,503);
 assert.equal(failed.calls.length,1);
 const invalid=fixture({items:[{user_id:OWNER,bucket_id:'../other-bucket',object_name:'foo'}]});
 const r=await invalid.run();
 assert.equal(r.status,503);
 assert.equal((await r.json()).code,'INVALID_BATCH');
 assert.equal(invalid.calls.length,1);
});
test('oversized batches are rejected instead of deleting more than the bounded size',async()=>{
 const items=Array.from({length:51},(_,i)=>({user_id:OWNER,bucket_id:'uploads',object_name:'file-'+i}));
 const f=fixture({items});
 assert.equal((await f.run()).status,503);
 assert.equal(f.calls.length,1);
});
test('Storage API errors stop processing without deleting Auth accounts',async()=>{
 const items=[{user_id:OWNER,bucket_id:'uploads',object_name:'private/test.png'}];
 const f=fixture({items,errorAt:'storage'});
 const r=await f.run();
 assert.equal(r.status,503);
 assert.equal((await r.json()).code,'STORAGE_UNAVAILABLE');
 assert.equal(f.calls.length,2);
 assert.equal(f.calls.filter(c=>c.url.includes('/auth/v1/')).length,0);
});
test('new-style secret key stays in apikey without a fabricated bearer JWT',async()=>{
 const f=fixture({serviceKey:'sb_secret_fixture'});
 assert.equal((await f.run()).status,200);
 assert.equal(f.calls[0].options.headers.apikey,'sb_secret_fixture');
 assert.equal(f.calls[0].options.headers.Authorization,undefined);
});
test('the staged SQL restricts the enumeration RPC to due closures and service_role only',()=>{
 const fs=require('node:fs');
 const sql=fs.readFileSync('database/account_retention_storage_cleanup_staging.sql','utf8');
 assert.match(sql,/delete_after\s*<=\s*now\(\)/);
 assert.match(sql,/owner_id\s*=\s*c\.user_id::text/);
 assert.match(sql,/from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.iydu_due_storage_objects\(integer\) to service_role/);
 assert.doesNotMatch(sql,/delete from storage\.objects/i);
});
