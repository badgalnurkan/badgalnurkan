-- STAGED (QA FIRST): retain historical versions of changed/deleted diary entries.
-- Do not execute on production until verified backups, schema audit and coordinated
-- application rollout. Never copy real journal content into logs or GitHub.
-- Uses a private table and strict owner-only RPC. No auto-merge on conflict.
BEGIN;
DO $preflight$
BEGIN
 IF to_regclass('public.user_data') IS NULL OR
    to_regnamespace('iydu_private') IS NULL OR
    to_regclass('iydu_private.journal_revisions') IS NOT NULL
 THEN RAISE EXCEPTION 'Journal history schema unexpected; abort'; END IF;
END $preflight$;

CREATE TABLE iydu_private.journal_revisions (
 revision_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 day_key text NOT NULL CHECK (day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
 previous_entry jsonb NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX journal_revisions_user_day_recent
  ON iydu_private.journal_revisions(user_id,day_key,captured_at DESC,revision_id DESC);
ALTER TABLE iydu_private.journal_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE iydu_private.journal_revisions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON SEQUENCE iydu_private.journal_revisions_revision_id_seq
  FROM PUBLIC, anon, authenticated;

-- Invoked ONLY as a trigger. A failure to archive must fail the entire write;
-- continuing without a recovery copy would create a false sense of safety.
CREATE FUNCTION iydu_private.capture_journal_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $capture$
DECLARE
  was_journal jsonb;
  now_journal jsonb;
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'journal revision cannot change owner';
  END IF;
  was_journal := CASE WHEN jsonb_typeof(OLD.data->'journal')='object'
    THEN OLD.data->'journal' ELSE '{}'::jsonb END;
  now_journal := CASE WHEN jsonb_typeof(NEW.data->'journal')='object'
    THEN NEW.data->'journal' ELSE '{}'::jsonb END;

  INSERT INTO iydu_private.journal_revisions(user_id,day_key,previous_entry)
  SELECT OLD.user_id,entry.key,entry.value
  FROM jsonb_each(was_journal) AS entry
  WHERE entry.key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND entry.value IS DISTINCT FROM now_journal->entry.key;
  RETURN NEW;
END;
$capture$;
REVOKE ALL ON FUNCTION iydu_private.capture_journal_revision()
 FROM PUBLIC, anon, authenticated;

CREATE TRIGGER iydu_capture_journal_revision
 AFTER UPDATE OF data ON public.user_data
 FOR EACH ROW
 WHEN (OLD.data->'journal' IS DISTINCT FROM NEW.data->'journal')
 EXECUTE FUNCTION iydu_private.capture_journal_revision();

-- A user's old diary entries can be read only with their own Auth token.
-- Keep the table in the unexposed schema; never grant direct access to it.
CREATE FUNCTION public.iydu_journal_revisions(
 p_day text DEFAULT NULL, p_limit integer DEFAULT 20
)
RETURNS TABLE(day_key text,previous_entry jsonb,captured_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $history$
DECLARE v_uid uuid := (SELECT auth.uid());
BEGIN
 IF v_uid IS NULL THEN
   RAISE EXCEPTION 'not authenticated' USING ERRCODE='28000';
 END IF;
 IF p_day IS NOT NULL AND p_day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
   RAISE EXCEPTION 'invalid day key' USING ERRCODE='22023';
 END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
   RAISE EXCEPTION 'limit must be 1..100' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT h.day_key,h.previous_entry,h.captured_at
 FROM iydu_private.journal_revisions AS h
 WHERE h.user_id=v_uid AND (p_day IS NULL OR h.day_key=p_day)
 ORDER BY h.captured_at DESC,h.revision_id DESC
 LIMIT p_limit;
END;
$history$;
REVOKE ALL ON FUNCTION public.iydu_journal_revisions(text,integer)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iydu_journal_revisions(text,integer)
 TO authenticated;
COMMIT;
