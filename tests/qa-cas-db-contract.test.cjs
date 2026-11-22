'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/20261122133118_qa_cas_first_profile_atomic_identity.sql','utf8');
test('first-profile CAS is an atomic, conflict-safe insert',()=>{
 assert.match(sql,/UPDATE public\.user_data AS ud/);
 assert.match(sql,/ud\.data=p_expected_data/);
 assert.match(sql,/p_expected_data <> '\{\}'::jsonb/);
 assert.match(sql,/ON CONFLICT\s*\(user_id\)\s*DO NOTHING/i);
});
test('CAS checks real authenticated identity and username reservation',()=>{
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/iydu_account_access_allowed\(\)/);
 assert.match(sql,/public\.iydu_usernames/);
 assert.match(sql,/p_data->>'authUid'/);
 assert.match(sql,/p_data->>'u'/);
});
test('CAS is not callable anonymously',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.iydu_save_cas\(jsonb,jsonb\) FROM PUBLIC, anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.iydu_save_cas\(jsonb,jsonb\) TO authenticated/);
});
