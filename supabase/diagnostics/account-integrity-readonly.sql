-- READ-ONLY account integrity audit for the Supabase SQL Editor.
-- Safe to run against production: SELECT only; never writes or alters records.
-- Inspect output privately: pg_get_functiondef may reveal implementation details.

-- 1) Verify relevant schema (no personal account rows returned).
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('user_data', 'iydu_usernames')
ORDER BY table_name, ordinal_position;

-- 2) Check function definitions, SECURITY DEFINER, owner and API EXECUTE grants.
-- Run this in the SQL Editor as a privileged database administrator.
SELECT
  p.oid::regprocedure::text AS signature,
  pg_get_userbyid(p.proowner) AS owner_role,
  p.prosecdef AS security_definer,
  p.proconfig AS function_settings,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'iydu_username_available',
    'iydu_set_username',
    'iydu_save',
    'iydu_load',
    'iydu_migrate_legacy'
  )
ORDER BY p.proname, p.oid::regprocedure::text;

-- 3) Inspect constraints, including any UNIQUE rule for username.
SELECT
  c.conrelid::regclass::text AS table_name,
  c.conname AS constraint_name,
  c.contype AS constraint_type,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
JOIN pg_namespace AS n ON n.oid = c.connamespace
WHERE n.nspname = 'public'
  AND c.conrelid IN (
    SELECT t.oid FROM pg_class AS t
    JOIN pg_namespace AS ns ON ns.oid = t.relnamespace
    WHERE ns.nspname = 'public' AND t.relname IN ('user_data','iydu_usernames')
  )
ORDER BY table_name, constraint_name;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('user_data','iydu_usernames')
ORDER BY tablename, indexname;

-- 4) Verify RLS remains enabled and policies restrict account rows to auth.uid().
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('user_data','iydu_usernames')
  AND c.relkind IN ('r','p');

SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('user_data','iydu_usernames')
ORDER BY tablename, policyname;

-- 5) Aggregate-only diagnostics: no email, UID or profile data is shown.
SELECT count(*) AS user_data_rows,
       count(*) FILTER (WHERE username IS NULL OR btrim(username) = '') AS blank_usernames
FROM public.user_data;

SELECT count(*) AS duplicate_case_insensitive_username_groups
FROM (
  SELECT lower(username) AS normalized_name
  FROM public.user_data
  WHERE username IS NOT NULL
  GROUP BY lower(username)
  HAVING count(*) > 1
) AS duplicates;

-- 6) Verify the reported example only by boolean; do not retrieve the owner's identity.
SELECT EXISTS(
  SELECT 1 FROM public.user_data WHERE lower(username) = lower('Öznur')
) AS oznur_exists_in_user_data;

-- Note: an availability RPC can consult a separate username-reservation table.
-- A boolean above alone does NOT prove the username is available.
