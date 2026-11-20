-- QA only. Provision the empty fixture once. The caller must select the QA project
-- and set iydu.qa_target locally in the transaction. No production rows or key material are imported.
do $guard$
begin
  if current_setting('iydu.qa_target', true) is distinct from 'lvomrcqytfygcmguojcj' then
    raise exception 'Select the QA project before preparing push checks';
  end if;
  if to_regclass('iydu_private.push_devices') is not null then
    raise exception 'Existing subscriptions schema: verify its version instead of replacing it';
  end if;
end;
$guard$;

create table iydu_private.push_devices (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  lang text not null,
  created_at timestamp with time zone default now() not null,
  constraint push_devices_endpoint_key UNIQUE (endpoint),
  constraint push_devices_pkey PRIMARY KEY (id),
  constraint push_devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint push_devices_lang_check CHECK ((lang = ANY (ARRAY['tr'::text, 'en'::text])))
);
alter table iydu_private.push_devices enable row level security;
revoke all on iydu_private.push_devices from public, anon, authenticated;

create table iydu_private.push_jobs (
  id bigint generated always as identity not null,
  device_id uuid not null,
  event text not null,
  kind text not null,
  queued_at timestamp with time zone default now() not null,
  lease uuid,
  retry_at timestamp with time zone default now() not null,
  attempts integer default 0 not null,
  done boolean default false not null,
  constraint push_jobs_device_id_event_key UNIQUE (device_id, event),
  constraint push_jobs_pkey PRIMARY KEY (id),
  constraint push_jobs_device_id_fkey FOREIGN KEY (device_id) REFERENCES iydu_private.push_devices(id) ON DELETE CASCADE
);
alter table iydu_private.push_jobs enable row level security;
revoke all on iydu_private.push_jobs from public, anon, authenticated;

create table iydu_private.push_keys (
  singleton boolean default true not null,
  public_key text not null,
  vault_id uuid not null,
  constraint push_keys_pkey PRIMARY KEY (singleton),
  constraint push_keys_singleton_check CHECK (singleton)
);
alter table iydu_private.push_keys enable row level security;
revoke all on iydu_private.push_keys from public, anon, authenticated;

create table iydu_private.push_tickets (
  id uuid default gen_random_uuid() not null,
  expires_at timestamp with time zone default (now() + '00:01:30'::interval) not null,
  constraint push_tickets_pkey PRIMARY KEY (id)
);
alter table iydu_private.push_tickets enable row level security;
revoke all on iydu_private.push_tickets from public, anon, authenticated;

CREATE INDEX iydu_push_owner ON iydu_private.push_devices USING btree (user_id);
CREATE INDEX iydu_push_waiting ON iydu_private.push_jobs USING btree (retry_at) WHERE (NOT done);

