-- Account lifecycle v1. All timestamps and authorization are enforced on the server.
create schema if not exists iydu_private;
revoke all on schema iydu_private from public, anon, authenticated;
create table iydu_private.account_controls (
 user_id uuid primary key references auth.users(id) on delete cascade,
 state text not null default 'active' check(state in ('active','deactivated','pending_delete')),
 password_changed_at timestamptz not null default now(),
 delete_after timestamptz,
 reason text,
 reason_other text,
 updated_at timestamptz not null default now(),
 check ((state='pending_delete')=(delete_after is not null))
);
create index account_controls_due on iydu_private.account_controls(delete_after) where state='pending_delete';
create table iydu_private.account_challenges (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('deactivate','delete','reactivate')),
 email text not null,
 secret_hash text not null,
 attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 used_at timestamptz
);
create index account_challenges_user_time on iydu_private.account_challenges(user_id,created_at desc);
alter table iydu_private.account_controls enable row level security;
alter table iydu_private.account_challenges enable row level security;
revoke all on all tables in schema iydu_private from public,anon,authenticated;
-- Existing passwords get a 90-day rollout window; no invented historic password dates.
insert into iydu_private.account_controls(user_id) select id from auth.users on conflict do nothing;

create function iydu_private.track_auth_security() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  insert into iydu_private.account_controls(user_id) values(new.id) on conflict do nothing;
 else
  if new.encrypted_password is distinct from old.encrypted_password then
   update iydu_private.account_controls set password_changed_at=now(),updated_at=now() where user_id=new.id;
  end if;
  if new.email is distinct from old.email then
   update iydu_private.account_challenges set used_at=now() where user_id=new.id and used_at is null;
  end if;
 end if;
 return new;
end $$;
revoke all on function iydu_private.track_auth_security() from public,anon,authenticated;
create trigger iydu_account_created after insert on auth.users for each row execute function iydu_private.track_auth_security();
create trigger iydu_account_auth_changed after update of encrypted_password,email on auth.users for each row execute function iydu_private.track_auth_security();

create function public.iydu_account_access_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((
 select c.state='active'
 and (coalesce(u.encrypted_password,'')='' or statement_timestamp()<c.password_changed_at+interval '90 days')
 and exists(select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')
 from iydu_private.account_controls c join auth.users u on u.id=c.user_id
 where c.user_id=(select auth.uid())
 ),false)
$$;
revoke all on function public.iydu_account_access_allowed() from public,anon;
grant execute on function public.iydu_account_access_allowed() to authenticated;
create function public.iydu_account_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'user_id',u.id,'email',u.email,'email_verified',u.email_confirmed_at is not null,
 'pending_email',nullif(u.email_change,''),'state',c.state,'delete_after',c.delete_after,
 'has_password',coalesce(u.encrypted_password,'')<>'',
 'password_changed_at',c.password_changed_at,
 'password_due_at',case when coalesce(u.encrypted_password,'')<>'' then c.password_changed_at+interval '90 days' else null end,
 'password_required',coalesce(u.encrypted_password,'')<>'' and statement_timestamp()>=c.password_changed_at+interval '90 days',
 'server_time',statement_timestamp()
 )
 from iydu_private.account_controls c join auth.users u on u.id=c.user_id
 where u.id=(select auth.uid())
 and exists(select 1 from auth.sessions s where s.user_id=u.id and s.id::text=auth.jwt()->>'session_id')
$$;
revoke all on function public.iydu_account_status() from public,anon;
grant execute on function public.iydu_account_status() to authenticated;
create policy account_lifecycle_profiles on public.profiles as restrictive for all to authenticated
 using(id=(select auth.uid()) and (select public.iydu_account_access_allowed()))
 with check(id=(select auth.uid()) and (select public.iydu_account_access_allowed()));
create policy account_lifecycle_data on public.user_data as restrictive for all to authenticated
 using(user_id=(select auth.uid()) and (select public.iydu_account_access_allowed()))
 with check(user_id=(select auth.uid()) and (select public.iydu_account_access_allowed()));
create policy account_lifecycle_names on public.iydu_usernames as restrictive for all to authenticated
 using(user_id=(select auth.uid()) and (select public.iydu_account_access_allowed()))
 with check(user_id=(select auth.uid()) and (select public.iydu_account_access_allowed()));
