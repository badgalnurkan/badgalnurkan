-- REVIEW-ONLY migration; NOT applied to production without coordinated release.
-- Requires production-like auth.sessions and iydu_private.account_controls.
-- Goal: every *new authenticated session* needs one emailed OTP before data access.
-- JWT session ID is trusted ONLY after Supabase's verified JWT middleware.
-- Run first on the isolated QA project, and rehearse rollback/restore.
BEGIN;
DO $requirements$
BEGIN
 IF to_regclass('iydu_private.account_controls') IS NULL
    OR to_regclass('auth.sessions') IS NULL
    OR to_regclass('public.user_data') IS NULL
    OR to_regprocedure('public.iydu_account_access_allowed()') IS NULL
    OR to_regprocedure('public.iydu_save_cas(jsonb,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'Browser-approval preflight failed: base schema/CAS missing'; END IF;
END $requirements$;

CREATE TABLE IF NOT EXISTS iydu_private.browser_session_challenges(
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
 email text NOT NULL,
 hash text NOT NULL CHECK(hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 used_at timestamptz
);
CREATE INDEX IF NOT EXISTS browser_session_challenges_user_created
 ON iydu_private.browser_session_challenges(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS iydu_private.browser_verified_sessions(
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,session_id)
);
ALTER TABLE iydu_private.browser_session_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE iydu_private.browser_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON iydu_private.browser_session_challenges FROM PUBLIC,anon,authenticated;
REVOKE ALL ON iydu_private.browser_verified_sessions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON iydu_private.browser_session_challenges TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON iydu_private.browser_verified_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.iydu_browser_session_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $allowed$
 SELECT coalesce(
  (SELECT auth.uid()) IS NOT NULL
  AND (SELECT auth.jwt()->>'role')='authenticated'
  AND EXISTS(
   SELECT 1 FROM iydu_private.browser_verified_sessions v
    JOIN auth.sessions s ON s.id=v.session_id AND s.user_id=v.user_id
   WHERE v.user_id=(SELECT auth.uid())
     AND v.session_id::text=(SELECT auth.jwt()->>'session_id')
     AND (s.not_after IS NULL OR s.not_after>statement_timestamp())
  ),false);
$allowed$;
REVOKE ALL ON FUNCTION public.iydu_browser_session_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iydu_browser_session_allowed() TO authenticated,service_role;

-- This service RPC is deliberately unavailable to an authenticated browser.
-- All p_uid and p_sid arguments MUST come from a bearer token verified against
-- /auth/v1/user by the Edge function. It never trusts a client-sent user ID.
CREATE OR REPLACE FUNCTION public.iydu_browser_service(
 p_action text,p_uid uuid,p_sid uuid,p_fields jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $service$
DECLARE
 v_mail text;
 v_confirmed boolean;
 v_state text;
 v_password_due boolean;
 v_challenge iydu_private.browser_session_challenges%ROWTYPE;
 v_id uuid;
 v_hash text;
BEGIN
 IF coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE insufficient_privilege; END IF;
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
  UPDATE iydu_private.browser_session_challenges
     SET used_at=statement_timestamp()
   WHERE user_id=p_uid AND session_id=p_sid AND used_at IS NULL;
  INSERT INTO iydu_private.browser_session_challenges(
    id,user_id,session_id,email,hash,expires_at)
  VALUES(v_id,p_uid,p_sid,v_mail,v_hash,statement_timestamp()+interval '10 minutes');
  RETURN pg_catalog.jsonb_build_object('ok',true,'id',v_id,'email',v_mail);
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
    OR v_challenge.expires_at<=statement_timestamp()
    OR v_challenge.attempts>=5
    OR v_challenge.email IS DISTINCT FROM v_mail
 THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
 UPDATE iydu_private.browser_session_challenges SET attempts=attempts+1 WHERE id=v_id;
 IF v_challenge.hash IS DISTINCT FROM v_hash
 THEN RETURN pg_catalog.jsonb_build_object('error','INVALID_CHALLENGE'); END IF;
 INSERT INTO iydu_private.browser_verified_sessions(user_id,session_id)
 VALUES(p_uid,p_sid) ON CONFLICT(user_id,session_id) DO NOTHING;
 UPDATE iydu_private.browser_session_challenges SET used_at=statement_timestamp()
 WHERE user_id=p_uid AND session_id=p_sid AND used_at IS NULL;
 RETURN pg_catalog.jsonb_build_object('ok',true,'verified',true);
END;
$service$;
REVOKE ALL ON FUNCTION public.iydu_browser_service(text,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iydu_browser_service(text,uuid,uuid,jsonb)
  TO service_role;

-- Keep current account lifecycle and 90-day restrictions intact, and ADD
-- verified browser-session enforcement to every call using this guard.
CREATE OR REPLACE FUNCTION public.iydu_account_access_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $access$
 SELECT coalesce((
  SELECT c.state='active'
    AND (coalesce(u.encrypted_password,'')=''
      OR statement_timestamp()<c.password_changed_at+interval '90 days')
    AND EXISTS(SELECT 1 FROM auth.sessions s
      WHERE s.user_id=u.id AND s.id::text=auth.jwt()->>'session_id')
    AND public.iydu_browser_session_allowed()
  FROM iydu_private.account_controls c JOIN auth.users u ON u.id=c.user_id
  WHERE c.user_id=(SELECT auth.uid())
 ),false);
$access$;
REVOKE ALL ON FUNCTION public.iydu_account_access_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iydu_account_access_allowed() TO authenticated;

-- IMPORTANT: direct SELECT currently has a permissive owner-only RLS policy.
-- A RESTRICTIVE policy is needed to block bypassing iydu_load via Data API.
DO $policies$
DECLARE table_name text;
BEGIN
 FOR table_name IN SELECT unnest(ARRAY['user_data','profiles','iydu_usernames']) LOOP
  IF NOT EXISTS(
    SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname=table_name AND t.relrowsecurity
  ) THEN RAISE EXCEPTION 'Missing RLS on %',table_name; END IF;
  EXECUTE pg_catalog.format('DROP POLICY IF EXISTS browser_session_verified_required ON public.%I',table_name);
  EXECUTE pg_catalog.format(
   'CREATE POLICY browser_session_verified_required ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.iydu_browser_session_allowed()) WITH CHECK (public.iydu_browser_session_allowed())',
   table_name);
 END LOOP;
END $policies$;

-- No legacy blind writes may remain open after this gate is turned on.
REVOKE EXECUTE ON FUNCTION public.iydu_save(text,text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
