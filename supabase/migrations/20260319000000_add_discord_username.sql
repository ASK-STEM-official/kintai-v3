-- Discord の一意ユーザー名（旧 test#1234 の test 部分）を保存するカラムを追加
ALTER TABLE member.members ADD COLUMN IF NOT EXISTS discord_username TEXT;