-- Remove the old immediate-delete bypass. Lifecycle challenges are now the only route.
revoke all on function public.delete_my_account() from public,anon,authenticated;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create function public.iydu_account_service(p_action text,p_uid uuid,p_fields jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 c iydu_private.account_controls%rowtype;
 ch iydu_private.account_challenges%rowtype;
 mail text;
 confirmed boolean;
 k text;
 cid uuid;
 why text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise insufficient_privilege; end if;
 if p_action='confirm_delete' then
  select user_id into p_uid from iydu_private.account_challenges where id=(p_fields->>'id')::uuid and kind='delete';
 end if;
 if p_uid is null then return jsonb_build_object('error','INVALID_CHALLENGE'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_uid::text,0));
 select * into c from iydu_private.account_controls where user_id=p_uid for update;
 if not found then return jsonb_build_object('error','ACCOUNT_NOT_FOUND'); end if;
 select email,email_confirmed_at is not null into mail,confirmed from auth.users where id=p_uid;
 if p_action like 'request_%' then
  k=substring(p_action from 9);
  if k not in ('deactivate','delete','reactivate') then return jsonb_build_object('error','INVALID_ACTION'); end if;
  if not confirmed then return jsonb_build_object('error','EMAIL_NOT_VERIFIED'); end if;
  if c.state='pending_delete' and c.delete_after<=now() then return jsonb_build_object('error','DELETION_DUE'); end if;
  if (k='reactivate' and c.state='active') or (k<>'reactivate' and c.state<>'active') then return jsonb_build_object('error','INVALID_STATE'); end if;
  if exists(select 1 from iydu_private.account_challenges where user_id=p_uid and created_at>now()-interval '60 seconds')
   or (select count(*) from iydu_private.account_challenges where user_id=p_uid and created_at>now()-interval '1 hour')>=5
   then return jsonb_build_object('error','RATE_LIMITED'); end if;
  if coalesce(p_fields->>'hash','')!~'^[a-f0-9]{64}$' then return jsonb_build_object('error','INVALID_CHALLENGE'); end if;
  update iydu_private.account_challenges set used_at=now() where user_id=p_uid and used_at is null;
  cid=(p_fields->>'id')::uuid;
  insert into iydu_private.account_challenges(id,user_id,kind,email,secret_hash,expires_at)
  values(cid,p_uid,k,mail,p_fields->>'hash',now()+case when k='delete' then interval '30 minutes' else interval '10 minutes' end);
  return jsonb_build_object('ok',true,'id',cid,'email',mail);
 end if;
 if p_action='cancel' then
  update iydu_private.account_challenges set used_at=now() where id=(p_fields->>'id')::uuid and user_id=p_uid;
  return jsonb_build_object('ok',true);
 end if;
 k=case p_action when 'confirm_delete' then 'delete' when 'confirm_deactivate' then 'deactivate' when 'confirm_reactivate' then 'reactivate' else '' end;
 select * into ch from iydu_private.account_challenges where id=(p_fields->>'id')::uuid and user_id=p_uid and kind=k for update;
 if not found or ch.used_at is not null or ch.expires_at<=now() or ch.attempts>=5 or ch.email is distinct from mail then
  return jsonb_build_object('error','INVALID_CHALLENGE');
 end if;
 update iydu_private.account_challenges set attempts=attempts+1 where id=ch.id;
 if ch.secret_hash is distinct from p_fields->>'hash' then return jsonb_build_object('error','INVALID_CHALLENGE'); end if;
 if c.state='pending_delete' and c.delete_after<=now() then return jsonb_build_object('error','DELETION_DUE'); end if;
 if k='delete' then
  why=p_fields->>'reason';
  if c.state<>'active' then return jsonb_build_object('error','INVALID_STATE'); end if;
  if p_fields->>'confirmation' is distinct from 'YES_DELETE_IN_30_DAYS'
   or why is null or why not in ('break','not_useful','hard_to_use','technical','privacy','emails','another_account','other')
   or (why='other' and length(btrim(coalesce(p_fields->>'other','')))=0)
   or length(coalesce(p_fields->>'other',''))>1000 then return jsonb_build_object('error','CONFIRMATION_REQUIRED'); end if;
  update iydu_private.account_controls set state='pending_delete',delete_after=now()+interval '30 days',
    reason=why,reason_other=case when why='other' then btrim(p_fields->>'other') else null end,updated_at=now() where user_id=p_uid;
 elsif k='deactivate' then
  if c.state<>'active' then return jsonb_build_object('error','INVALID_STATE'); end if;
  update iydu_private.account_controls set state='deactivated',delete_after=null,updated_at=now() where user_id=p_uid;
 elsif k='reactivate' then
  if c.state='active' then return jsonb_build_object('error','INVALID_STATE'); end if;
  update iydu_private.account_controls set state='active',delete_after=null,reason=null,reason_other=null,updated_at=now() where user_id=p_uid;
 else return jsonb_build_object('error','INVALID_ACTION');
 end if;
 update iydu_private.account_challenges set used_at=now() where user_id=p_uid and used_at is null;
 -- Revoke refresh tokens and block still-issued JWTs using session existence in RLS.
 if k<>'reactivate' then delete from auth.sessions where user_id=p_uid; end if;
 return (select jsonb_build_object('ok',true,'state',state,'delete_after',delete_after) from iydu_private.account_controls where user_id=p_uid);
end $$;
revoke all on function public.iydu_account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.iydu_account_service(text,uuid,jsonb) to service_role;

-- The application has no Storage uploads. If owned objects appear later, fail closed
-- and retain the account for remediation instead of leaving orphaned objects.
create function iydu_private.purge_due_accounts() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; n integer=0;
begin
 for r in select user_id from iydu_private.account_controls
  where state='pending_delete' and delete_after<=now() order by delete_after limit 100 for update skip locked
 loop
  if not exists(select 1 from storage.objects where owner_id=r.user_id::text) then
   delete from auth.users where id=r.user_id;
   n=n+1;
  end if;
 end loop;
 delete from iydu_private.account_challenges where created_at<now()-interval '7 days';
 return n;
end $$;
revoke all on function iydu_private.purge_due_accounts() from public,anon,authenticated,service_role;
create extension if not exists pg_cron;
select cron.schedule('iydu-account-deletion','*/15 * * * *','select iydu_private.purge_due_accounts();');
