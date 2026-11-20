-- QA only. Isolated synthetic users, no delivery, purge or committed changes.
BEGIN;
DO $guard$
BEGIN
  IF position('https://lvomrcqytfygcmguojcj.supabase.co/functions/v1/device-push'
              in pg_get_functiondef('iydu_private.push_tick()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Expected isolated QA schema';
  END IF;
END
$guard$;

INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data) VALUES
  ('bc500000-0000-4000-8000-000000000001','retention-one@example.invalid',now(),'{"username":"QaRetentionOne"}'),
  ('bc500000-0000-4000-8000-000000000002','retention-two@example.invalid',now(),'{"username":"QaRetentionTwo"}');
INSERT INTO auth.sessions(id, user_id, created_at) VALUES
  ('bc510000-0000-4000-8000-000000000001','bc500000-0000-4000-8000-000000000001',now()),
  ('bc510000-0000-4000-8000-000000000002','bc500000-0000-4000-8000-000000000002',now());
INSERT INTO iydu_private.browser_verified_sessions(user_id, session_id)
SELECT user_id, id FROM auth.sessions WHERE id IN
  ('bc510000-0000-4000-8000-000000000001','bc510000-0000-4000-8000-000000000002');

SET LOCAL ROLE authenticated;
DO $opt_in$
DECLARE
  account_id uuid;
  session_id uuid;
  endpoint text := 'https://fcm.googleapis.com/fcm/send/QA-transaction-only-never-deliver';
  keys jsonb := jsonb_build_object('p256dh',repeat('A',87),'auth',repeat('B',22));
BEGIN
  FOR i IN 1..2 LOOP
    account_id := ('bc500000-0000-4000-8000-00000000000'||i)::uuid;
    session_id := ('bc510000-0000-4000-8000-00000000000'||i)::uuid;
    PERFORM set_config('request.jwt.claim.role','authenticated',true);
    PERFORM set_config('request.jwt.claim.sub',account_id::text,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',account_id,'session_id',session_id,'role','authenticated')::text,true);
    IF i=1 AND public.iydu_set_push(endpoint,keys,'tr') IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Verified owner could not register the synthetic device';
    ELSIF i=2 THEN
      IF public.iydu_set_push(endpoint,keys,'en') IS DISTINCT FROM false THEN
        RAISE EXCEPTION 'Device owner changed during account switch';
      END IF;
      PERFORM public.iydu_set_push(endpoint,NULL,'en');
    END IF;
  END LOOP;
END
$opt_in$;
RESET ROLE;
DO $owner$
BEGIN
  IF (SELECT count(*) FROM iydu_private.push_devices
      WHERE endpoint='https://fcm.googleapis.com/fcm/send/QA-transaction-only-never-deliver'
      AND user_id='bc500000-0000-4000-8000-000000000001' AND lang='tr')<>1 THEN
    RAISE EXCEPTION 'Second account altered the original device subscription';
  END IF;
END
$owner$;

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role','service_role',true);
DO $close$
DECLARE
  account_id uuid;
  challenge jsonb;
  result jsonb;
  action text;
  expected_state text;
  expected_days int;
BEGIN
  FOR i IN 1..2 LOOP
    account_id := ('bc500000-0000-4000-8000-00000000000'||i)::uuid;
    action := CASE i WHEN 1 THEN 'deactivate' ELSE 'delete' END;
    expected_state := CASE i WHEN 1 THEN 'deactivated' ELSE 'pending_delete' END;
    expected_days := CASE i WHEN 1 THEN 30 ELSE 60 END;
    challenge := jsonb_build_object('id',gen_random_uuid(),'hash',repeat('c',64),
                                    'reason','privacy','confirmation','YES_DELETE_IN_60_DAYS');
    result := public.iydu_account_service('request_'||action,account_id,challenge);
    IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Could not request closure: %', result->>'error'; END IF;
    result := public.iydu_account_service('confirm_'||action,account_id,challenge);
    IF result->>'state' IS DISTINCT FROM expected_state OR
       (result->>'delete_after')::timestamptz IS DISTINCT FROM now()+make_interval(days=>expected_days) THEN
      RAISE EXCEPTION 'Wrong closure state or retention deadline';
    END IF;
  END LOOP;
END
$close$;
RESET ROLE;
DO $revocation$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.sessions WHERE user_id IN
     ('bc500000-0000-4000-8000-000000000001','bc500000-0000-4000-8000-000000000002')) THEN
    RAISE EXCEPTION 'Closure did not revoke synthetic sessions';
  END IF;
END
$revocation$;
UPDATE iydu_private.account_challenges SET created_at=now()-interval '2 minutes'
WHERE user_id IN ('bc500000-0000-4000-8000-000000000001','bc500000-0000-4000-8000-000000000002');
-- First account acts at the last minute of its window, second at its deadline.
UPDATE iydu_private.account_controls
SET delete_after=CASE WHEN user_id='bc500000-0000-4000-8000-000000000001' THEN now()+interval '1 minute' ELSE now() END
WHERE user_id IN ('bc500000-0000-4000-8000-000000000001','bc500000-0000-4000-8000-000000000002');
SET LOCAL ROLE service_role;
DO $reopen$
DECLARE
  first_id uuid := 'bc500000-0000-4000-8000-000000000001';
  second_id uuid := 'bc500000-0000-4000-8000-000000000002';
  challenge jsonb := jsonb_build_object('id',gen_random_uuid(),'hash',repeat('d',64));
  result jsonb;
BEGIN
  result := public.iydu_account_service('request_reactivate',first_id,challenge);
  IF result->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Valid reactivation not issued'; END IF;
  result := public.iydu_account_service('confirm_reactivate',first_id,challenge);
  IF result->>'state' IS DISTINCT FROM 'active' OR result->>'delete_after' IS NOT NULL THEN
    RAISE EXCEPTION 'Valid reactivation did not restore access';
  END IF;
  result := public.iydu_account_service('request_reactivate',second_id,challenge);
  IF result->>'error' IS DISTINCT FROM 'DELETION_DUE' THEN RAISE EXCEPTION 'Expired retention window accepted'; END IF;
END
$reopen$;
RESET ROLE;
SELECT 'PASS: 30/60-day retention, session revocation, deadline and subscription ownership verified; rolled back' AS result;
ROLLBACK;
