-- Dedicated disposable Supabase stack used by CI, before the historical migrations.
create table public.profiles(id uuid primary key references auth.users);
create table public.iydu_usernames(user_id uuid primary key references auth.users,username text not null unique);
create table public.user_data(user_id uuid primary key references auth.users,data jsonb not null default '{}',updated_at timestamptz not null default now());
alter table public.user_data enable row level security;
alter table public.iydu_usernames enable row level security;
alter table public.profiles enable row level security;
grant select,insert,update on public.user_data to authenticated;
create policy own on public.user_data to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create function public.delete_my_account() returns void language sql as $$select null::void$$;
create function public.handle_new_user() returns trigger language plpgsql as $$begin return new;end$$;
