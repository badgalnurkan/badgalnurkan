-- QA ONLY: isolated project lvomrcqytfygcmguojcj, not production.
-- All synthetic users, sessions, challenges and confirmations ROLLED BACK.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.iydu_browser_service(text,uuid,uuid,jsonb)') IS NULL
    OR to_regprocedure('public.iydu_browser_session_allowed()') IS NULL
 THEN RAISE EXCEPTION 'Browser OTP foundation missing'; END IF;
END $preflight$;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
VALUES
 ('ab000000-0000-4000-8000-000000000011','otp-first@example.invalid',now(),'{"username":"BrowserOne"}'::jsonb),
 ('ab000000-0000-4000-8000-000000000012','otp-second@example.invalid',now(),'{"username":"BrowserTwo"}'::jsonb),
 ('ab000000-0000-4000-8000-000000000013','otp-third@example.invalid',now(),'{"username":"BrowserThree"}'::jsonb);
INSERT INTO auth.sessions(id,user_id,created_at)
VALUES
 ('ab100000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011',now()),
 ('ab100000-0000-4000-8000-000000000002','ab000000-0000-4000-8000-000000000011',now()),
 ('ab100000-0000-4000-8000-000000000003','ab000000-0000-4000-8000-000000000012',now()),
 ('ab100000-0000-4000-8000-000000000004','ab000000-0000-4000-8000-000000000013',now());

DO $checks$
DECLARE result jsonb;
BEGIN
 INSERT INTO iydu_private.browser_verified_sessions(user_id,session_id,verified_at) VALUES('ab000000-0000-4000-8000-000000000011','ab100000-0000-4000-8000-000000000001',statement_timestamp()-interval '59 minutes 59 seconds');
 PERFORM set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000001"}',true);
 IF NOT (public.iydu_quick_resume_status()->>'allowed')::boolean THEN RAISE EXCEPTION '59m59s not allowed'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.iydu_browser_service('status','ab000000-0000-4000-8000-000000000011','ab100000-0000-4000-8000-000000000001');
 IF NOT (result->>'verified')::boolean THEN RAISE EXCEPTION 'fresh proof rejected'; END IF;
 UPDATE iydu_private.browser_verified_sessions SET verified_at=statement_timestamp()-interval '1 hour' WHERE user_id='ab000000-0000-4000-8000-000000000011';
 result:=public.iydu_browser_service('status','ab000000-0000-4000-8000-000000000011','ab100000-0000-4000-8000-000000000001');
 IF (result->>'verified')::boolean THEN RAISE EXCEPTION 'proof accepted at exact hour'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000001","iat":9999999999}',true);
 IF (public.iydu_quick_resume_status()->>'allowed')::boolean THEN RAISE EXCEPTION 'refresh extended clock'; END IF;
 PERFORM set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000012","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000003"}',true);
 IF (public.iydu_quick_resume_status()->>'allowed')::boolean THEN RAISE EXCEPTION 'other account inherited proof'; END IF;
 INSERT INTO iydu_private.browser_session_challenges(id,user_id,session_id,email,hash,expires_at,delivery_confirmed_at) VALUES('ab200000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000011','ab100000-0000-4000-8000-000000000001','otp-first@example.invalid',repeat('a',64),now()+interval '10 minutes',now());
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=public.iydu_browser_service('confirm','ab000000-0000-4000-8000-000000000011','ab100000-0000-4000-8000-000000000001',jsonb_build_object('id','ab200000-0000-4000-8000-000000000001','hash',repeat('a',64)));
 IF NOT (result->>'verified')::boolean THEN RAISE EXCEPTION 'renewal failed: %',result; END IF;
 IF NOT EXISTS(SELECT 1 FROM iydu_private.browser_verified_sessions WHERE user_id='ab000000-0000-4000-8000-000000000011' AND verified_at=statement_timestamp()) THEN RAISE EXCEPTION 'confirmation did not reset proof time'; END IF;
END $checks$;
ROLLBACK;
