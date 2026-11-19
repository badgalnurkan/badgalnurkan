-- STAGED ROLLOUT ONLY — NOT applied to production by this PR.
-- Never run before a verified backup, disposable-DB regression tests, and rollout approval.
-- Assumes the audited 2026-11-15 schema: auth.users, public.profiles,
-- public.user_data, public.iydu_usernames and their existing unique indexes/RLS.
-- This update does not backfill, rewrite or delete any existing account rows.
--
-- Deployment order: backup -> SQL rollout -> verify permissions -> new index.html.
-- CAS blocks stale overwrites; browser-level reconciliation is a separate release gate.
-- Account closure and 90-day security restrictions MUST still be enforced by
-- public.iydu_account_access_allowed(), including SECURITY DEFINER RPCs.

BEGIN;

-- Abort before changes if the expected uniqueness protections are missing.
DO $preflight$
BEGIN
  IF to_regclass('public.user_data') IS NULL
     OR to_regprocedure('public.iydu_account_access_allowed()') IS NULL
     OR to_regclass('public.iydu_usernames') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname='public' AND tablename='iydu_usernames'
         AND indexname='iydu_usernames_case_insensitive_key'
         AND indexdef ILIKE '%UNIQUE INDEX%'
     )
     OR NOT EXISTS (
       SELECT 1 FROM pg_indexes
       WHERE schemaname='public' AND tablename='profiles'
         AND indexname='profiles_username_lower_key'
         AND indexdef ILIKE '%UNIQUE INDEX%'
     )
  THEN
    RAISE EXCEPTION 'Schema or unique index differs from audited structure; abort rollout';
  END IF;
END;
$preflight$;

-- Client needs this server-owned lookup; do not trust a cached username or Auth metadata.
CREATE OR REPLACE FUNCTION public.iydu_my_username()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $username$
  SELECT n.username
  FROM public.iydu_usernames AS n
  WHERE n.user_id = (SELECT auth.uid())
  LIMIT 1;
$username$;

REVOKE ALL ON FUNCTION public.iydu_my_username() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_my_username() TO authenticated;

