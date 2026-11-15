-- Disposable PostgreSQL 17 test schema. Synthetic identities only.
-- Mirrors the audited production tables, constraints, RLS and signup triggers.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
GRANT USAGE ON SCHEMA public TO authenticated,anon;

CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $body$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
$body$;

CREATE TABLE auth.users(
  id uuid PRIMARY KEY,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
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
  FOR SELECT TO authenticated USING(auth.uid()=user_id);
CREATE POLICY data_insert_own ON public.user_data
  FOR INSERT TO authenticated WITH CHECK(auth.uid()=user_id);
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

GRANT SELECT,INSERT,UPDATE ON public.user_data TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.iydu_usernames TO authenticated;
GRANT SELECT,UPDATE ON public.profiles TO authenticated;

-- The existing production signup functions (no changes made to their behavior).
CREATE FUNCTION public.iydu_claim_name_on_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
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
$function$;

CREATE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles(id,username,nickname,bio,phone)
  VALUES(NEW.id,NEW.raw_user_meta_data->>'username',
    coalesce(NEW.raw_user_meta_data->>'nickname',NEW.raw_user_meta_data->>'username'),
    coalesce(NEW.raw_user_meta_data->>'bio',''),
    coalesce(NEW.raw_user_meta_data->>'phone',''));
  INSERT INTO public.user_data(user_id) VALUES(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER iydu_claim_name_on_signup AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.iydu_claim_name_on_signup();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
