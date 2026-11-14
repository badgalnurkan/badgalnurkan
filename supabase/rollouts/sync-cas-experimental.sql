-- EXPERIMENTAL. Disposable test environment only. NOT a production migration.
-- Demonstrates database-enforced compare-and-swap against real user_data JSON.
-- IMPORTANT: This prototype does NOT replace/disable the legacy iydu_save RPC,
-- direct user_data UPDATE access, or existing migration/rename entrypoints.
-- Consequently it does NOT yet protect real users from all stale writers.

BEGIN;

CREATE OR REPLACE FUNCTION public.iydu_save_cas(
    p_expected_data jsonb,
    p_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $cas$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  IF p_expected_data IS NULL
     OR jsonb_typeof(p_expected_data) IS DISTINCT FROM 'object'
     OR p_data IS NULL
     OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid compare-and-swap data' USING ERRCODE='22023';
  END IF;

  SELECT n.username INTO v_name
  FROM public.iydu_usernames AS n
  WHERE n.user_id = v_uid;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'claim a username first' USING ERRCODE='P0001';
  END IF;
  IF p_data->>'u' IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'username must match reservation' USING ERRCODE='22023';
  END IF;

  -- PostgreSQL UPDATE locks the row and rechecks the JSON equality
  -- after concurrent writers release their lock. Exactly one conflicting
  -- update to the same expected JSON can be committed.
  UPDATE public.user_data AS ud
  SET data = p_data,
      updated_at = now()
  WHERE ud.user_id = v_uid
    AND ud.data = p_expected_data;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$cas$;

REVOKE ALL ON FUNCTION public.iydu_save_cas(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_save_cas(jsonb,jsonb) TO authenticated;

COMMIT;
