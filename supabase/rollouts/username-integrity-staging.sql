-- STAGED ROLLOUT ONLY — NOT applied to production by this PR.
-- Never run before a verified backup, disposable-DB regression tests, and rollout approval.
-- Assumes the audited 2026-11-15 schema: auth.users, public.profiles,
-- public.user_data, public.iydu_usernames and their existing unique indexes/RLS.
-- This update does not backfill, rewrite or delete any existing account rows.
--
-- Deployment order: backup -> SQL rollout -> verify permissions -> new index.html.
-- IMPORTANT: This change does NOT solve the separate cross-device lost-update risk.

BEGIN;

-- Abort before changes if the expected uniqueness protections are missing.
DO $preflight$
BEGIN
  IF to_regclass('public.user_data') IS NULL
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

COMMIT;
