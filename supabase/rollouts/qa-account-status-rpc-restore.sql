-- QA ONLY: missing account status RPC blocked signups after successful OTP.
-- Equivalent function exists in production; this is a QA schema parity repair.
-- Existing account/private data is untouched; only the RPC is created.
CREATE OR REPLACE FUNCTION public.iydu_account_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public.iydu_account_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iydu_account_status() TO authenticated;
NOTIFY pgrst, 'reload schema';
