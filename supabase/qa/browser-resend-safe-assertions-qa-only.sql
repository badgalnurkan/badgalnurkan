-- QA ONLY: resend delivery switching with synthetic identities.
-- Do not run against production. All data changes are rolled back.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
('dc000000-0000-4000-8000-000000000011','resend-failure@example.invalid',now(),'{"username":"ResendFailure"}'::jsonb),
('dc000000-0000-4000-8000-000000000012','resend-success@example.invalid',now(),'{"username":"ResendSuccess"}'::jsonb);
INSERT INTO auth.sessions(id,user_id,created_at) VALUES
('dc100000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000011',now()),
('dc100000-0000-4000-8000-000000000002','dc000000-0000-4000-8000-000000000012',now());
-- Previously delivered OTPs are valid but old enough to permit a resend.
INSERT INTO iydu_private.browser_session_challenges
(id,user_id,session_id,email,hash,created_at,expires_at,delivery_confirmed_at)
VALUES
('dc200000-0000-4000-8000-000000000001','dc000000-0000-4000-8000-000000000011',
 'dc100000-0000-4000-8000-000000000001','resend-failure@example.invalid',
 repeat('a',64),now()-interval '65 seconds',now()+interval '9 minutes',now()-interval '65 seconds'),
('dc200000-0000-4000-8000-000000000003','dc000000-0000-4000-8000-000000000012',
 'dc100000-0000-4000-8000-000000000002','resend-success@example.invalid',
 repeat('c',64),now()-interval '65 seconds',now()+interval '9 minutes',now()-interval '65 seconds');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $assert$
DECLARE
 a_uid uuid:='dc000000-0000-4000-8000-000000000011';
 a_sid uuid:='dc100000-0000-4000-8000-000000000001';
 b_uid uuid:='dc000000-0000-4000-8000-000000000012';
 b_sid uuid:='dc100000-0000-4000-8000-000000000002';
 old_a uuid:='dc200000-0000-4000-8000-000000000001';
 new_a uuid:='dc200000-0000-4000-8000-000000000002';
 old_b uuid:='dc200000-0000-4000-8000-000000000003';
 new_b uuid:='dc200000-0000-4000-8000-000000000004';
 result jsonb;
BEGIN
 result:=public.iydu_browser_service('request',a_uid,a_sid,jsonb_build_object('id',new_a,'hash',repeat('b',64)));
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Resend reservation failed: %',result; END IF;
 result:=public.iydu_browser_service('confirm',a_uid,a_sid,jsonb_build_object('id',new_a,'hash',repeat('b',64)));
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'Unsent OTP was accepted'; END IF;
 result:=public.iydu_browser_service('cancel',a_uid,a_sid,jsonb_build_object('id',new_a));
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Failed-send cancellation was rejected'; END IF;
 result:=public.iydu_browser_service('activate_delivery',a_uid,a_sid,jsonb_build_object('id',new_a));
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'Canceled code was activated'; END IF;
 result:=public.iydu_browser_service('confirm',a_uid,a_sid,jsonb_build_object('id',old_a,'hash',repeat('a',64)));
 IF result->>'verified'<>'true' THEN RAISE EXCEPTION 'Failed resend invalidated prior delivered code: %',result; END IF;
 result:=public.iydu_browser_service('request',b_uid,b_sid,jsonb_build_object('id',new_b,'hash',repeat('d',64)));
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Successful resend reservation failed: %',result; END IF;
 result:=public.iydu_browser_service('confirm',b_uid,b_sid,jsonb_build_object('id',new_b,'hash',repeat('d',64)));
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'New code accepted before send acknowledgement'; END IF;
 result:=public.iydu_browser_service('activate_delivery',b_uid,b_sid,jsonb_build_object('id',new_b));
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Successful delivery failed to activate'; END IF;
 result:=public.iydu_browser_service('activate_delivery',b_uid,b_sid,jsonb_build_object('id',new_b));
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Delivery retry not idempotent'; END IF;
 result:=public.iydu_browser_service('confirm',b_uid,b_sid,jsonb_build_object('id',old_b,'hash',repeat('c',64)));
 IF result->>'error'<>'INVALID_CHALLENGE' THEN RAISE EXCEPTION 'Old code accepted after successful delivery'; END IF;
 result:=public.iydu_browser_service('confirm',b_uid,b_sid,jsonb_build_object('id',new_b,'hash',repeat('d',64)));
 IF result->>'verified'<>'true' THEN RAISE EXCEPTION 'Fresh delivered code rejected: %',result; END IF;
END $assert$;
RESET ROLE;
SELECT 'PASS: failed resend preserves old, successful resend replaces old, unsent/canceled codes rejected, delivery acknowledgement idempotent' AS result;
ROLLBACK;
