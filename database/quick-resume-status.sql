-- Authoritative 30-minute window for an existing Google login.
-- PostgREST verifies signatures before auth.jwt() reaches this function.
-- Token refreshes and editable user_metadata do not restart the window.
create or replace function public.iydu_quick_resume_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with claims as (
    select auth.jwt() as value, auth.uid() as user_id,
      pg_catalog.statement_timestamp() as checked_at
  ), authenticated_at as (
    select max(case
      when item->>'method' = 'oauth'
        and item->>'timestamp' ~ '^[0-9]{1,12}$'
      then pg_catalog.to_timestamp((item->>'timestamp')::double precision)
      else null
    end) as oauth_at
    from claims,
      lateral pg_catalog.jsonb_array_elements(case
        when pg_catalog.jsonb_typeof(value->'amr') = 'array' then value->'amr'
        else '[]'::jsonb
      end) as item
  )
  select pg_catalog.jsonb_build_object(
    'allowed', coalesce(
      user_id is not null
      and value->>'role' = 'authenticated'
      and nullif(value->>'session_id','') is not null
      and oauth_at <= checked_at
      and checked_at < oauth_at + interval '30 minutes', false),
    'expires_at', oauth_at + interval '30 minutes',
    'remaining_seconds', case when oauth_at is null then 0 else
      greatest(0, floor(extract(epoch from
        (oauth_at + interval '30 minutes' - checked_at))))::integer end
  )
  from claims cross join authenticated_at;
$function$;
revoke all on function public.iydu_quick_resume_status() from public, anon;
grant execute on function public.iydu_quick_resume_status() to authenticated;
comment on function public.iydu_quick_resume_status() is
  'Google quick-return decision from signed OAuth AMR time and database clock; no user records are read or written.';
