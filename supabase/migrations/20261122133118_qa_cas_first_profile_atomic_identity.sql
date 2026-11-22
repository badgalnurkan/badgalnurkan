-- Applied only to the isolated Supabase QA project on 2026-11-22.
-- Do not deploy this QA migration directly to production without the migration release plan.
CREATE OR REPLACE FUNCTION public.iydu_save_cas(p_expected_data jsonb, p_data jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT public.iydu_account_access_allowed() THEN
    RAISE EXCEPTION 'account access restricted' USING ERRCODE='42501';
  END IF;
  IF p_expected_data IS NULL OR jsonb_typeof(p_expected_data) IS DISTINCT FROM 'object'
     OR p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid compare-and-swap data' USING ERRCODE='22023';
  END IF;
  SELECT n.username INTO v_name
    FROM public.iydu_usernames AS n WHERE n.user_id=v_uid;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'claim a username first' USING ERRCODE='P0001';
  END IF;
  IF p_data->>'u' IS DISTINCT FROM v_name OR p_data->>'authUid' IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'profile identity must match authenticated user' USING ERRCODE='22023';
  END IF;

  -- Only one writer may replace a matching historical document.
  UPDATE public.user_data AS ud
     SET data=p_data, updated_at=now()
   WHERE ud.user_id=v_uid AND ud.data=p_expected_data;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows=1 THEN RETURN true; END IF;

  -- An authenticated user with a reserved username may initialize once,
  -- but only if the caller explicitly observed an empty remote document.
  -- Concurrent first writers are serialized by the user_id primary key:
  -- only one INSERT can succeed and the other reports a conflict.
  IF p_expected_data <> '{}'::jsonb THEN RETURN false; END IF;
  INSERT INTO public.user_data(user_id,data,updated_at)
  VALUES(v_uid,p_data,now())
  ON CONFLICT(user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows=1;
END;
$function$


REVOKE ALL ON FUNCTION public.iydu_save_cas(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_save_cas(jsonb,jsonb) TO authenticated;
