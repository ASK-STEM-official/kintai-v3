-- supabase/migrations/0000_initial_schema.sql

-- 1. Tables

-- teams (班テーブル)
create table public.teams (
    id serial primary key,
    name character varying(255) not null,
    created_at timestamp with time zone default now() not null
);
comment on table public.teams is '班テーブル';

-- users (ユーザーテーブル)
create table public.users (
    id uuid references auth.users on delete cascade not null primary key,
    display_name character varying(255) not null unique,
    discord_id character varying(255) not null unique,
    generation integer not null,
    team_id integer references public.teams(id),
    role integer default 0 not null, -- 0: member, 1: admin
    card_id character varying(255) not null unique,
    is_active boolean default true not null,
    updated_at timestamp with time zone default now() not null,
    created_at timestamp with time zone default now() not null
);
comment on table public.users is 'ユーザーテーブル';

-- attendances (出退勤記録)
create table public.attendances (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.users(id) on delete cascade not null,
    type character varying(3) not null check (type in ('in', 'out')),
    timestamp timestamp with time zone default now() not null,
    date date default (now() at time zone 'utc')::date not null,
    created_at timestamp with time zone default now() not null
);
comment on table public.attendances is '出退勤記録';

-- announcements (お知らせ)
create table public.announcements (
    id uuid default gen_random_uuid() primary key,
    title character varying(255) not null,
    content text not null,
    author_id uuid references public.users(id),
    is_active boolean default true not null,
    is_current boolean default false not null,
    updated_at timestamp with time zone default now() not null,
    created_at timestamp with time zone default now() not null
);
comment on table public.announcements is 'お知らせ';
-- Constraint to ensure only one announcement is current
create unique index announcements_is_current_true_idx on public.announcements (is_current) where is_current = true;

-- user_edit_logs (ユーザー情報変更履歴)
create table public.user_edit_logs (
    id uuid default gen_random_uuid() primary key,
    target_user_id uuid references public.users(id) on delete cascade not null,
    editor_user_id uuid references public.users(id) on delete set null,
    field_name character varying(255) not null,
    old_value text,
    new_value text,
    created_at timestamp with time zone default now() not null
);
comment on table public.user_edit_logs is 'ユーザー情報変更履歴';

-- daily_logout_logs (全員退勤実行ログ)
create table public.daily_logout_logs (
    id uuid default gen_random_uuid() primary key,
    executed_at timestamp with time zone default now() not null,
    affected_count integer not null,
    status character varying(255) not null check (status in ('success', 'error'))
);
comment on table public.daily_logout_logs is '全員退勤実行ログ';

-- temp_registrations (仮登録テーブル)
create table public.temp_registrations (
    id uuid default gen_random_uuid() primary key,
    card_id character varying(255) not null unique,
    qr_token character varying(255) not null unique,
    expires_at timestamp with time zone not null,
    is_used boolean default false not null,
    accessed_at timestamp with time zone,
    created_at timestamp with time zone default now() not null
);
comment on table public.temp_registrations is '仮登録テーブル';


-- 2. Indexes

-- 出退勤データの高速集計用インデックス
create index idx_attendances_date_user on public.attendances (date, user_id);
create index idx_attendances_user_timestamp on public.attendances (user_id, timestamp);

-- カード認証用インデックス
-- unique constraints on users table already create indexes
-- create unique index idx_users_card_id on public.users (card_id);
-- create unique index idx_users_discord_id on public.users (discord_id);

-- 集計用インデックス
create index idx_users_team_generation on public.users (team_id, generation);

-- 仮登録管理用インデックス
create index idx_temp_registrations_qr_token on public.temp_registrations (qr_token);
create index idx_temp_registrations_expires on public.temp_registrations (expires_at);
create index idx_temp_registrations_accessed on public.temp_registrations (accessed_at);


-- 3. Materialized View

create materialized view public.daily_team_stats as
select
    a.date,
    u.team_id,
    u.generation,
    count(distinct case when a.type = 'in' then a.user_id end) as attendance_count
from attendances a
join users u on a.user_id = u.id
group by a.date, u.team_id, u.generation;

-- 4. RLS (Row Level Security) & Policies

alter table public.teams enable row level security;
alter table public.users enable row level security;
alter table public.attendances enable row level security;
alter table public.announcements enable row level security;
alter table public.user_edit_logs enable row level security;
alter table public.daily_logout_logs enable row level security;
alter table public.temp_registrations enable row level security;

-- Helper function to check user role
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select coalesce((select role from public.users where id = auth.uid()), 0) = 1;
$$;

-- Teams: Publicly readable
create policy "Allow all read access to teams" on public.teams for select using (true);
create policy "Allow admin to manage teams" on public.teams for all using (public.is_admin()) with check (public.is_admin());

-- Users:
create policy "Users can see their own data" on public.users for select using (auth.uid() = id);
create policy "Admins can see all users" on public.users for select using (public.is_admin());
create policy "Users can update their own data" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Admins can update any user" on public.users for update using (public.is_admin()) with check (public.is_admin());
-- New users are created via server-side logic, so no insert policy is needed for users directly.

-- Attendances:
create policy "Users can see their own attendance" on public.attendances for select using (auth.uid() = user_id);
create policy "Admins can see all attendance" on public.attendances for select using (public.is_admin());
create policy "Users can insert their own attendance" on public.attendances for insert with check (auth.uid() = user_id);
create policy "Admins can manage all attendance" on public.attendances for all using (public.is_admin()) with check (public.is_admin());

-- Announcements:
create policy "Allow all authenticated read access" on public.announcements for select using (auth.role() = 'authenticated');
create policy "Allow admin to manage announcements" on public.announcements for all using (public.is_admin()) with check (public.is_admin());

-- Logs & Temp tables: Admin or server-role access only. RLS will block client by default.
create policy "Allow admin to manage user edit logs" on public.user_edit_logs for all using (public.is_admin());
create policy "Allow admin to manage daily logout logs" on public.daily_logout_logs for all using (public.is_admin());
create policy "Allow all access to temp registrations" on public.temp_registrations for all using(true) with check(true); -- Public for registration flow

-- 5. Realtime Publication Setup
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.temp_registrations;
alter publication supabase_realtime add table public.announcements;

-- 6. Initial Data
-- Insert initial teams
insert into public.teams (name) values ('Web班'), ('AI班'), ('Game班'), ('Device班'), ('Design班');
