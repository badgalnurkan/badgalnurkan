-- ONLY QA PROJECT lvomrcqytfygcmguojcj. NEVER RUN ON PRODUCTION.
-- Transactional synthetic multi-device test: all accounts and journals are rolled back.
-- Requires supabase/qa/cas-foundation-qa-only.sql followed by
-- supabase/rollouts/username-integrity-staging.sql.
BEGIN;
DO $guard$
BEGIN
 IF to_regprocedure('public.iydu_save_cas(jsonb,jsonb)') IS NULL
    OR to_regclass('public.iydu_usernames') IS NULL
 THEN RAISE EXCEPTION 'QA CAS foundation missing; abort'; END IF;
END $guard$;
INSERT INTO auth.users(id,email,raw_user_meta_data)
VALUES
 ('9f0d0000-0000-4000-8000-000000000011','synthetic-desktop@example.invalid','{"username":"QaDesktop"}'::jsonb),
 ('9f0d0000-0000-4000-8000-000000000012','synthetic-other@example.invalid','{"username":"QaOther"}'::jsonb),
 ('9f0d0000-0000-4000-8000-000000000013','synthetic-third@example.invalid','{"username":"QaThird"}'::jsonb);
-- Synthetic approval for the pre-existing CAS tests under browser verification.
INSERT INTO auth.sessions(id,user_id,created_at) VALUES
 ('9f100000-0000-4000-8000-000000000011','9f0d0000-0000-4000-8000-000000000011',now()),
 ('9f100000-0000-4000-8000-000000000012','9f0d0000-0000-4000-8000-000000000012',now()),
 ('9f100000-0000-4000-8000-000000000013','9f0d0000-0000-4000-8000-000000000013',now());
INSERT INTO iydu_private.browser_verified_sessions(user_id,session_id)
SELECT user_id,id FROM auth.sessions
WHERE id IN ('9f100000-0000-4000-8000-000000000011'::uuid,
 '9f100000-0000-4000-8000-000000000012'::uuid,
 '9f100000-0000-4000-8000-000000000013'::uuid);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','9f0d0000-0000-4000-8000-000000000011',true);
