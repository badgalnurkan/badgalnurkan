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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000011',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000001"}',true);
DO $unverified$
DECLARE denied boolean:=false; no_write boolean:=false; no_service boolean:=false;
BEGIN
 IF public.iydu_browser_session_allowed() THEN
  RAISE EXCEPTION 'Unverified browser session already allowed';
 END IF;
 IF EXISTS(SELECT 1 FROM public.user_data WHERE user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Direct Data API SELECT bypassed browser verification';
 END IF;
 BEGIN
  PERFORM public.iydu_load('');
 EXCEPTION WHEN SQLSTATE '42501' THEN denied:=true;
 END;
 BEGIN
  PERFORM public.iydu_save_cas('{}'::jsonb,'{"u":"BrowserOne"}'::jsonb);
 EXCEPTION WHEN SQLSTATE '42501' THEN no_write:=true;
 END;
 BEGIN
  PERFORM public.iydu_browser_service('status',auth.uid(),
   'ab100000-0000-4000-8000-000000000001'::uuid,'{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN no_service:=true;
 END;
 IF NOT denied OR NOT no_write OR NOT no_service THEN
  RAISE EXCEPTION 'Missing pre-approval data write/privilege gate';
 END IF;
END $unverified$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $service$
DECLARE result jsonb; i integer;
BEGIN
 result:=public.iydu_browser_service('request',
   'ab000000-0000-4000-8000-000000000011'::uuid,
   'ab100000-0000-4000-8000-000000000001'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000001","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb);
 IF result->>'email'<>'otp-first@example.invalid' THEN
  RAISE EXCEPTION 'Browser request recipient not server owner';
 END IF;
 -- The first request only reserves a code; a real email delivery acknowledgement
 -- must precede all confirmation attempts.
 result:=public.iydu_browser_service('activate_delivery',
   'ab000000-0000-4000-8000-000000000011'::uuid,
   'ab100000-0000-4000-8000-000000000001'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000001"}'::jsonb);
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'First browser code not activated'; END IF;
 result:=public.iydu_browser_service('confirm',
   'ab000000-0000-4000-8000-000000000011'::uuid,
   'ab100000-0000-4000-8000-000000000001'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000001","hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'::jsonb);
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'Incorrect OTP accepted'; END IF;
 result:=public.iydu_browser_service('confirm',
   'ab000000-0000-4000-8000-000000000011'::uuid,
   'ab100000-0000-4000-8000-000000000001'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000001","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb);
 IF result->>'verified'<>'true' THEN RAISE EXCEPTION 'Correct OTP did not authorize session'; END IF;
 result:=public.iydu_browser_service('confirm',
   'ab000000-0000-4000-8000-000000000011'::uuid,
   'ab100000-0000-4000-8000-000000000001'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000001","hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb);
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'OTP reused'; END IF;
 -- The first browser's approval MUST NOT approve another browser session.
 result:=public.iydu_browser_service('status',
   'ab000000-0000-4000-8000-000000000011'::uuid,
   'ab100000-0000-4000-8000-000000000002'::uuid,'{}'::jsonb);
 IF result->>'verified'<>'false' THEN RAISE EXCEPTION 'Second session got implicit approval'; END IF;
 -- Deny a mismatched UID + session pair.
 result:=public.iydu_browser_service('request',
   'ab000000-0000-4000-8000-000000000012'::uuid,
   'ab100000-0000-4000-8000-000000000001'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000009","hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb);
 IF result->>'error'<>'UNAUTHORIZED' THEN RAISE EXCEPTION 'Cross-user session accepted'; END IF;
 -- OTP attempt lockout (five wrong guesses), scoped to the other account.
 result:=public.iydu_browser_service('request',
   'ab000000-0000-4000-8000-000000000012'::uuid,
   'ab100000-0000-4000-8000-000000000003'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000003","hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb);
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Second account email challenge failed'; END IF;
 result:=public.iydu_browser_service('activate_delivery',
   'ab000000-0000-4000-8000-000000000012'::uuid,
   'ab100000-0000-4000-8000-000000000003'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000003"}'::jsonb);
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Second browser code not activated'; END IF;
 FOR i IN 1..5 LOOP
  result:=public.iydu_browser_service('confirm',
   'ab000000-0000-4000-8000-000000000012'::uuid,
   'ab100000-0000-4000-8000-000000000003'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000003","hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}'::jsonb);
  IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'Incorrect OTP was accepted'; END IF;
 END LOOP;
 result:=public.iydu_browser_service('confirm',
   'ab000000-0000-4000-8000-000000000012'::uuid,
   'ab100000-0000-4000-8000-000000000003'::uuid,
   '{"id":"ab200000-0000-4000-8000-000000000003","hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}'::jsonb);
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'Fifth failure did not lock OTP'; END IF;
END $service$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','ab000000-0000-4000-8000-000000000011',true);
SELECT set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000001"}',true);
DO $approved$
BEGIN
 IF NOT public.iydu_browser_session_allowed() OR
    NOT public.iydu_account_access_allowed() OR
    NOT EXISTS(SELECT 1 FROM public.user_data WHERE user_id=auth.uid())
 THEN RAISE EXCEPTION 'Verified session did not regain owner access'; END IF;
END $approved$;
SELECT set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000002"}',true);
DO $second_tab$
BEGIN
 IF public.iydu_browser_session_allowed() OR
    EXISTS(SELECT 1 FROM public.user_data WHERE user_id=auth.uid())
 THEN RAISE EXCEPTION 'Second unverified session exposed first device data'; END IF;
END $second_tab$;
RESET ROLE;
UPDATE iydu_private.account_controls SET state='deactivated'
 WHERE user_id='ab000000-0000-4000-8000-000000000011';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"ab000000-0000-4000-8000-000000000011","role":"authenticated","session_id":"ab100000-0000-4000-8000-000000000001"}',true);
DO $closed$
DECLARE blocked boolean:=false;
BEGIN
 IF public.iydu_account_access_allowed() OR
    EXISTS(SELECT 1 FROM public.user_data WHERE user_id=auth.uid())
 THEN RAISE EXCEPTION 'Closed account bypassed Data API restriction'; END IF;
 BEGIN
  PERFORM public.iydu_save_cas('{}'::jsonb,'{"u":"BrowserOne"}'::jsonb);
 EXCEPTION WHEN SQLSTATE '42501' THEN blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Closed account bypassed CAS restriction'; END IF;
END $closed$;
RESET ROLE;
SELECT 'PASS: unverified device denied, approved session isolated, wrong OTP limited, one-time use, cross-user bypass rejected, closed account denied; synthetic rows rolled back' AS result;
ROLLBACK;
