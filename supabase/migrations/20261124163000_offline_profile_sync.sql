-- No existing profile is rewritten during deployment. The revision protects a synchronized
-- profile against a stale full-document write from an older, already-open client.
create or replace function public.iydu_sync_profile(p_expected_data jsonb,p_data jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare
  uid uuid := auth.uid();
  body jsonb;
begin
  if uid is null or public.iydu_account_access_allowed() is not true or public.iydu_browser_session_allowed() is not true then
    raise exception 'Verified account required' using errcode='42501';
  end if;
  if jsonb_typeof(p_expected_data) is distinct from 'object' or jsonb_typeof(p_data) is distinct from 'object'
     or p_data->>'authUid' is distinct from uid::text then
    raise exception 'Invalid profile identity' using errcode='22023';
  end if;
  body := (p_data-'iyduSyncVersion') || jsonb_build_object('iyduSyncVersion',gen_random_uuid());
  if (p_expected_data-'iyduSyncVersion')='{}'::jsonb then
    insert into public.user_data(user_id,data,updated_at) values(uid,body,now())
    on conflict(user_id) do nothing;
    if found then return true; end if;
  end if;
  update public.user_data set data=body,updated_at=now()
    where user_id=uid and (coalesce(data,'{}'::jsonb)-'iyduSyncVersion')=(p_expected_data-'iyduSyncVersion');
  return found;
end $$;
revoke all on function public.iydu_sync_profile(jsonb,jsonb) from public,anon;
grant execute on function public.iydu_sync_profile(jsonb,jsonb) to authenticated;

create or replace function public.iydu_save(p_username text,p_nick text,p_data jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or public.iydu_account_access_allowed() is not true or public.iydu_browser_session_allowed() is not true then
    raise exception 'Verified account required' using errcode='42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or (p_data->>'authUid' is not null and p_data->>'authUid'<>uid::text) then
    raise exception 'Invalid user data' using errcode='22023';
  end if;
  insert into public.user_data(user_id,data,updated_at) values(uid,p_data,now())
  on conflict(user_id) do update set data=case
    when excluded.data ? 'iyduSyncVersion' then excluded.data || jsonb_build_object('iyduSyncVersion',gen_random_uuid())
    else excluded.data end,updated_at=now()
    where public.user_data.data->>'iyduSyncVersion' is not distinct from excluded.data->>'iyduSyncVersion';
  if not found then raise exception 'Profile changed on another device. Refresh to synchronize.' using errcode='40001';end if;
end $$;
