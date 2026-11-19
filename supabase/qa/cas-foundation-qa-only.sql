-- QA PROJECT ONLY: lvomrcqytfygcmguojcj (iydu-retention-qa-free).
-- Based on tests/supabase-local/bootstrap.sql at the same PR revision.
-- This is NOT a production migration. Never run against flcfqwndqfmbritaywfb.
-- Existing QA Auth users are not copied, rewritten or deleted; the new triggers
-- only initialize profiles for subsequently created synthetic QA accounts.
-- Assumes QA public currently contains no app tables (checked 2026-11-20).
BEGIN;
DO $qa_only$
BEGIN
  IF to_regclass('public.user_data') IS NOT NULL
      OR to_regclass('public.iydu_usernames') IS NOT NULL
      OR to_regclass('public.profiles') IS NOT NULL
      OR EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal
            AND tgname IN ('iydu_claim_name_on_signup','on_auth_user_created'))
  THEN
    RAISE EXCEPTION 'QA app schema already exists or trigger collision; abort';
  END IF;
END;
$qa_only$;
CREATE TABLE public.user_data(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.iydu_usernames(
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL
);
CREATE UNIQUE INDEX iydu_usernames_case_insensitive_key
  ON public.iydu_usernames(lower(username));
CREATE TABLE public.profiles(
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  nickname text,
  bio text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  username_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  nickname_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower_key
  ON public.profiles(lower(username));

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iydu_usernames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_select_own ON public.user_data
  FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE POLICY data_insert_own ON public.user_data
  FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY data_update_own ON public.user_data
  FOR UPDATE TO authenticated USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY iydu_username_select_own ON public.iydu_usernames
  FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY iydu_username_insert_own ON public.iydu_usernames
  FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY iydu_username_update_own ON public.iydu_usernames
  FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING(auth.uid()=id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING(auth.uid()=id) WITH CHECK(auth.uid()=id);

GRANT USAGE ON SCHEMA public TO anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.user_data TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.iydu_usernames TO authenticated;
GRANT SELECT,UPDATE ON public.profiles TO authenticated;

-- Definitions copied from the user's live trigger audit, for isolated testing.
CREATE OR REPLACE FUNCTION public.iydu_claim_name_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_username text;
BEGIN
  v_username:=btrim(coalesce(NEW.raw_user_meta_data->>'username',''));
  IF v_username ~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$' THEN
    INSERT INTO public.iydu_usernames(user_id,username)
    VALUES(NEW.id,v_username)
    ON CONFLICT(user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$claim$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $new_user$
BEGIN
  INSERT INTO public.profiles(id,username,nickname,bio,phone)
  VALUES(NEW.id,NEW.raw_user_meta_data->>'username',
    coalesce(NEW.raw_user_meta_data->>'nickname',NEW.raw_user_meta_data->>'username'),
    coalesce(NEW.raw_user_meta_data->>'bio',''),
    coalesce(NEW.raw_user_meta_data->>'phone',''));
  INSERT INTO public.user_data(user_id) VALUES(NEW.id);
  RETURN NEW;
END;
$new_user$;

CREATE TRIGGER iydu_claim_name_on_signup AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.iydu_claim_name_on_signup();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Existing production load RPC; the staged rollout intentionally leaves it unchanged.
CREATE OR REPLACE FUNCTION public.iydu_load(p_username text)
RETURNS TABLE(data jsonb) LANGUAGE plpgsql SET search_path TO ''
AS $load$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
  END IF;
  RETURN QUERY SELECT ud.data FROM public.user_data AS ud
  WHERE ud.user_id=auth.uid() LIMIT 1;
END;
$load$;
REVOKE ALL ON FUNCTION public.iydu_load(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_load(text) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iydu_claim_name_on_signup() FROM PUBLIC, anon, authenticated;
COMMIT;
