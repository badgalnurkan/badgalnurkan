create or replace function public.iydu_load(p_username text) returns table(data jsonb)
language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not authenticated' using errcode='28000'; end if;
 if not public.iydu_account_access_allowed() then raise exception 'account access restricted' using errcode='42501'; end if;
 return query select ud.data from public.user_data ud where ud.user_id=auth.uid() limit 1;
end $$;