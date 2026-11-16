begin;
do $test$
declare
 uid uuid=gen_random_uuid(); sid uuid=gen_random_uuid(); cid uuid=gen_random_uuid();
 r jsonb; v integer;
begin
 insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data)
 values(uid,'security-check-'||uid||'@example.invalid',now(),'test-hash-only',jsonb_build_object('username','qa_'||left(replace(uid::text,'-',''),12)));
 insert into auth.sessions(id,user_id) values(sid,uid);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
 if not public.iydu_account_access_allowed() then raise exception 'active account denied'; end if;
 if (public.iydu_account_status()->>'user_id')::uuid<>uid then raise exception 'wrong status owner'; end if;
 update iydu_private.account_controls set password_changed_at=now()-interval '90 days' where user_id=uid;
 if public.iydu_account_access_allowed() then raise exception 'expired password allowed'; end if;
 update auth.users set encrypted_password='new-test-hash-only' where id=uid;
 if not public.iydu_account_access_allowed() then raise exception 'password trigger failed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid)::text,true);
 r=public.iydu_account_service('request_deactivate',uid,jsonb_build_object('id',cid,'hash',repeat('a',64)));
 if r->>'ok'<>'true' then raise exception 'challenge creation failed: %',r; end if;
 r=public.iydu_account_service('confirm_deactivate',uid,jsonb_build_object('id',cid,'hash',repeat('b',64)));
 if r->>'error'<>'INVALID_CHALLENGE' then raise exception 'bad code accepted'; end if;
 select attempts into v from iydu_private.account_challenges where id=cid;
 if v<>1 then raise exception 'failed attempt was not counted'; end if;
 r=public.iydu_account_service('confirm_deactivate',uid,jsonb_build_object('id',cid,'hash',repeat('a',64)));
 if r->>'state'<>'deactivated' then raise exception 'deactivation failed'; end if;
 if exists(select 1 from auth.sessions where user_id=uid) then raise exception 'session not revoked'; end if;
 r=public.iydu_account_service('confirm_deactivate',uid,jsonb_build_object('id',cid,'hash',repeat('a',64)));
 if r->>'error'<>'INVALID_CHALLENGE' then raise exception 'replay accepted'; end if;
 -- New interactive login; reactivation still requires a separate email challenge.
 insert into auth.sessions(id,user_id) values(sid,uid);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated','session_id',sid)::text,true);
 if public.iydu_account_access_allowed() then raise exception 'inactive account allowed'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','service_role','session_id',sid)::text,true);
 update iydu_private.account_challenges set created_at=now()-interval '2 minutes' where user_id=uid;
 cid=gen_random_uuid();
 r=public.iydu_account_service('request_reactivate',uid,jsonb_build_object('id',cid,'hash',repeat('c',64)));
 r=public.iydu_account_service('confirm_reactivate',uid,jsonb_build_object('id',cid,'hash',repeat('c',64)));
 if r->>'state'<>'active' then raise exception 'reactivation failed'; end if;
 update iydu_private.account_challenges set created_at=now()-interval '2 minutes' where user_id=uid;
 cid=gen_random_uuid();
 r=public.iydu_account_service('request_delete',uid,jsonb_build_object('id',cid,'hash',repeat('d',64)));
 r=public.iydu_account_service('confirm_delete',null,jsonb_build_object('id',cid,'hash',repeat('d',64),'reason','privacy'));
 if r->>'error'<>'CONFIRMATION_REQUIRED' then raise exception 'missing explicit confirmation accepted'; end if;
 r=public.iydu_account_service('confirm_delete',null,jsonb_build_object('id',cid,'hash',repeat('d',64),'reason','other','other','Test only','confirmation','YES_DELETE_IN_30_DAYS'));
 if r->>'state'<>'pending_delete' or (r->>'delete_after')::timestamptz<>now()+interval '30 days' then raise exception '30-day deadline failed'; end if;
 if (r->>'user_id')::uuid<>uid then raise exception 'result identity missing'; end if;
 -- Neither wrong identity nor post-deadline reactivation may succeed.
 update iydu_private.account_controls set delete_after=now()-interval '1 second' where user_id=uid;
 update iydu_private.account_challenges set created_at=now()-interval '2 minutes' where user_id=uid;
 r=public.iydu_account_service('request_reactivate',uid,jsonb_build_object('id',gen_random_uuid(),'hash',repeat('e',64)));
 if r->>'error'<>'DELETION_DUE' then raise exception 'expired account reactivation accepted'; end if;
 if exists(select 1 from iydu_private.account_controls where user_id<>uid and state='pending_delete' and delete_after<=now()) then raise exception 'refusing purge test with existing due accounts'; end if;
 v=iydu_private.purge_due_accounts();
 if v<>1 or exists(select 1 from auth.users where id=uid) then raise exception 'due purge failed'; end if;
 if has_function_privilege('authenticated','public.iydu_account_service(text,uuid,jsonb)','EXECUTE') then raise exception 'service RPC exposed'; end if;
 if has_function_privilege('authenticated','public.delete_my_account()','EXECUTE') then raise exception 'legacy bypass exposed'; end if;
end $test$;
rollback;
select 'PASS: active/expired password, password trigger, OTP attempts, deactivation, session revocation, replay, reactivation, explicit deletion consent, 30-day deadline, expiry, purge and permissions. Synthetic fixture rolled back.' as result;