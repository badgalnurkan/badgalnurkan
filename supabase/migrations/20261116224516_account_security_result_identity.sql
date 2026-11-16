create or replace function public.iydu_account_service(p_action text,p_uid uuid,p_fields jsonb default '{}'::jsonb) returns jsonb
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
 return (select jsonb_build_object('ok',true,'user_id',user_id,'state',state,'delete_after',delete_after) from iydu_private.account_controls where user_id=p_uid);
end $$;
revoke all on function public.iydu_account_service(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.iydu_account_service(text,uuid,jsonb) to service_role;

