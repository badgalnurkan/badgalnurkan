-- Isolated, disposable database. Never run this fixture against an application database.
create role authenticated;
create role anon;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
create function public.iydu_account_access_allowed() returns boolean language sql stable as $$select current_setting('fixture.active',true)::boolean$$;
create function public.iydu_browser_session_allowed() returns boolean language sql stable as $$select current_setting('fixture.verified',true)::boolean$$;
create table public.user_data(user_id uuid primary key, data jsonb, updated_at timestamptz);
alter table public.user_data enable row level security;
create policy own on public.user_data to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
grant usage on schema auth to authenticated;
grant select,insert,update on public.user_data to authenticated;
\ir ../supabase/migrations/20261124163000_offline_profile_sync.sql
do $$begin
 if has_function_privilege('anon','public.iydu_sync_profile(jsonb,jsonb)','execute') then raise exception 'unexpected anonymous access';end if;
end$$;
set role authenticated;
set fixture.uid='00000000-0000-4000-8000-000000000001';
set fixture.active='true';
do $$
declare uid text:=auth.uid()::text; first_doc jsonb:=jsonb_build_object('authUid',uid,'note','first');
 second_doc jsonb:=first_doc||'{"note":"second"}'; old_doc jsonb;
begin
 begin perform public.iydu_sync_profile('{}',first_doc);raise exception 'missing verification permitted';exception when insufficient_privilege then null;end;
 perform set_config('fixture.verified','true',true);
 begin perform public.iydu_sync_profile('{}','{"authUid":"other"}');raise exception 'wrong owner permitted';exception when invalid_parameter_value then null;end;
 perform public.iydu_save('','','{"legacy":true}');
 if not public.iydu_sync_profile('{"legacy":true}',first_doc) then raise exception 'legacy data not accepted';end if;
 select data into old_doc from public.user_data;
 if not (old_doc ? 'iyduSyncVersion') then raise exception 'missing revision';end if;
 if public.iydu_sync_profile('{}',second_doc) then raise exception 'stale create overwrote a row';end if;
 if not public.iydu_sync_profile(first_doc,second_doc) then raise exception 'CAS failed';end if;
 if public.iydu_sync_profile(first_doc,first_doc) then raise exception 'stale CAS overwrote current doc';end if;
 begin perform public.iydu_save('','',old_doc);raise exception 'stale legacy write succeeded';exception when serialization_failure then null;end;
 select data into old_doc from public.user_data;
 perform public.iydu_save('','',old_doc||'{"legacyNew":true}');
 begin perform public.iydu_save('','',old_doc);raise exception 'legacy revision reused';exception when serialization_failure then null;end;
 if (select data->>'note' from public.user_data)<>'second' then raise exception 'first account corrupted';end if;
 perform set_config('fixture.uid','00000000-0000-4000-8000-000000000002',true);
 if exists(select from public.user_data) then raise exception 'foreign account visible';end if;
 if not public.iydu_sync_profile('{}',jsonb_build_object('authUid',auth.uid())) then raise exception 'new account insert failed';end if;
 perform set_config('fixture.active','false',true);
 begin perform public.iydu_save('','','{}');raise exception 'inactive account permitted';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin if (select count(*) from public.user_data)<>2 then raise exception 'profile count changed unexpectedly';end if;end$$;
