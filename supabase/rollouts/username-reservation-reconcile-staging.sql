-- STAGING ONLY: controlled identity reconciliation for the 2026-11-20 CAS upgrade.
-- Do NOT apply to production until an encrypted DB backup has been restored/tested.
-- Does not alter user_data JSON, passwords, auth.users or account lifecycle.
-- Existing (reservation,JSON) matches are authoritative when present.
-- For an unreserved account, the user's existing JSON 'u' is authoritative.
-- All conditions are checked and all changes happen in ONE transaction.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.user_data,public.profiles,public.iydu_usernames
 IN SHARE ROW EXCLUSIVE MODE;
DO $reconcile$
DECLARE
 n_missing integer;
 n_updated integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND tablename='iydu_usernames' AND indexname='iydu_usernames_case_insensitive_key')
 OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND tablename='profiles' AND indexname='profiles_username_lower_key')
 THEN RAISE EXCEPTION 'Username unique index missing; abort'; END IF;

 IF EXISTS(
  SELECT 1 FROM public.user_data d
  LEFT JOIN public.profiles p ON p.id=d.user_id WHERE p.id IS NULL)
 THEN RAISE EXCEPTION 'Orphaned cloud data without profile; abort'; END IF;

 -- Never silently overwrite an already-reserved user identity.
 IF EXISTS(
  SELECT 1 FROM public.user_data d JOIN public.iydu_usernames n ON n.user_id=d.user_id
  WHERE d.data->>'u' IS DISTINCT FROM n.username)
 THEN RAISE EXCEPTION 'Reservation disagrees with account JSON; abort for manual review'; END IF;

 -- Existing unreserved account must have a valid candidate from its own data.
 IF EXISTS(
  SELECT 1 FROM public.user_data d
  LEFT JOIN public.iydu_usernames n ON n.user_id=d.user_id
  WHERE n.user_id IS NULL AND (
    d.data->>'u' IS NULL OR
    d.data->>'u' !~ '^[A-Za-z0-9ÇĞİÖŞÜçğıöşü_.-]{3,20}$'
  ))
 THEN RAISE EXCEPTION 'Missing reservation with invalid username; abort'; END IF;

 -- New candidate may not be owned by ANY other reservation or other profile.
 IF EXISTS(
  SELECT 1 FROM public.user_data d
  LEFT JOIN public.iydu_usernames n ON n.user_id=d.user_id
  WHERE n.user_id IS NULL AND (
    EXISTS(SELECT 1 FROM public.iydu_usernames used
      WHERE lower(used.username)=lower(d.data->>'u') AND used.user_id<>d.user_id)
    OR EXISTS(SELECT 1 FROM public.profiles used
      WHERE lower(used.username)=lower(d.data->>'u') AND used.id<>d.user_id)
  ))
 THEN RAISE EXCEPTION 'Proposed name conflicts with existing profile; abort'; END IF;

 IF EXISTS(
  SELECT 1 FROM public.user_data a JOIN public.user_data b
   ON a.user_id<>b.user_id AND lower(a.data->>'u')=lower(b.data->>'u')
  LEFT JOIN public.iydu_usernames n ON n.user_id=a.user_id
  WHERE n.user_id IS NULL
 )
 THEN RAISE EXCEPTION 'Duplicate account JSON names; abort'; END IF;

 -- Existing profile labels might block somebody else's authoritative name.
 IF EXISTS(
   SELECT 1 FROM public.iydu_usernames n JOIN public.profiles p
    ON lower(p.username)=lower(n.username) AND p.id<>n.user_id)
 THEN RAISE EXCEPTION 'Reserved name currently used by another profile; abort'; END IF;

 INSERT INTO public.iydu_usernames(user_id,username)
 SELECT d.user_id,d.data->>'u'
 FROM public.user_data d
 LEFT JOIN public.iydu_usernames n ON n.user_id=d.user_id
 WHERE n.user_id IS NULL;
 GET DIAGNOSTICS n_missing=ROW_COUNT;

 UPDATE public.profiles p SET username=n.username
 FROM public.iydu_usernames n
 WHERE p.id=n.user_id AND p.username IS DISTINCT FROM n.username;
 GET DIAGNOSTICS n_updated=ROW_COUNT;

 IF EXISTS(
    SELECT 1 FROM public.user_data d LEFT JOIN public.iydu_usernames n
     ON n.user_id=d.user_id WHERE n.user_id IS NULL
 ) OR EXISTS(
    SELECT 1 FROM public.profiles p JOIN public.iydu_usernames n
     ON n.user_id=p.id WHERE p.username IS DISTINCT FROM n.username
 ) THEN RAISE EXCEPTION 'Post-reconciliation integrity mismatch; abort'; END IF;

 RAISE NOTICE 'Identity reconciliation completed: % missing reservations, % stale profile labels; no user_data/auth changed',
   n_missing,n_updated;
END $reconcile$;
COMMIT;
