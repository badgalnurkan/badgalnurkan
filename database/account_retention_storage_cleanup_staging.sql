-- Staged supplement for PR #29. Apply only after account_retention_30_60_staging.sql.
-- TEST PROJECT ONLY until the release checklist has been completed.
-- SQL is read-only with respect to Storage; actual file deletion happens via the Storage API.
-- Assumption: per-user Storage files have a reliable owner_id. Unknown ownership blocks purging.
begin;

create or replace function public.iydu_due_storage_objects(p_limit integer default 50)
returns table(user_id uuid, bucket_id text, object_name text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise insufficient_privilege;
  end if;

  return query
  select c.user_id, o.bucket_id, o.name
  from iydu_private.account_controls as c
  join storage.objects as o on o.owner_id = c.user_id::text
  where c.state in ('deactivated', 'pending_delete')
    and c.delete_after is not null
    and c.delete_after <= now()
    and o.name is not null
    and o.name <> ''
    and coalesce(o.is_versioned, false) = false
    and coalesce(o.is_delete_marker, false) = false
    -- A path shared with another owner or versioned path must never be bulk-deleted.
    and not exists (
      select 1 from storage.objects as other
      where other.bucket_id = o.bucket_id and other.name = o.name
        and (other.owner_id is distinct from c.user_id::text
          or coalesce(other.is_versioned,false)
          or coalesce(other.is_delete_marker,false))
    )
  group by c.user_id, c.delete_after, o.bucket_id, o.name
  order by c.delete_after, o.bucket_id, o.name
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$function$;

-- Explicit privileges are essential because SECURITY DEFINER otherwise
-- inherits PUBLIC EXECUTE on newly-created functions.
revoke execute on function public.iydu_due_storage_objects(integer)
  from public, anon, authenticated;
grant execute on function public.iydu_due_storage_objects(integer) to service_role;

-- Optional secure cron authentication when Edge Secrets are not provisioned.
-- Only the service role may ask whether a supplied token matches the Vault secret.
-- The secret itself is never returned from this RPC.
create or replace function public.iydu_retention_token_valid(p_token text)
returns boolean language plpgsql security definer set search_path=''
as $function$
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise insufficient_privilege; end if;
 return length(coalesce(p_token,'')) >= 32 and exists(
  select 1 from vault.decrypted_secrets
  where name='iydu_retention_cron_secret' and decrypted_secret=p_token
 );
end $function$;
revoke execute on function public.iydu_retention_token_valid(text)
  from public, anon, authenticated;
grant execute on function public.iydu_retention_token_valid(text) to service_role;

commit;

-- Only after deploying and smoke-testing the separately authenticated Edge Function,
-- provision its `RETENTION_CRON_SECRET` in Supabase Edge Secrets and Vault.
-- Then manually schedule a DISTINCT pg_cron -> pg_net invocation of the function.
-- Do not replace or disable iydu-account-deletion: it still verifies Storage is empty.
-- Never embed credentials in this SQL, GitHub or a web client.
