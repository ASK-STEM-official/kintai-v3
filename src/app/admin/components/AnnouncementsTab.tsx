-- Create the attendance schema
create schema if not exists attendance;

-- Grant usage to necessary roles
grant usage on schema attendance to postgres, anon, authenticated, service_role;

-- Set default grants for new tables in the attendance schema
alter default privileges in schema attendance grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema attendance grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema attendance grant all on sequences to postgres, anon, authenticated, service_role;

--
-- attendance.users TABLE
--
create table attendance.users (
    id uuid not null default gen_random_uuid() primary key,
    user_id uuid not null unique references member.members(supabase_auth_user_id) on delete cascade,
    card_id character varying not null unique,
    created_at timestamp with time zone not null default now(),
    updated_at timestamp with time zone not null default now()
);
alter table attendance.users enable row level security;
create policy "Allow all access to service_role" on attendance.users for all to service_role using (true) with check (true);
create policy "Allow read access to authenticated users" on attendance.users for select to authenticated using (true);


--
-- attendance.attendances TABLE
--
create table attendance.attendances (
    id uuid not null default gen_random_uuid() primary key,
    user_id uuid not null references attendance.users (id) on delete cascade,
    "type" character varying not null,
    "timestamp" timestamp with time zone not null default now(),
    date date not null default (now() at time zone 'utc'::text),
    created_at timestamp with time zone not null default now()
);
alter table attendance.attendances enable row level security;
create index idx_attendances_date_user on attendance.attendances using btree (date, user_id);
create index idx_attendances_user_timestamp on attendance.attendances using btree (user_id, "timestamp");
create policy "Allow all access to service_role" on attendance.attendances for all to service_role using (true) with check (true);
create policy "Allow read access to user for their own records" on attendance.attendances for select to authenticated using ((select user_id from attendance.users where id = attendances.user_id) = auth.uid());


--
-- attendance.temp_registrations TABLE
--
create table attendance.temp_registrations (
    id uuid not null default gen_random_uuid() primary key,
    card_id character varying not null,
    qr_token character varying not null,
    expires_at timestamp with time zone not null,
    is_used boolean not null default false,
    accessed_at timestamp with time zone,
    created_at timestamp with time zone not null default now()
);
alter table attendance.temp_registrations enable row level security;
create unique index temp_registrations_card_id on attendance.temp_registrations using btree (card_id, is_used, expires_at);
create unique index temp_registrations_qr_token_key on attendance.temp_registrations using btree (qr_token);
create index idx_temp_registrations_expires on attendance.temp_registrations using btree (expires_at);
create policy "Allow all access to service_role" on attendance.temp_registrations for all to service_role using (true) with check (true);
create policy "Allow read access for all users" on attendance.temp_registrations for select using (true);


--
-- attendance.user_edit_logs TABLE
--
create table attendance.user_edit_logs (
    id uuid not null default gen_random_uuid() primary key,
    target_user_id uuid not null references member.members(supabase_auth_user_id) on delete cascade,
    editor_user_id uuid references member.members(supabase_auth_user_id) on delete set null,
    field_name character varying not null,
    old_value text,
    new_value text,
    created_at timestamp with time zone not null default now()
);
alter table attendance.user_edit_logs enable row level security;
create policy "Allow all access to service_role" on attendance.user_edit_logs for all to service_role using (true) with check (true);


--
-- attendance.daily_logout_logs TABLE
--
create table attendance.daily_logout_logs (
    id uuid not null default gen_random_uuid() primary key,
    executed_at timestamp with time zone not null default now(),
    affected_count integer not null,
    status character varying not null
);
alter table attendance.daily_logout_logs enable row level security;
create policy "Allow all access to service_role" on attendance.daily_logout_logs for all to service_role using (true) with check (true);