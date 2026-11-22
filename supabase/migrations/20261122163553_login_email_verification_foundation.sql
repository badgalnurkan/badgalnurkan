-- Additive foundation. New production installations remain disabled until the
-- matching frontend and real mail test are ready. Existing QA stays enabled.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('iydu_private.account_controls') IS NULL
  OR to_regclass('auth.sessions') IS NULL
  OR to_regprocedure('public.iydu_account_access_allowed()') IS NULL
 THEN RAISE EXCEPTION 'Missing account lifecycle foundation'; END IF;
END $preflight$;
CREATE TABLE IF NOT EXISTS iydu_private.browser_verification_config(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 enforce_oauth_lifetime boolean NOT NULL DEFAULT false
);
INSERT INTO iydu_private.browser_verification_config(singleton,enabled)
 VALUES(true,to_regprocedure('public.iydu_browser_session_allowed()') IS NOT NULL)
 ON CONFLICT(singleton) DO NOTHING;
ALTER TABLE iydu_private.browser_verification_config ADD COLUMN IF NOT EXISTS enforce_oauth_lifetime boolean NOT NULL DEFAULT false;
UPDATE iydu_private.browser_verification_config SET enforce_oauth_lifetime=enabled;
ALTER TABLE iydu_private.browser_verification_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON iydu_private.browser_verification_config FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON iydu_private.browser_verification_config TO service_role;
CREATE TABLE IF NOT EXISTS iydu_private.browser_session_challenges(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
 email text NOT NULL,hash text NOT NULL CHECK(hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),used_at timestamptz,
 delivery_confirmed_at timestamptz
);
ALTER TABLE iydu_private.browser_session_challenges ADD COLUMN IF NOT EXISTS delivery_confirmed_at timestamptz;
CREATE INDEX IF NOT EXISTS browser_session_challenges_user_created ON iydu_private.browser_session_challenges(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS iydu_private.browser_verified_sessions(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
 verified_at timestamptz NOT NULL DEFAULT now(),was_oauth boolean NOT NULL DEFAULT false,
 PRIMARY KEY(user_id,session_id)
);
ALTER TABLE iydu_private.browser_session_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE iydu_private.browser_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON iydu_private.browser_session_challenges,iydu_private.browser_verified_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON iydu_private.browser_session_challenges,iydu_private.browser_verified_sessions TO service_role;
CREATE OR REPLACE FUNCTION public.iydu_browser_session_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $allowed$
 SELECT coalesce((SELECT NOT enabled FROM iydu_private.browser_verification_config WHERE singleton),false)
 OR coalesce((SELECT auth.uid()) IS NOT NULL AND auth.jwt()->>'role'='authenticated'
 AND EXISTS(SELECT 1 FROM iydu_private.browser_verified_sessions v
 JOIN auth.sessions s ON s.id=v.session_id AND s.user_id=v.user_id
 WHERE v.user_id=(SELECT auth.uid()) AND v.session_id::text=auth.jwt()->>'session_id'
 AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
 AND ((SELECT NOT enforce_oauth_lifetime FROM iydu_private.browser_verification_config WHERE singleton) OR (NOT v.was_oauth AND NOT pg_catalog.jsonb_path_exists(coalesce(auth.jwt()->'amr','[]'::jsonb),'$[*] ? (@.method == "oauth")'::jsonpath))
 OR s.created_at+interval '30 minutes'>statement_timestamp())),false);
$allowed$;
REVOKE ALL ON FUNCTION public.iydu_browser_session_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iydu_browser_session_allowed() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.iydu_browser_service(p_action text, p_uid uuid, p_sid uuid, p_fields jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_mail text;
 v_confirmed boolean;
 v_state text;
 v_password_due boolean;
 v_oauth boolean;
 v_challenge iydu_private.browser_session_challenges%ROWTYPE;
 v_id uuid;
 v_hash text;
BEGIN
 IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE insufficient_privilege; END IF;
 IF p_uid IS NULL OR p_sid IS NULL OR NOT EXISTS(
  SELECT 1 FROM auth.sessions AS s
  WHERE s.id=p_sid AND s.user_id=p_uid
   AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
 ) THEN
  RETURN pg_catalog.jsonb_build_object('error','UNAUTHORIZED');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_uid::text,29));
 SELECT u.email,u.email_confirmed_at IS NOT NULL,c.state,
   coalesce(u.encrypted_password,'')<>''
    AND statement_timestamp()>=c.password_changed_at+interval '90 days'
 INTO v_mail,v_confirmed,v_state,v_password_due
 FROM auth.users u JOIN iydu_private.account_controls c ON c.user_id=u.id
 WHERE u.id=p_uid;
 IF NOT FOUND OR v_state<>'active' OR v_password_due THEN
  RETURN pg_catalog.jsonb_build_object('error','ACCOUNT_RESTRICTED');
 END IF;
 IF NOT v_confirmed THEN RETURN pg_catalog.jsonb_build_object('error','EMAIL_NOT_VERIFIED'); END IF;
 -- Expire Google OAuth sessions based on the original Auth session, not JWT iat.
 v_oauth:=coalesce((p_fields->>'using_oauth')::boolean,false)
   OR EXISTS(SELECT 1 FROM iydu_private.browser_verified_sessions v
      WHERE v.user_id=p_uid AND v.session_id=p_sid AND v.was_oauth);
 IF v_oauth AND (SELECT enforce_oauth_lifetime FROM iydu_private.browser_verification_config WHERE singleton) AND NOT EXISTS(SELECT 1 FROM auth.sessions s
   WHERE s.id=p_sid AND s.user_id=p_uid
     AND s.created_at+interval '30 minutes'>statement_timestamp()) THEN
   RETURN pg_catalog.jsonb_build_object('error','SESSION_EXPIRED');
 END IF;
 IF p_action='status' AND NOT (SELECT enabled FROM iydu_private.browser_verification_config WHERE singleton) THEN
  RETURN pg_catalog.jsonb_build_object('ok',true,'verified',true,'enabled',false);
 END IF;
 IF p_action='status' THEN
  RETURN pg_catalog.jsonb_build_object('ok',true,'verified',EXISTS(
    SELECT 1 FROM iydu_private.browser_verified_sessions v
    WHERE v.user_id=p_uid AND v.session_id=p_sid));
 END IF;
 IF p_action='request' THEN
  IF EXISTS(SELECT 1 FROM iydu_private.browser_verified_sessions v
      WHERE v.user_id=p_uid AND v.session_id=p_sid)
  THEN RETURN pg_catalog.jsonb_build_object('ok',true,'already_verified',true); END IF;
  IF EXISTS(SELECT 1 FROM iydu_private.browser_session_challenges c
     WHERE c.user_id=p_uid AND c.created_at>statement_timestamp()-interval '60 seconds')
  OR (SELECT count(*) FROM iydu_private.browser_session_challenges c
      WHERE c.user_id=p_uid
       AND c.created_at>statement_timestamp()-interval '1 hour')>=5
  THEN RETURN pg_catalog.jsonb_build_object('error','RATE_LIMITED'); END IF;
  v_id=(p_fields->>'id')::uuid;
  v_hash=p_fields->>'hash';
  IF v_id IS NULL OR coalesce(v_hash,'') !~ '^[0-9a-f]{64}$'
  THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
  -- Reserve a new code without invalidating any previously delivered code.
  -- The sender may fail; the prior challenge must remain usable.
  INSERT INTO iydu_private.browser_session_challenges(
    id,user_id,session_id,email,hash,expires_at,delivery_confirmed_at)
  VALUES(v_id,p_uid,p_sid,v_mail,v_hash,statement_timestamp()+interval '10 minutes',NULL);
  RETURN pg_catalog.jsonb_build_object('ok',true,'id',v_id,'email',v_mail);
 END IF;
 IF p_action='activate_delivery' THEN
  -- Caller is the same trusted service RPC after the email provider accepted
  -- a request; no access from anon/authenticated roles is granted.
  v_id=(p_fields->>'id')::uuid;
  IF v_id IS NULL THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
  SELECT * INTO v_challenge FROM iydu_private.browser_session_challenges c
  WHERE c.id=v_id AND c.user_id=p_uid AND c.session_id=p_sid FOR UPDATE;
  IF NOT FOUND OR v_challenge.used_at IS NOT NULL
     OR v_challenge.expires_at<=statement_timestamp()
  THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
  IF v_challenge.delivery_confirmed_at IS NOT NULL THEN
   RETURN pg_catalog.jsonb_build_object('ok',true);
  END IF;
  -- Atomic switch: retiring the previous code and enabling the newly
  -- delivered one commit together, or not at all.
  UPDATE iydu_private.browser_session_challenges
     SET used_at=statement_timestamp()
   WHERE user_id=p_uid AND session_id=p_sid AND id<>v_id AND used_at IS NULL;
  UPDATE iydu_private.browser_session_challenges
     SET delivery_confirmed_at=statement_timestamp()
   WHERE id=v_id AND user_id=p_uid AND session_id=p_sid;
  RETURN pg_catalog.jsonb_build_object('ok',true);
 END IF;
 IF p_action='cancel' THEN
  UPDATE iydu_private.browser_session_challenges
     SET used_at=statement_timestamp()
   WHERE id=(p_fields->>'id')::uuid AND user_id=p_uid AND session_id=p_sid;
  RETURN pg_catalog.jsonb_build_object('ok',true);
 END IF;
 IF p_action<>'confirm' THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_ACTION'); END IF;
 v_id=(p_fields->>'id')::uuid;
 v_hash=p_fields->>'hash';
 IF v_id IS NULL OR coalesce(v_hash,'') !~ '^[0-9a-f]{64}$'
 THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
 SELECT * INTO v_challenge FROM iydu_private.browser_session_challenges c
 WHERE c.id=v_id AND c.user_id=p_uid AND c.session_id=p_sid FOR UPDATE;
 IF NOT FOUND OR v_challenge.used_at IS NOT NULL
    OR v_challenge.delivery_confirmed_at IS NULL
    OR v_challenge.expires_at<=statement_timestamp()
    OR v_challenge.attempts>=5
    OR v_challenge.email IS DISTINCT FROM v_mail
 THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
 UPDATE iydu_private.browser_session_challenges SET attempts=attempts+1 WHERE id=v_id;
 IF v_challenge.hash IS DISTINCT FROM v_hash
 THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
 INSERT INTO iydu_private.browser_verified_sessions(user_id,session_id,was_oauth)
 VALUES(p_uid,p_sid,v_oauth)
 ON CONFLICT(user_id,session_id) DO UPDATE
 SET was_oauth=iydu_private.browser_verified_sessions.was_oauth OR EXCLUDED.was_oauth;
 UPDATE iydu_private.browser_session_challenges SET used_at=statement_timestamp()
 WHERE user_id=p_uid AND session_id=p_sid AND used_at IS NULL;
 RETURN pg_catalog.jsonb_build_object('ok',true,'verified',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.iydu_browser_service(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iydu_browser_service(text,uuid,uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.iydu_account_access_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce((
 select c.state='active'
 and (coalesce(u.encrypted_password,'')='' or statement_timestamp()<c.password_changed_at+interval '90 days')
 and public.iydu_browser_session_allowed()
 and exists(select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')
 from iydu_private.account_controls c join auth.users u on u.id=c.user_id
 where c.user_id=(select auth.uid())
 ),false)
$function$;

COMMIT;
