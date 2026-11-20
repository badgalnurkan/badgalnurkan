-- QA ONLY: never execute on production. All synthetic records ROLLED BACK.
-- 30-minute OAuth sessions are enforced at both RLS and privileged service RPC.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
VALUES('ac000000-0000-4000-8000-000000000011','qa-oauth-expiry@example.invalid',
 now(),'{"username":"QaOAuthExpiry"}'::jsonb);
INSERT INTO auth.sessions(id,user_id,created_at) VALUES
 ('ac100000-0000-4000-8000-000000000011',
  'ac000000-0000-4000-8000-000000000011',now()),
 ('ac100000-0000-4000-8000-000000000012',
  'ac000000-0000-4000-8000-000000000011',now()-interval '45 minutes');
INSERT INTO iydu_private.browser_verified_sessions(user_id,session_id,was_oauth)
VALUES
 ('ac000000-0000-4000-8000-000000000011',
  'ac100000-0000-4000-8000-000000000011',true),
 ('ac000000-0000-4000-8000-000000000011',
  'ac100000-0000-4000-8000-000000000012',false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
 '{"sub":"ac000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ac100000-0000-4000-8000-000000000011","amr":[{"method":"oauth","timestamp":1795170000}]}',true);
DO $active$
BEGIN
 IF NOT public.iydu_browser_session_allowed() OR NOT public.iydu_account_access_allowed()
 THEN RAISE EXCEPTION 'Fresh OAuth session incorrectly rejected'; END IF;
END $active$;
RESET ROLE;
UPDATE auth.sessions SET created_at=now()-interval '31 minutes'
WHERE id='ac100000-0000-4000-8000-000000000011';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
 '{"sub":"ac000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ac100000-0000-4000-8000-000000000011","amr":[{"method":"oauth","timestamp":1795170000}]}',true);
DO $expired$
BEGIN
 IF public.iydu_browser_session_allowed() OR public.iydu_account_access_allowed()
 THEN RAISE EXCEPTION 'OAuth session exceeded 30 minutes but retained data access'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_data WHERE user_id=auth.uid())
 THEN RAISE EXCEPTION 'Direct RLS SELECT bypasses expired OAuth session'; END IF;
END $expired$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $service$
DECLARE result jsonb;
BEGIN
 result:=public.iydu_browser_service('status',
   'ac000000-0000-4000-8000-000000000011'::uuid,
   'ac100000-0000-4000-8000-000000000011'::uuid,
   '{"using_oauth":true}'::jsonb);
 IF result->>'error'<>'SESSION_EXPIRED'
 THEN RAISE EXCEPTION 'OAuth service RPC did not reject expired session'; END IF;
 result:=public.iydu_browser_service('status',
   'ac000000-0000-4000-8000-000000000011'::uuid,
   'ac100000-0000-4000-8000-000000000012'::uuid,
   '{"using_oauth":false}'::jsonb);
 IF result->>'verified'<>'true'
 THEN RAISE EXCEPTION 'Password session was incorrectly expired'; END IF;
END $service$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims',
 '{"sub":"ac000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ac100000-0000-4000-8000-000000000012","amr":[{"method":"password","timestamp":1795170000}]}',true);
DO $password$
BEGIN
 IF NOT public.iydu_browser_session_allowed() OR NOT public.iydu_account_access_allowed()
 THEN RAISE EXCEPTION 'Password session incorrectly subject to 30-minute OAuth timeout'; END IF;
END $password$;
RESET ROLE;
SELECT 'PASS: fresh OAuth allowed, OAuth at 31m denied RLS and service RPC, password session unaffected; rolled back' AS result;
ROLLBACK;
