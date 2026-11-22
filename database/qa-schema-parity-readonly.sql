-- Run safely on either QA or production. No table rows, Auth data, or secrets read.
-- Missing schema objects return MISSING instead of raising undefined_relation.
-- Schema presence does NOT prove that policies, permissions or flows work.
WITH expected(kind,name) AS (
 VALUES
  ('table'::text,'public.profiles'::text),
  ('table','public.user_data'),
  ('table','public.iydu_usernames'),
  ('table','iydu_private.account_controls'),
  ('table','iydu_private.account_challenges'),
  ('function','public.iydu_account_status()'),
  ('function','public.iydu_quick_resume_status()'),
  ('function','public.iydu_save(text,text,jsonb)')
)
SELECT kind,name,
 CASE WHEN (kind='table' AND to_regclass(name) IS NOT NULL)
         OR (kind='function' AND to_regprocedure(name) IS NOT NULL)
      THEN 'PRESENT' ELSE 'MISSING' END AS status
FROM expected ORDER BY kind,name;
