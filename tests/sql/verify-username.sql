-- Executed only against an ephemeral CI PostgreSQL 17 service, never production.
-- Uses artificial UUIDs and checks commit/rollback behavior rather than mocks.
\set ON_ERROR_STOP on

DO $permissions$
BEGIN
  IF has_function_privilege('anon','public.iydu_my_username()','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can read claimed username';
  END IF;
  IF has_function_privilege('anon','public.iydu_set_username(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can modify username';
  END IF;
  IF has_function_privilege('anon','public.iydu_save(text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous role can save account JSON';
  END IF;
  IF NOT has_function_privilege('authenticated','public.iydu_my_username()','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated role cannot read its claimed username';
  END IF;
  IF NOT has_function_privilege('anon','public.iydu_username_available(text)','EXECUTE') THEN
    RAISE EXCEPTION 'Signup preflight must remain accessible before authentication';
  END IF;
END;
$permissions$;

-- First user has an email-registration username. Others resemble Google OAuth.
INSERT INTO auth.users(id,raw_user_meta_data)
VALUES
 ('00000000-0000-0000-0000-000000000001','{"username":"Irem"}'),
 ('00000000-0000-0000-0000-000000000002','{}'),
 ('00000000-0000-0000-0000-000000000003','{}'),
 ('00000000-0000-0000-0000-000000000004','{}');

DO $signup$
BEGIN
 IF (SELECT COUNT(*) FROM auth.users)<>4
    OR (SELECT COUNT(*) FROM public.profiles)<>4
    OR (SELECT COUNT(*) FROM public.user_data)<>4
    OR (SELECT COUNT(*) FROM public.iydu_usernames)<>1
 THEN RAISE EXCEPTION 'Signup triggers or initial username reservation are broken'; END IF;
 IF (SELECT username FROM public.iydu_usernames WHERE user_id='00000000-0000-0000-0000-000000000001') <> 'Irem'
 THEN RAISE EXCEPTION 'Signup username was not reserved'; END IF;
 IF (SELECT COUNT(*) FROM public.user_data WHERE data <> '{}'::jsonb)<>0
 THEN RAISE EXCEPTION 'New profile default data changed'; END IF;
END;
$signup$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
DO $claim$
BEGIN
 IF public.iydu_my_username() IS NOT NULL THEN
   RAISE EXCEPTION 'Google user unexpectedly has a reservation';
 END IF;
END;
$claim$;
SELECT public.iydu_set_username('Öznur');
DO $claim$
BEGIN
 IF public.iydu_my_username() <> 'Öznur' THEN
   RAISE EXCEPTION 'Username readback mismatch';
 END IF;
 IF (SELECT username FROM public.profiles WHERE id=auth.uid()) <> 'Öznur' THEN
   RAISE EXCEPTION 'Profile username not updated';
 END IF;
 IF (SELECT data->>'u' FROM public.user_data WHERE user_id=auth.uid()) <> 'Öznur' THEN
   RAISE EXCEPTION 'JSON username not updated';
 END IF;
 IF (SELECT COUNT(*) FROM public.user_data)<>1 THEN
   RAISE EXCEPTION 'RLS data ownership filter failed';
 END IF;
 IF public.iydu_username_available('öZNUR') THEN
   RAISE EXCEPTION 'Case insensitive name availability was broken';
 END IF;
END;
$claim$;

-- Old tabs are not allowed to revert the canonical username through iydu_save.
DO $legacy_disabled$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN
    PERFORM public.iydu_save('staleAlias','ignored','{"u":"staleAlias"}'::jsonb);
  EXCEPTION WHEN sqlstate 'P0001' THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Old blind save is still usable'; END IF;
END;
$legacy_disabled$;
SELECT public.iydu_save_cas('{}'::jsonb,'{"u":"Öznur","tasks":[{"id":"t1"}]}'::jsonb);
DO $auth_privileges$
BEGIN
  IF has_table_privilege('authenticated','public.user_data','UPDATE') OR
     has_table_privilege('authenticated','public.user_data','TRUNCATE') OR
     has_table_privilege('authenticated','public.iydu_usernames','UPDATE') OR
     has_table_privilege('authenticated','public.profiles','UPDATE') THEN
    RAISE EXCEPTION 'Direct table write privileges were not removed';
  END IF;
END;
$auth_privileges$;
DO $save$
BEGIN
 IF (SELECT data->>'u' FROM public.user_data WHERE user_id=auth.uid()) <> 'Öznur'
    OR (SELECT jsonb_array_length(data->'tasks') FROM public.user_data WHERE user_id=auth.uid())<>1
 THEN RAISE EXCEPTION 'Canonical username or app data not preserved by save'; END IF;
END;
$save$;

-- Rename in one RPC; the old name becomes available afterwards.
SELECT public.iydu_set_username('YeniÖznur');
DO $rename$
BEGIN
 IF public.iydu_my_username()<>'YeniÖznur'
    OR (SELECT username FROM public.profiles WHERE id=auth.uid())<>'YeniÖznur'
    OR (SELECT data->>'u' FROM public.user_data WHERE user_id=auth.uid())<>'YeniÖznur'
 THEN RAISE EXCEPTION 'Atomic rename left inconsistent tables'; END IF;
 IF NOT public.iydu_username_available('Öznur') THEN
   RAISE EXCEPTION 'Old username should be available after rename';
 END IF;
 IF (SELECT jsonb_array_length(data->'tasks') FROM public.user_data WHERE user_id=auth.uid())<>1
 THEN RAISE EXCEPTION 'Rename changed unrelated tasks'; END IF;
END;
$rename$;
RESET ROLE;

-- An Auth insert using a duplicate metadata username must fail atomically.
DO $duplicate_signup$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   INSERT INTO auth.users(id,raw_user_meta_data)
   VALUES ('00000000-0000-0000-0000-000000000005',
           '{"username":"yeniöznur"}');
 EXCEPTION WHEN unique_violation THEN rejected:=true;
 END;
 IF NOT rejected OR EXISTS(
   SELECT 1 FROM auth.users WHERE id='00000000-0000-0000-0000-000000000005'
 ) THEN
   RAISE EXCEPTION 'Duplicate signup partially committed';
 END IF;
END;
$duplicate_signup$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
DO $duplicate_rename$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.iydu_set_username('yeniöznur');
 EXCEPTION WHEN unique_violation THEN rejected:=true;
 END;
 IF NOT rejected OR public.iydu_my_username() IS NOT NULL THEN
   RAISE EXCEPTION 'Duplicate rename partially committed';
 END IF;
 IF (SELECT data FROM public.user_data WHERE user_id=auth.uid()) <> '{}'::jsonb THEN
   RAISE EXCEPTION 'Rejected rename modified account JSON';
 END IF;
END;
$duplicate_rename$;
RESET ROLE;

-- Another account's historic profiles.username can cause a UNIQUE conflict;
-- availability must not lie about that database constraint.
UPDATE public.profiles
SET username='GhostLegacy'
WHERE id='00000000-0000-0000-0000-000000000001';

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
DO $stale_profile$
DECLARE rejected boolean:=false;
BEGIN
 IF public.iydu_username_available('GhostLegacy') THEN
   RAISE EXCEPTION 'Availability ignored profiles unique index';
 END IF;
 BEGIN
  PERFORM public.iydu_set_username('GhostLegacy');
 EXCEPTION WHEN unique_violation THEN rejected:=true;
 END;
 IF NOT rejected OR public.iydu_my_username() IS NOT NULL THEN
   RAISE EXCEPTION 'Stale profile conflict left a partial reservation';
 END IF;
END;
$stale_profile$;
RESET ROLE;

-- Unclaimed Google profile may NOT publish an unreserved JSON identity.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
DO $unclaimed_save$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.iydu_save_cas('{}'::jsonb,'{"u":"fake"}'::jsonb);
 EXCEPTION WHEN sqlstate 'P0001' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'Unclaimed account must not push JSON'; END IF;
 IF (SELECT data FROM public.user_data WHERE user_id=auth.uid()) <> '{}'::jsonb THEN
   RAISE EXCEPTION 'Rejected save modified unclaimed data';
 END IF;
END;
$unclaimed_save$;
RESET ROLE;

SELECT 'Username integration tests passed on disposable PostgreSQL' AS result;
