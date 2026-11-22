-- Improvin' Your Day — read-only pre-release checks (2026-11-19).
-- Safe on production: SELECT only, no individual emails, tokens, user IDs or row payloads.
-- BLOCK: do not ship dependent features. WARN: investigate before release.
-- PASS: structural check only; real 3-account / browser / SMTP E2E is still required.
WITH expected(table_name, owner_column) AS (
  VALUES ('profiles'::text, 'id'::text),
         ('user_data', 'user_id'),
         ('iydu_usernames', 'user_id')
),
table_checks AS (
  SELECT 'rls_' || e.table_name AS check_id,
    CASE WHEN c.oid IS NOT NULL AND c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = e.table_name
          AND p.permissive = 'RESTRICTIVE'
          AND p.policyname = 'account_lifecycle_' ||
              CASE e.table_name WHEN 'user_data' THEN 'data'
                WHEN 'iydu_usernames' THEN 'names' ELSE 'profiles' END
      )
      AND EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = e.table_name
          AND p.roles @> ARRAY['authenticated']::name[]
          AND coalesce(p.qual,'') LIKE '%auth.uid()%'
          AND coalesce(p.qual,'') LIKE '%' || e.owner_column || '%'
      )
    THEN 'PASS' ELSE 'BLOCK' END AS status,
    'RLS, restrictive account lifecycle and authenticated owner policy'::text AS detail
  FROM expected e
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || e.table_name)
),
other_checks AS (
  SELECT 'auth_profile_counts' AS check_id,
    CASE WHEN (SELECT count(*) FROM auth.users) = (SELECT count(*) FROM public.profiles)
           AND (SELECT count(*) FROM auth.users) = (SELECT count(*) FROM public.user_data)
           AND NOT EXISTS (
             SELECT 1 FROM public.user_data d
             WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = d.user_id)
           )
      THEN 'PASS' ELSE 'WARN' END AS status,
    'Compare account/profile/data totals and detect orphan data (counts only)' AS detail
  UNION ALL
  SELECT 'username_reservations',
    CASE WHEN (SELECT count(*) FROM public.iydu_usernames) =
              (SELECT count(*) FROM auth.users) THEN 'PASS' ELSE 'WARN' END,
    'Every Auth user should have an explicit username reservation'
  UNION ALL
  SELECT 'multi_device_cas',
    CASE WHEN has_function_privilege('authenticated',
                'public.iydu_save(text,text,jsonb)', 'EXECUTE')
      AND position('ON CONFLICT (user_id) DO UPDATE'
        IN pg_get_functiondef('public.iydu_save(text,text,jsonb)'::regprocedure)) > 0
      THEN 'BLOCK' ELSE 'PASS' END,
    'Detect legacy full-JSON blind overwrite through executable iydu_save'
  UNION ALL
  SELECT 'quick_google_resume',
    CASE WHEN to_regprocedure('public.iydu_quick_resume_status()') IS NOT NULL
      THEN 'PASS' ELSE 'BLOCK' END,
    'Signed OAuth age gate exists; active-session expiration requires separate E2E'
  UNION ALL
  SELECT 'push_configuration',
    CASE WHEN (SELECT count(*) FROM iydu_private.push_keys) > 0
         AND (SELECT count(*) FROM iydu_private.push_devices) > 0
      THEN 'PASS' ELSE 'WARN' END,
    'VAPID configuration and opt-in device registration (counts only)'
  UNION ALL
  SELECT 'deletion_cron',
    CASE WHEN EXISTS (
      SELECT 1 FROM cron.job
      WHERE jobname = 'iydu-account-deletion' AND active
    ) THEN 'PASS' ELSE 'BLOCK' END,
    'Scheduled expiration job exists; delivery and deletion remain E2E checks'
  UNION ALL
  SELECT 'public_definer_review',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid = f.pronamespace
      WHERE n.nspname = 'public' AND f.prosecdef
        AND has_function_privilege('anon', f.oid, 'EXECUTE')
    ) THEN 'WARN' ELSE 'PASS' END,
    'Review each anonymously executable SECURITY DEFINER function manually'
)
SELECT check_id, status, detail
FROM (SELECT * FROM table_checks UNION ALL SELECT * FROM other_checks) all_checks
ORDER BY CASE status WHEN 'BLOCK' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END, check_id;
