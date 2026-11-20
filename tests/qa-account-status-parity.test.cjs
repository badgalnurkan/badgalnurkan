'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/rollouts/qa-account-status-rpc-restore.sql'),'utf8');
const account=fs.readFileSync(path.join(root,'account-security.js'),'utf8');
test('QA signup activation RPC exists in a repeatable schema parity rollout',()=>{
 assert.match(account,/\/rest\/v1\/rpc\/iydu_account_status/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.iydu_account_status\(\)/);
 assert.match(sql,/NOTIFY pgrst, 'reload schema'/);
});
test('account status is scoped to JWT identity and live auth session',()=>{
 assert.match(sql,/u\.id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/auth\.sessions/);
 assert.match(sql,/auth\.jwt\(\)->>'session_id'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.iydu_account_status\(\) FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.iydu_account_status\(\) TO authenticated/);
});
test('account status includes fields required by the UI after signup',()=>{
 for(const field of ['user_id','email','state','password_required','server_time']){
  assert.match(sql,new RegExp("'"+field+"'"));
 }
});
