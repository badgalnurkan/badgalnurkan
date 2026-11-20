'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/rollouts/qa-quick-resume-parity.sql'),'utf8');
const app=fs.readFileSync(path.join(root,'index.html'),'utf8');
test('QA Google remember RPC is security-invoker and restricted to signed-in callers',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.iydu_quick_resume_status\(\)/);
 assert.doesNotMatch(sql,/SECURITY DEFINER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.iydu_quick_resume_status\(\) FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.iydu_quick_resume_status\(\) TO authenticated/);
});
test('quick resume refuses non-OAuth sessions and expires after 30 minutes',()=>{
 assert.match(sql,/method' = 'oauth'/);
 assert.match(sql,/interval '30 minutes'/);
 assert.match(app,/iydu_quick_resume_status/);
});
test('QA login remembers only an auth-confirmed email and not the password',()=>{
 assert.match(app,/serverAccepted=true;[\s\S]*?lastConfirmedLoginEmail/);
 assert.match(app,/lastConfirmedLoginEmail\.v1/);
 assert.match(app,/if\(serverAccepted\)\{/);
});
