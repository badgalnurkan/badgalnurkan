begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('c00891c9-5710-4e3d-9971-6e8e418d765e','rls-security-fixture@example.invalid',now(),'{"username":"qa_rls_176965"}');
insert into auth.sessions(id,user_id) values ('522b94bf-39d3-46b5-8c58-239f101fe133','c00891c9-5710-4e3d-9971-6e8e418d765e');
select set_config('request.jwt.claims','{"sub":"c00891c9-5710-4e3d-9971-6e8e418d765e","role":"authenticated","session_id":"522b94bf-39d3-46b5-8c58-239f101fe133"}',true);
set local role authenticated;
do $test$
begin
 if exists(select 1 from public.user_data where user_id<>auth.uid()) then raise exception 'cross-user data visible'; end if;
 perform public.iydu_save('ignored','ignored','{"test_only":true}');
 if not exists(select 1 from public.user_data where user_id=auth.uid() and data->>'test_only'='true') then raise exception 'active own write failed'; end if;
 begin
  perform public.iydu_account_service('request_delete',auth.uid(),'{}');
  raise exception 'privileged RPC unexpectedly callable';
 exception when insufficient_privilege then null;
 end;
end $test$;
reset role;
update iydu_private.account_controls set state='deactivated' where user_id='c00891c9-5710-4e3d-9971-6e8e418d765e';
set local role authenticated;
do $test$
begin
 if exists(select 1 from public.user_data) then raise exception 'deactivated data visible'; end if;
 if exists(select 1 from public.profiles) then raise exception 'deactivated profile visible'; end if;
 begin
 perform public.iydu_load('');
 raise exception 'restricted loader returned data';
 exception when insufficient_privilege then null;
 end;
 begin
  perform public.iydu_save('ignored','ignored','{"should_never_save":true}');
  raise exception 'deactivated write succeeded';
 exception when insufficient_privilege then null;
 end;
end $test$;
reset role;
rollback;
select 'PASS: actual authenticated role can access only its own active data; inactive SELECT and writes denied; service RPC denied. All fixture changes rolled back.' as result;