SELECT set_config('request.jwt.claims','{"sub":"9f0d0000-0000-4000-8000-000000000011","role":"authenticated","session_id":"9f100000-0000-4000-8000-000000000011"}',true);
DO $assert$
DECLARE
  was_saved boolean;
  other_id uuid := '9f0d0000-0000-4000-8000-000000000012';
  base jsonb := '{}'::jsonb;
  desktop jsonb := '{"u":"QaDesktop","journal":{"2026-11-19":{"text":"synthetic desktop diary"}},"tasks":[{"id":"desktop"}]}'::jsonb;
  stale_phone jsonb := '{"u":"QaDesktop","journal":{"2026-11-20":{"text":"synthetic phone diary"}},"tasks":[{"id":"phone"}]}'::jsonb;
  latest jsonb;
  combined jsonb;
  legacy_rejected boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.user_data) <> 1 OR
     (SELECT count(*) FROM public.iydu_usernames) <> 1
  THEN RAISE EXCEPTION 'RLS should only expose current identity'; END IF;
  IF has_table_privilege('authenticated','public.user_data','UPDATE') OR
     has_table_privilege('authenticated','public.user_data','INSERT') OR
     has_table_privilege('authenticated','public.user_data','DELETE')
  THEN RAISE EXCEPTION 'Direct Data API mutation privileges still enabled'; END IF;
  was_saved := public.iydu_save_cas(base,desktop);
  IF was_saved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Initial desktop diary CAS failed';
  END IF;

  was_saved := public.iydu_save_cas(base,stale_phone);
  IF was_saved IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Stale phone update should be rejected';
  END IF;
  SELECT data INTO latest FROM public.user_data WHERE user_id=auth.uid();
  IF latest IS DISTINCT FROM desktop THEN
    RAISE EXCEPTION '19 Nov diary was erased by stale device';
  END IF;

  combined := jsonb_set(latest,'{journal,2026-11-20}',stale_phone#>'{journal,2026-11-20}',true);
  was_saved := public.iydu_save_cas(latest,combined);
  IF was_saved IS DISTINCT FROM true OR
     (SELECT data#>>'{journal,2026-11-19,text}' FROM public.user_data WHERE user_id=auth.uid())
       <> 'synthetic desktop diary' OR
     (SELECT data#>>'{journal,2026-11-20,text}' FROM public.user_data WHERE user_id=auth.uid())
       <> 'synthetic phone diary'
  THEN RAISE EXCEPTION 'Reviewed disjoint-day merge lost a diary'; END IF;

  -- Even a fresh-base accidental removal is recoverable: the trigger archives
  -- the exact prior diary entry in an owner-only private table.
  was_saved := public.iydu_save_cas(combined, combined #- '{journal,2026-11-19}');
  IF was_saved IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Intentional deletion simulation failed';
  END IF;
  IF (SELECT count(*) FROM public.iydu_journal_revisions('2026-11-19',20))<>1 OR
     (SELECT previous_entry->>'text'
        FROM public.iydu_journal_revisions('2026-11-19',20) LIMIT 1)
       <> 'synthetic desktop diary'
  THEN RAISE EXCEPTION 'Server did not preserve deleted journal revision'; END IF;

  SELECT data INTO latest FROM public.user_data WHERE user_id=auth.uid();
  SELECT jsonb_set(latest,'{journal,2026-11-19}',h.previous_entry,true)
    INTO combined
    FROM public.iydu_journal_revisions('2026-11-19',20) AS h LIMIT 1;
  IF combined IS NULL OR
     public.iydu_save_cas(latest,combined) IS DISTINCT FROM true OR
     (SELECT data#>>'{journal,2026-11-19,text}' FROM public.user_data WHERE user_id=auth.uid())
       <> 'synthetic desktop diary'
  THEN RAISE EXCEPTION 'Recovery failed to restore the deleted diary'; END IF;

  BEGIN
    PERFORM public.iydu_save('QaDesktop','Synthetic',stale_phone);
  EXCEPTION WHEN sqlstate 'P0001' THEN legacy_rejected := true;
  END;
  IF NOT legacy_rejected THEN
    RAISE EXCEPTION 'Legacy blind-save endpoint still accepts writes';
  END IF;
  IF EXISTS(SELECT 1 FROM public.user_data WHERE user_id=other_id) THEN
    RAISE EXCEPTION 'RLS exposed another account';
  END IF;
END $assert$;
SELECT set_config('request.jwt.claim.sub','9f0d0000-0000-4000-8000-000000000012',true);
SELECT set_config('request.jwt.claims','{"sub":"9f0d0000-0000-4000-8000-000000000012","role":"authenticated","session_id":"9f100000-0000-4000-8000-000000000012"}',true);
DO $other$
DECLARE ok boolean;
BEGIN
  IF (SELECT count(*) FROM public.user_data)<>1 THEN
    RAISE EXCEPTION 'Second account RLS broken';
  END IF;
  ok:=public.iydu_save_cas('{}'::jsonb,
    '{"u":"QaOther","journal":{"2026-11-19":{"text":"isolated other account"}}}'::jsonb);
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Other user CAS failed'; END IF;
  IF EXISTS(SELECT 1 FROM public.user_data WHERE
      data#>>'{journal,2026-11-19,text}'='synthetic desktop diary')
  THEN RAISE EXCEPTION 'User data leaked across accounts'; END IF;
  IF EXISTS(SELECT 1 FROM public.iydu_journal_revisions('2026-11-19',20))
  THEN RAISE EXCEPTION 'Other account could read diary history'; END IF;

END $other$;
SELECT set_config('request.jwt.claim.sub','9f0d0000-0000-4000-8000-000000000013',true);
SELECT set_config('request.jwt.claims','{"sub":"9f0d0000-0000-4000-8000-000000000013","role":"authenticated","session_id":"9f100000-0000-4000-8000-000000000013"}',true);
DO $third$
DECLARE succeeded boolean;
BEGIN
  IF (SELECT count(*) FROM public.user_data)<>1 OR
     EXISTS(SELECT 1 FROM public.iydu_journal_revisions('2026-11-19',20))
  THEN RAISE EXCEPTION 'Third account can read another account data/history'; END IF;
  succeeded:=public.iydu_save_cas('{}'::jsonb,
    '{"u":"QaThird","journal":{"2026-11-19":{"text":"third-only"}}}'::jsonb);
  IF succeeded IS DISTINCT FROM true OR
     (SELECT data#>>'{journal,2026-11-19,text}' FROM public.user_data LIMIT 1)
        <> 'third-only'
  THEN RAISE EXCEPTION 'Third account could not save its own diary'; END IF;
END $third$;
RESET ROLE;
-- A closed account must not bypass lifecycle policies via SECURITY DEFINER.
UPDATE iydu_private.account_controls
 SET state='deactivated'
 WHERE user_id='9f0d0000-0000-4000-8000-000000000011';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','9f0d0000-0000-4000-8000-000000000011',true);
SELECT set_config('request.jwt.claims','{"sub":"9f0d0000-0000-4000-8000-000000000011","role":"authenticated","session_id":"9f100000-0000-4000-8000-000000000011"}',true);
DO $closed$
DECLARE save_rejected boolean:=false; history_rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.iydu_save_cas('{}'::jsonb,
    '{"u":"QaDesktop","journal":{"2026-11-21":{"text":"must not write"}}}'::jsonb);
 EXCEPTION WHEN SQLSTATE '42501' THEN save_rejected:=true;
 END;
 BEGIN
  PERFORM 1 FROM public.iydu_journal_revisions('2026-11-19',10);
 EXCEPTION WHEN SQLSTATE '42501' THEN history_rejected:=true;
 END;
 IF NOT save_rejected OR NOT history_rejected THEN
  RAISE EXCEPTION 'Closed account bypassed data or history access';
 END IF;
END $closed$;
RESET ROLE;
SELECT 'PASS: stale writes blocked, journal history/recovery preserved, three users isolated and closed-account access denied; all test rows rolled back' AS check_result;
ROLLBACK;