-- Reserve a name and update all three representations in ONE database transaction.
-- Row locking also serializes this operation with iydu_save for the same account.
-- If any UNIQUE index blocks the update, the whole function call rolls back.
CREATE OR REPLACE FUNCTION public.iydu_set_username(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $rename$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text := btrim(p_username);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT public.iydu_account_access_allowed() THEN
    RAISE EXCEPTION 'account access restricted' USING ERRCODE='42501';
  END IF;
  IF v_name IS NULL
     OR v_name !~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$'
  THEN
    RAISE EXCEPTION 'invalid username' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.user_data WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile data missing' USING ERRCODE='P0002';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id=v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile missing' USING ERRCODE='P0002';
  END IF;

  INSERT INTO public.iydu_usernames(user_id,username)
  VALUES(v_uid,v_name)
  ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username;

  UPDATE public.profiles
  SET username=v_name
  WHERE id=v_uid;

  UPDATE public.user_data
  SET data=jsonb_set(data,'{u}',to_jsonb(v_name),true),
      updated_at=now()
  WHERE user_id=v_uid;
END;
$rename$;

REVOKE ALL ON FUNCTION public.iydu_set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_set_username(text) TO authenticated;

-- Existing clients send entire JSON documents. Always correct data.u from
-- the authoritative reservation so a stale tab cannot revert the username.
-- NOTE: Other application fields can STILL be overwritten by another device;
-- full revision-based synchronization is a separate required release gate.
CREATE OR REPLACE FUNCTION public.iydu_save(
  p_username text,
  p_nick text,
  p_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $save$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_reserved text;
  v_data jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT public.iydu_account_access_allowed() THEN
    RAISE EXCEPTION 'account access restricted' USING ERRCODE='42501';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid user data' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.user_data WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile data missing' USING ERRCODE='P0002';
  END IF;

  SELECT n.username INTO v_reserved
  FROM public.iydu_usernames AS n
  WHERE n.user_id=v_uid;

  IF v_reserved IS NULL THEN
    RAISE EXCEPTION 'claim a username first' USING ERRCODE='P0001';
  END IF;

  v_data := jsonb_set(p_data,'{u}',to_jsonb(v_reserved),true);
  UPDATE public.user_data
  SET data=v_data,updated_at=now()
  WHERE user_id=v_uid;
END;
$save$;

REVOKE ALL ON FUNCTION public.iydu_save(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_save(text,text,jsonb) TO authenticated;

-- Registration hint checks BOTH unique constraints. This is only a hint:
-- the actual INSERT / UPDATE remains the authoritative race-safe check.
CREATE OR REPLACE FUNCTION public.iydu_username_available(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $available$
  SELECT
    COALESCE(btrim(p_username) ~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$',false)
    AND NOT EXISTS (
      SELECT 1 FROM public.iydu_usernames AS n
      WHERE lower(n.username)=lower(btrim(p_username))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE lower(p.username)=lower(btrim(p_username))
    );
$available$;

-- Deliberately public, boolean-only registration hint. Review SECURITY DEFINER
-- permissions with database advisors; never return owner IDs or account rows.
REVOKE ALL ON FUNCTION public.iydu_username_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iydu_username_available(text) TO anon,authenticated;


-- SYNCHRONIZATION CUTOVER (staged with username integrity in ONE transaction)
-- All browser writes must use `iydu_save_cas`; the old blind-write RPC is blocked.
-- Direct table write permissions must be removed, not merely hidden by RLS.

-- No direct mutation of user records is allowed through public Data API.
-- Note: direct TRUNCATE/REFERENCES/TRIGGER table privileges bypass ordinary RLS.
REVOKE ALL PRIVILEGES ON TABLE
  public.user_data, public.iydu_usernames, public.profiles
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE
  public.user_data, public.iydu_usernames, public.profiles
TO authenticated;

-- Set username atomically. SECURITY DEFINER is necessary because all direct
-- table writes are revoked. No dynamic SQL; strict auth.uid ownership checks;
-- fully qualified relations; function EXECUTE granted only to authenticated.
CREATE OR REPLACE FUNCTION public.iydu_set_username(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $rename_guarded$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text := btrim(p_username);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT public.iydu_account_access_allowed() THEN
    RAISE EXCEPTION 'account access restricted' USING ERRCODE='42501';
  END IF;
  IF v_name IS NULL
     OR v_name !~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$' THEN
    RAISE EXCEPTION 'invalid username' USING ERRCODE='22023';
  END IF;

  PERFORM 1 FROM public.user_data WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile data missing' USING ERRCODE='P0002'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile missing' USING ERRCODE='P0002'; END IF;

  INSERT INTO public.iydu_usernames(user_id,username)
  VALUES(v_uid,v_name)
  ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username;

  UPDATE public.profiles SET username=v_name WHERE id=v_uid;
  UPDATE public.user_data
  SET data=jsonb_set(data,'{u}',to_jsonb(v_name),true),
      updated_at=now()
  WHERE user_id=v_uid;
END;
$rename_guarded$;
REVOKE ALL ON FUNCTION public.iydu_set_username(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_set_username(text) TO authenticated;

-- CAS: the caller supplies the LAST SERVER-ACKNOWLEDGED raw JSON, not a guess.
-- In READ COMMITTED, UPDATE atomically rechecks the predicate under the row lock.
-- jsonb equality covers every field (tasks, journals, preferences, etc.).
CREATE OR REPLACE FUNCTION public.iydu_save_cas(
  p_expected_data jsonb, p_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $cas_guarded$
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
  IF p_expected_data IS NULL
     OR jsonb_typeof(p_expected_data) IS DISTINCT FROM 'object'
     OR p_data IS NULL
     OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid compare-and-swap data' USING ERRCODE='22023';
  END IF;
  SELECT n.username INTO v_name
  FROM public.iydu_usernames AS n WHERE n.user_id=v_uid;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'claim a username first' USING ERRCODE='P0001';
  END IF;
  IF p_data->>'u' IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'username must match reservation' USING ERRCODE='22023';
  END IF;

  UPDATE public.user_data AS ud
  SET data=p_data,updated_at=now()
  WHERE ud.user_id=v_uid AND ud.data=p_expected_data;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows=1;
END;
$cas_guarded$;
REVOKE ALL ON FUNCTION public.iydu_save_cas(jsonb,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_save_cas(jsonb,jsonb)
  TO authenticated;

-- Old deployed clients have no expected revision and cannot prove freshness.
-- Reject their writes rather than allow silent loss of another device's data.
-- Old clients will retain local browser state and display a sync warning.
CREATE OR REPLACE FUNCTION public.iydu_save(
  p_username text,p_nick text,p_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $blocked$
BEGIN
  RAISE EXCEPTION 'client update required: stale writer disabled'
    USING ERRCODE='P0001';
END;
$blocked$;
REVOKE ALL ON FUNCTION public.iydu_save(text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_save(text,text,jsonb)
  TO authenticated;

-- The existing account-migration RPC is already conditional, but needs a
-- narrowly scoped definer function after direct table UPDATE is revoked.
CREATE OR REPLACE FUNCTION public.iydu_migrate_legacy(
  p_data jsonb, p_expected_data jsonb DEFAULT NULL::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $migrate_guarded$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_name text;
  v_rows integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  IF NOT public.iydu_account_access_allowed() THEN
    RAISE EXCEPTION 'account access restricted' USING ERRCODE='42501';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object'
     OR p_data->>'authUid' IS DISTINCT FROM v_uid::text
     OR p_data->>'accountOrigin' IS DISTINCT FROM 'cloud' THEN
    RAISE EXCEPTION 'Invalid migration data' USING ERRCODE='22023';
  END IF;
  SELECT n.username INTO v_name FROM public.iydu_usernames n
  WHERE n.user_id=v_uid;
  IF v_name IS NULL OR p_data->>'u' IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'Username reservation mismatch' USING ERRCODE='22023';
  END IF;
  IF p_expected_data IS NULL THEN
    INSERT INTO public.user_data(user_id,data,updated_at)
    VALUES(v_uid,p_data,now())
    ON CONFLICT(user_id) DO NOTHING;
  ELSE
    IF jsonb_typeof(p_expected_data) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid expected data' USING ERRCODE='22023';
    END IF;
    UPDATE public.user_data
    SET data=p_data,updated_at=now()
    WHERE user_id=v_uid AND data=p_expected_data;
  END IF;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  RETURN v_rows=1;
END;
$migrate_guarded$;
REVOKE ALL ON FUNCTION public.iydu_migrate_legacy(jsonb,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_migrate_legacy(jsonb,jsonb)
  TO authenticated;

-- There should be no mutation paths through anonymous or authenticated
-- table grants; PostgreSQL owner/trigger functions can still write.

COMMIT;
