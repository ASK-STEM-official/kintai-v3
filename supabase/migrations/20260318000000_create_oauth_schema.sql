-- OAuth 2.0 Schema for STEM-system
-- 複数クライアントアプリケーションからのOAuth認証をサポート

-- oauth スキーマ作成
CREATE SCHEMA IF NOT EXISTS oauth;

-- OAuth クライアントアプリケーション
-- 管理者が登録するクライアントアプリ（kintai-v3など）
CREATE TABLE oauth.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                    -- アプリ名（例: "Kintai System"）
  client_id TEXT UNIQUE NOT NULL,        -- ランダム生成されたクライアントID
  client_secret_hash TEXT NOT NULL,      -- bcrypt ハッシュ化されたシークレット
  redirect_uris TEXT[] NOT NULL,         -- 許可されたリダイレクトURI配列
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 作成者（管理者）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 認可コード（短命、10分で期限切れ）
-- Authorization Code Flowで使用される一時的なコード
CREATE TABLE oauth.authorization_codes (
  code TEXT PRIMARY KEY,                 -- ランダム生成されたコード
  application_id UUID NOT NULL REFERENCES oauth.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,            -- コード発行時のリダイレクトURI
  code_challenge TEXT,                   -- PKCE用のチャレンジ
  code_challenge_method TEXT,            -- PKCE メソッド（"S256"）
  scope TEXT NOT NULL DEFAULT 'openid profile',
  expires_at TIMESTAMPTZ NOT NULL,       -- 10分後に設定
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ユーザーの連携承認記録
-- ユーザーがどのアプリを承認したかを記録
CREATE TABLE oauth.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES oauth.applications(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, application_id)        -- 1ユーザー1アプリ1承認
);

-- インデックス（パフォーマンス最適化）
CREATE INDEX idx_auth_codes_expires ON oauth.authorization_codes(expires_at);
CREATE INDEX idx_auth_codes_user ON oauth.authorization_codes(user_id);
CREATE INDEX idx_auth_codes_app ON oauth.authorization_codes(application_id);
CREATE INDEX idx_user_consents_user ON oauth.user_consents(user_id);
CREATE INDEX idx_user_consents_app ON oauth.user_consents(application_id);
CREATE INDEX idx_applications_client_id ON oauth.applications(client_id);

-- RLS (Row Level Security) 有効化
ALTER TABLE oauth.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth.authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth.user_consents ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: oauth.applications
-- 管理者のみがアプリケーションを管理できる
CREATE POLICY "管理者のみアプリを作成可能" ON oauth.applications
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM member.members WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "管理者のみアプリを参照可能" ON oauth.applications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM member.members WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "管理者のみアプリを削除可能" ON oauth.applications
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM member.members WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "管理者のみアプリを更新可能" ON oauth.applications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM member.members WHERE id = auth.uid() AND is_admin = true)
  );

-- RLS ポリシー: oauth.authorization_codes
-- 認可コードはサーバーサイドからのみアクセス（RLSなし・サービスロールキー使用）
-- 安全のため全アクセスを拒否（アプリケーションコードから直接操作）
CREATE POLICY "認可コードは直接アクセス不可" ON oauth.authorization_codes
  FOR ALL USING (false);

-- RLS ポリシー: oauth.user_consents
-- ユーザーは自分の承認記録のみ参照・削除可能
CREATE POLICY "自分の承認記録のみ参照可能" ON oauth.user_consents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "自分の承認記録のみ削除可能" ON oauth.user_consents
  FOR DELETE USING (user_id = auth.uid());

-- システムが承認記録を作成（サーバーサイドから）
CREATE POLICY "システムが承認記録を作成" ON oauth.user_consents
  FOR INSERT WITH CHECK (true);

-- 期限切れ認可コードの自動削除関数
CREATE OR REPLACE FUNCTION oauth.cleanup_expired_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM oauth.authorization_codes
  WHERE expires_at < NOW();
END;
$$;

-- コメント追加（ドキュメント）
COMMENT ON SCHEMA oauth IS 'OAuth 2.0 Authorization Server用スキーマ';
COMMENT ON TABLE oauth.applications IS 'OAuth クライアントアプリケーション登録';
COMMENT ON TABLE oauth.authorization_codes IS '認可コード（10分で期限切れ）';
COMMENT ON TABLE oauth.user_consents IS 'ユーザーの連携アプリ承認記録';
COMMENT ON FUNCTION oauth.cleanup_expired_codes IS '期限切れ認可コードを削除（定期実行推奨）';
