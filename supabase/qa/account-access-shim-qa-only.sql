-- QA ONLY: lvomrcqytfygcmguojcj. NEVER USE IN PRODUCTION.
-- Synthetic SET ROLE tests have no real GoTrue session; this QA shim checks
-- ownership, active lifecycle state and password-age rule but not session_id.
-- Production already has its stricter session-aware account access function.
BEGIN;
DO $qa$
BEGIN
 IF to_regclass('iydu_private.account_controls') IS NULL OR
    to_regclass('public.user_data') IS NULL OR
    to_regprocedure('public.iydu_account_access_allowed()') IS NOT NULL
 THEN RAISE EXCEPTION 'QA access-policy precondition not met'; END IF;
END $qa$;
CREATE FUNCTION public.iydu_account_access_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $policy$
 SELECT coalesce((
  SELECT c.state='active'
   AND (coalesce(u.encrypted_password,'')='' OR
        statement_timestamp()<c.password_changed_at+INTERVAL '90 days')
  FROM iydu_private.account_controls c
  JOIN auth.users u ON u.id=c.user_id
  WHERE c.user_id=(SELECT auth.uid())
 ),false);
$policy$;
REVOKE ALL ON FUNCTION public.iydu_account_access_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iydu_account_access_allowed() TO authenticated;
COMMIT;
