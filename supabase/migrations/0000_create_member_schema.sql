-- 既存テーブル削除（完全リセット用。運用時は必要に応じてバックアップ推奨）
DROP TABLE IF EXISTS member.generation_roles CASCADE;
DROP TABLE IF EXISTS member.team_leaders CASCADE;
DROP TABLE IF EXISTS member.member_team_relations CASCADE;
DROP TABLE IF EXISTS member.teams CASCADE;
DROP TABLE IF EXISTS member.members CASCADE;
DROP SCHEMA IF EXISTS member CASCADE;

-- スキーマ作成
CREATE SCHEMA IF NOT EXISTS member;

-- Grant usage to necessary roles
grant usage on schema member to postgres, anon, authenticated, service_role;

-- Set default grants for new tables in the member schema
alter default privileges in schema member grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema member grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema member grant all on sequences to postgres, anon, authenticated, service_role;


-- 部員テーブル（Supabase AuthユーザーIDがPK&FK、管理項目付き）
CREATE TABLE member.members (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    status INTEGER NOT NULL,                                     -- 区分（0=中等部, 1=高等部, 2=OB）
    generation INTEGER NOT NULL,                                 -- 期生
    student_number TEXT,                                         -- 学籍番号
    discord_id TEXT UNIQUE NOT NULL,                            -- Discord公式API/Bot用UID
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,                     -- 管理者フラグ
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,    -- 登録日時
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMPTZ                                       -- 論理削除
);

-- 班テーブル
CREATE TABLE member.teams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    discord_role_id TEXT
);

-- 部員⇔班の関係（多対多）
CREATE TABLE member.member_team_relations (
    member_id UUID NOT NULL REFERENCES member.members(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES member.teams(id) ON DELETE CASCADE,
    PRIMARY KEY (member_id) -- 1人1班制
);

-- 班長テーブル（複数班長対応。1班に複数人指定OK）
CREATE TABLE member.team_leaders (
    team_id INTEGER NOT NULL REFERENCES member.teams(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES member.members(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, member_id)
);

-- 期生⇔Discord Role対応テーブル
CREATE TABLE member.generation_roles (
    generation INTEGER PRIMARY KEY,           -- 期生番号
    discord_role_id TEXT NOT NULL UNIQUE
);

-- インデックス（検索高速化）
CREATE INDEX ON member.members(status);
CREATE INDEX ON member.members(discord_id);
CREATE INDEX ON member.members(is_admin);
CREATE INDEX ON member.teams(discord_role_id);
CREATE INDEX ON member.member_team_relations(member_id);
CREATE INDEX ON member.member_team_relations(team_id);
CREATE INDEX ON member.team_leaders(team_id);
CREATE INDEX ON member.team_leaders(member_id);
CREATE INDEX ON member.generation_roles(discord_role_id);

-- Enable RLS
alter table member.members enable row level security;
alter table member.teams enable row level security;
alter table member.member_team_relations enable row level security;
alter table member.team_leaders enable row level security;
alter table member.generation_roles enable row level security;

-- Policies for member.members
create policy "Allow all access to service_role" on member.members for all to service_role using (true) with check (true);
create policy "Allow read access to authenticated users" on member.members for select to authenticated using (true);
create policy "Allow user to update their own profile" on member.members for update to authenticated using (auth.uid() = id);

-- Policies for member.teams
create policy "Allow all access to service_role" on member.teams for all to service_role using (true) with check (true);
create policy "Allow read access to authenticated users" on member.teams for select to authenticated using (true);

-- Policies for member.member_team_relations
create policy "Allow all access to service_role" on member.member_team_relations for all to service_role using (true) with check (true);
create policy "Allow read access to authenticated users" on member.member_team_relations for select to authenticated using (true);

-- Policies for other tables (assuming less frequent access, admin only)
create policy "Allow all access to service_role on team_leaders" on member.team_leaders for all to service_role using (true) with check (true);
create policy "Allow all access to service_role on generation_roles" on member.generation_roles for all to service_role using (true) with check (true);
