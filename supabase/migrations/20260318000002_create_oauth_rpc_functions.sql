-- OAuth管理用のRPC関数を作成
-- PostgRESTの制限を回避するため、SECURITY DEFINERで実行

-- 1. OAuthアプリケーション作成
CREATE OR REPLACE FUNCTION oauth.create_application(
  p_name TEXT,
  p_client_id TEXT,
  p_client_secret_hash TEXT,
  p_redirect_uris TEXT[],
  p_created_by UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  client_id TEXT,
  client_secret_hash TEXT,
  redirect_uris TEXT[],
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO oauth.applications (name, client_id, client_secret_hash, redirect_uris, created_by)
  VALUES (p_name, p_client_id, p_client_secret_hash, p_redirect_uris, p_created_by)
  RETURNING *;
END;
$$;

-- 2. OAuthアプリケーション一覧取得
CREATE OR REPLACE FUNCTION oauth.list_applications()
RETURNS TABLE (
  id UUID,
  name TEXT,
  client_id TEXT,
  client_secret_hash TEXT,
  redirect_uris TEXT[],
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM oauth.applications
  ORDER BY created_at DESC;
END;
$$;

-- 3. OAuthアプリケーション削除
CREATE OR REPLACE FUNCTION oauth.delete_application(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM oauth.applications WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- 4. Client IDでアプリケーション取得
CREATE OR REPLACE FUNCTION oauth.get_application_by_client_id(p_client_id TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  client_id TEXT,
  client_secret_hash TEXT,
  redirect_uris TEXT[],
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM oauth.applications WHERE client_id = p_client_id;
END;
$$;

-- 5. 認可コード作成
CREATE OR REPLACE FUNCTION oauth.create_authorization_code(
  p_code TEXT,
  p_application_id UUID,
  p_user_id UUID,
  p_redirect_uri TEXT,
  p_code_challenge TEXT,
  p_code_challenge_method TEXT,
  p_scope TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO oauth.authorization_codes (
    code, application_id, user_id, redirect_uri, 
    code_challenge, code_challenge_method, scope, expires_at
  )
  VALUES (
    p_code, p_application_id, p_user_id, p_redirect_uri,
    p_code_challenge, p_code_challenge_method, p_scope, p_expires_at
  );
  RETURN TRUE;
END;
$$;

-- 6. 認可コード取得
CREATE OR REPLACE FUNCTION oauth.get_authorization_code(p_code TEXT)
RETURNS TABLE (
  code TEXT,
  application_id UUID,
  user_id UUID,
  redirect_uri TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM oauth.authorization_codes WHERE authorization_codes.code = p_code;
END;
$$;

-- 7. 認可コード削除
CREATE OR REPLACE FUNCTION oauth.delete_authorization_code(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM oauth.authorization_codes WHERE code = p_code;
  RETURN FOUND;
END;
$$;

-- 8. ユーザー同意記録作成
CREATE OR REPLACE FUNCTION oauth.create_user_consent(
  p_user_id UUID,
  p_application_id UUID,
  p_scope TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consent_id UUID;
BEGIN
  INSERT INTO oauth.user_consents (user_id, application_id, scope)
  VALUES (p_user_id, p_application_id, p_scope)
  ON CONFLICT (user_id, application_id) 
  DO UPDATE SET scope = p_scope, granted_at = NOW()
  RETURNING id INTO v_consent_id;
  
  RETURN v_consent_id;
END;
$$;

-- 9. ユーザー同意確認
CREATE OR REPLACE FUNCTION oauth.check_user_consent(
  p_user_id UUID,
  p_application_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM oauth.user_consents 
    WHERE user_id = p_user_id AND application_id = p_application_id
  );
END;
$$;

-- 10. ユーザー同意一覧（ユーザー自身のみ）
CREATE OR REPLACE FUNCTION oauth.list_user_consents(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  application_id UUID,
  application_name TEXT,
  scope TEXT,
  granted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    uc.id,
    uc.user_id,
    uc.application_id,
    a.name as application_name,
    uc.scope,
    uc.granted_at
  FROM oauth.user_consents uc
  JOIN oauth.applications a ON uc.application_id = a.id
  WHERE uc.user_id = p_user_id
  ORDER BY uc.granted_at DESC;
END;
$$;

-- 11. ユーザー同意削除
CREATE OR REPLACE FUNCTION oauth.delete_user_consent(p_consent_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM oauth.user_consents 
  WHERE id = p_consent_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

-- 権限付与（authenticatedロールに実行権限）
GRANT EXECUTE ON FUNCTION oauth.create_application TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.list_applications TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.delete_application TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.get_application_by_client_id TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.create_authorization_code TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.get_authorization_code TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.delete_authorization_code TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.create_user_consent TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.check_user_consent TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.list_user_consents TO authenticated;
GRANT EXECUTE ON FUNCTION oauth.delete_user_consent TO authenticated;