CREATE OR REPLACE FUNCTION public.iydu_claim_push(p_ticket uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 delete from iydu_private.push_tickets where id=p_ticket and expires_at>now();
 if not found then return null;end if;
 with ready as (select j.id from iydu_private.push_jobs j join iydu_private.push_devices d on d.id=j.device_id
  join iydu_private.account_controls c on c.user_id=d.user_id and c.state='active'
  where not j.done and j.retry_at<=now() and j.attempts<4 and j.queued_at>now()-interval '20 minutes' order by j.id limit 24 for update of j skip locked),
 jobs as (update iydu_private.push_jobs j set attempts=attempts+1,lease=gen_random_uuid(),retry_at=now()+interval '2 minutes' from ready where ready.id=j.id returning j.*)
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'event',j.event,'kind',j.kind,'uid',d.user_id,'endpoint',d.endpoint,'lang',d.lang,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth_key))),'[]'::jsonb)
 into result from jobs j join iydu_private.push_devices d on d.id=j.device_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.iydu_finish_push(p_id bigint, p_lease uuid, p_result integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare device uuid;
begin
 update iydu_private.push_jobs set done=p_result between 200 and 299 or p_result in(404,410) or attempts>=4,lease=null
 where id=p_id and lease=p_lease returning device_id into device;
 if p_result in(404,410) then delete from iydu_private.push_devices where id=device;end if;
end $function$;

CREATE OR REPLACE FUNCTION public.iydu_push_vapid(p_public text, p_private text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare k iydu_private.push_keys; secret text;
begin
 perform pg_advisory_xact_lock(18411761);
 select * into k from iydu_private.push_keys where singleton;
 if not found then
  if p_public !~ '^[A-Za-z0-9_-]{87}$' or p_private !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'Invalid key';end if;
  insert into iydu_private.push_keys(singleton,public_key,vault_id) values(true,p_public,vault.create_secret(p_private,'iydu-webpush-private')) returning * into k;
 end if;
 select decrypted_secret into strict secret from vault.decrypted_secrets where id=k.vault_id;
 return jsonb_build_object('publicKey',k.public_key,'privateKey',secret);
end $function$;

CREATE OR REPLACE FUNCTION public.iydu_set_push(p_endpoint text, p_keys jsonb, p_lang text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); e text:=p_endpoint;
begin
 if uid is null then raise exception 'Sign in required';end if;
 if p_keys is null then delete from iydu_private.push_devices where user_id=uid and endpoint=e;return true;end if;
 if not public.iydu_account_access_allowed() or length(e)>3072 or
 e !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*web\.push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/[^[:space:]]+$'
 or coalesce(p_keys->>'p256dh','') !~ '^[a-zA-Z0-9_-]{87}$' or coalesce(p_keys->>'auth','') !~ '^[a-zA-Z0-9_-]{22}$'
 or p_lang not in ('tr','en') then raise exception 'Invalid subscription';end if;
 if (select count(*) from iydu_private.push_devices where user_id=uid)>=12 and not exists(select 1 from iydu_private.push_devices where endpoint=e and user_id=uid) then raise exception 'Device limit';end if;
 insert into iydu_private.push_devices(user_id,endpoint,p256dh,auth_key,lang) values(uid,e,p_keys->>'p256dh',p_keys->>'auth',p_lang)
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth_key=excluded.auth_key,lang=excluded.lang where iydu_private.push_devices.user_id=uid;
 return found;
end $function$;

CREATE OR REPLACE FUNCTION iydu_private.push_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t timestamptz:=now(); local_now timestamp:=now() at time zone 'Europe/Istanbul'; ticket uuid;
begin
 delete from iydu_private.push_tickets where expires_at<t;
 if not exists(select 1 from iydu_private.push_devices) then return;end if;
 delete from iydu_private.push_jobs where queued_at<t-interval '3 days';
 with devices as (
  select d.id,d.created_at,coalesce(u.data,'{}'::jsonb) data from iydu_private.push_devices d join public.user_data u on u.user_id=d.user_id
  join iydu_private.account_controls c on c.user_id=d.user_id and c.state='active'
 ), events as (
  select d.id,x.kind,x.kind||':'||local_now::date||case when x.kind='tasks' then ':19' else '' end as event, (local_now::date+x.at) at time zone 'Europe/Istanbul' as due,d.created_at
  from devices d cross join (values ('morning',time '09:00','daily'),('study',time '14:00','study'),('tasks',time '19:00','tasks'),('evening',time '21:00','daily')) x(kind,at,pref)
  where coalesce(d.data->'notificationPrefs'->>x.pref,'true')<>'false'
  and (x.kind<>'tasks' or (d.data->>'day'=local_now::date::text and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(d.data->'tasks')='array' then d.data->'tasks' else '[]'::jsonb end) row_item where coalesce(row_item->>'s','') not in ('done','miss')))
   or jsonb_array_length(case when jsonb_typeof(d.data->'plans'->(local_now::date::text))='array' then d.data->'plans'->(local_now::date::text) else '[]'::jsonb end)>0)
  union all
  select d.id,'project','project:'||md5(coalesce(p->>'id',p->>'n','')||due.at::text),due.at,d.created_at
  from devices d cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data->'projects')='array' then d.data->'projects' else '[]'::jsonb end) p
  cross join lateral(select case when pg_input_is_valid(p->>'reminderAt','timestamptz') then (p->>'reminderAt')::timestamptz
   when p->>'d' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(p->>'d','date') then ((p->>'d')::date+time '09:00') at time zone 'Europe/Istanbul' end at) due
  where coalesce(p->>'reminderEnabled','true')<>'false' and coalesce(d.data->'notificationPrefs'->>'projects','true')<>'false'
  union all
  select d.id,x.kind,x.kind||':'||(d.data->'pomo'->>'end'),pt.ending+x.delta,d.created_at
  from devices d cross join lateral(select case when d.data->'pomo'->>'end' ~ '^[0-9]{10,14}$' then to_timestamp((d.data->'pomo'->>'end')::bigint/1000.0) end ending)pt
  cross join lateral(values ('pomo-five',interval '-5 minutes'),(case when d.data->'pomo'->>'ph'='w' then 'pomo-break' else 'pomo-focus' end,interval '0')) x(kind,delta)
  where d.data->'pomo'->>'run'='true' and coalesce(d.data->'notificationPrefs'->>'pomo','true')<>'false'
  and (x.kind<>'pomo-five' or (d.data->'pomo'->>'ph'='w' and coalesce(d.data->'pomo'->>'w','') ~ '^[0-9]{1,3}$' and (d.data->'pomo'->>'w')::int>5))
 )
 insert into iydu_private.push_jobs(device_id,event,kind)
 select id,event,kind from events where due<=t and due>t-interval '5 minutes' and due>=created_at on conflict(device_id,event) do nothing;
 if exists(select 1 from iydu_private.push_jobs where not done and retry_at<=t and attempts<4 and queued_at>t-interval '20 minutes') then
  insert into iydu_private.push_tickets default values returning id into ticket;
  perform net.http_post(url:='https://lvomrcqytfygcmguojcj.supabase.co/functions/v1/device-push',body:=jsonb_build_object('ticket',ticket),timeout_milliseconds:=25000);
 end if;
