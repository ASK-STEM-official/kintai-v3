-- Fix OAuth RLS policies to allow service_role bypass
-- service_role should have unrestricted access to all OAuth tables

-- service_role バイパスポリシーを追加
DO $$ 
BEGIN
  -- applications テーブル
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'oauth' 
    AND tablename = 'applications' 
    AND policyname = 'service_role_bypass_rls'
  ) THEN
    CREATE POLICY "service_role_bypass_rls" ON oauth.applications
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  -- authorization_codes テーブル
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'oauth' 
    AND tablename = 'authorization_codes' 
    AND policyname = 'service_role_bypass_rls'
  ) THEN
    CREATE POLICY "service_role_bypass_rls" ON oauth.authorization_codes
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  -- user_consents テーブル
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'oauth' 
    AND tablename = 'user_consents' 
    AND policyname = 'service_role_bypass_rls'
  ) THEN
    CREATE POLICY "service_role_bypass_rls" ON oauth.user_consents
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
