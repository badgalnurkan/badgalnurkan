'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/rollouts/browser-resend-safe-qa-first.sql'),'utf8');
const reserve=sql.split("IF p_action='request' THEN")[1]?.split("IF p_action='activate_delivery' THEN")[0]||'';
const commit=sql.split("IF p_action='activate_delivery' THEN")[1]?.split("IF p_action='cancel' THEN")[0]||'';
test('new browser OTP is staged without prematurely invalidating an older valid code',()=>{
 assert.match(reserve,/delivery_confirmed_at/);
 assert.doesNotMatch(reserve,/UPDATE iydu_private\.browser_session_challenges/);
});
test('only provider-acknowledged delivery switches from old code to new code atomically',()=>{
 assert.match(commit,/UPDATE iydu_private\.browser_session_challenges/);
 assert.match(commit,/SET used_at=statement_timestamp\(\)/);
 assert.match(commit,/SET delivery_confirmed_at=statement_timestamp\(\)/);
 assert.match(sql,/v_challenge\.delivery_confirmed_at IS NULL/);
});
test('browser service function stays unreachable from untrusted clients',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.iydu_browser_service\(text,uuid,uuid,jsonb\)/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.iydu_browser_service\(text,uuid,uuid,jsonb\) TO service_role/);
});