end $function$;

revoke all on function iydu_private.push_tick() from public, anon, authenticated, service_role;
revoke all on function public.iydu_claim_push(p_ticket uuid) from public, anon, authenticated, service_role;
grant execute on function public.iydu_claim_push(p_ticket uuid) to service_role;
revoke all on function public.iydu_finish_push(p_id bigint, p_lease uuid, p_result integer) from public, anon, authenticated, service_role;
grant execute on function public.iydu_finish_push(p_id bigint, p_lease uuid, p_result integer) to service_role;
revoke all on function public.iydu_push_vapid(p_public text, p_private text) from public, anon, authenticated, service_role;
grant execute on function public.iydu_push_vapid(p_public text, p_private text) to service_role;
revoke all on function public.iydu_set_push(p_endpoint text, p_keys jsonb, p_lang text) from public, anon, authenticated, service_role;
grant execute on function public.iydu_set_push(p_endpoint text, p_keys jsonb, p_lang text) to authenticated, service_role;

DO $schedule$
BEGIN
  IF current_setting('iydu.qa_target', true) IS DISTINCT FROM 'lvomrcqytfygcmguojcj'
     OR position('https://lvomrcqytfygcmguojcj.supabase.co/functions/v1/device-push'
                 IN pg_get_functiondef('iydu_private.push_tick()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Expected isolated QA device worker';
  END IF;
  PERFORM cron.schedule('iydu-qa-device-reminders', '* * * * *',
    'select iydu_private.push_tick() where exists (select 1 from iydu_private.push_devices)');
END
$schedule$;
