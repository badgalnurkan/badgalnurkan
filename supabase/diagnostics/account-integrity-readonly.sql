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
-- IMPORTANT: 'public.user_data.username' may not exist in deployed schemas.
-- Use to_jsonb(row)->>'username' to inspect optional columns without a 42703 error.
-- If user names are embedded in JSONB, try data.u or data.username.
-- These checks describe the user_data records only; they do not guarantee
-- that a separately managed username reservation is free.
WITH names AS (
  SELECT NULLIF(btrim(COALESCE(
    to_jsonb(ud)->>'username',
    to_jsonb(ud)->'data'->>'u',
    to_jsonb(ud)->'data'->>'username',
    ''
  )), '') AS username_value
  FROM public.user_data AS ud
)
SELECT COUNT(*) AS user_data_rows,
       COUNT(*) FILTER (WHERE username_value IS NULL) AS rows_without_detectable_username
FROM names;

WITH names AS (
  SELECT LOWER(NULLIF(btrim(COALESCE(
    to_jsonb(ud)->>'username',
    to_jsonb(ud)->'data'->>'u',
    to_jsonb(ud)->'data'->>'username',
    ''
  )), '')) AS normalized_name
  FROM public.user_data AS ud
)
SELECT COUNT(*) AS duplicate_case_insensitive_username_groups
FROM (
  SELECT normalized_name
  FROM names
  WHERE normalized_name IS NOT NULL
  GROUP BY normalized_name
  HAVING COUNT(*) > 1
) AS duplicates;

-- 6) Verify the reported example only by boolean, without identifying an account.
-- False does not imply globally available: the reservation may live elsewhere,
-- and database LOWER() behavior may differ from Turkish locale case folding.
SELECT EXISTS(
  SELECT 1 FROM public.user_data AS ud
  WHERE LOWER(COALESCE(
    to_jsonb(ud)->>'username',
    to_jsonb(ud)->'data'->>'u',
    to_jsonb(ud)->'data'->>'username',
    ''
  )) = LOWER('Öznur')
) AS oznur_appears_in_user_data;

-- 7) Find all deployed public tables/views for reservation logic (metadata only).
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema='public'
  AND (table_name ILIKE '%username%' OR table_name ILIKE '%reservation%' OR table_name ILIKE 'iydu%')
ORDER BY table_name;

-- Availability RPCs can consult a separate username-reservation table.
-- Run the definitions in section 2 to identify their actual source of truth.
