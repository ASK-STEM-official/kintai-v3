-- user_cards RLS修正 + トリガーcase-sensitivity修正

-- ============================================================
-- 1. RLS修正
-- 変更前: authenticated ユーザー全員が全カードを読める（情報漏洩リスク）
-- 変更後: 自分のカードのみ読める。adminアプリはservice_role経由なのでRLS対象外
-- ============================================================
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON attendance.user_cards;

CREATE POLICY "Allow read own cards to authenticated users"
  ON attendance.user_cards
  FOR SELECT
  TO authenticated
  USING (auth.uid() = supabase_auth_user_id);

-- ============================================================
-- 2. トリガー関数のフィルタをcase-insensitiveに変更
-- 'TEMP_' / 'temp_' / 'qr_' / 'QR_' 等すべて対応
-- ============================================================
CREATE OR REPLACE FUNCTION attendance.sync_user_card_to_multi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance
AS $$
BEGIN
    -- qr_ / TEMP_ プレースホルダーは user_cards に同期しない（case-insensitive）
    IF lower(NEW.card_id) LIKE 'qr_%' OR lower(NEW.card_id) LIKE 'temp_%' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO attendance.user_cards (supabase_auth_user_id, card_id)
        VALUES (NEW.supabase_auth_user_id, NEW.card_id)
        ON CONFLICT (card_id) DO NOTHING;

    ELSIF TG_OP = 'UPDATE' AND OLD.card_id IS DISTINCT FROM NEW.card_id THEN
        IF lower(OLD.card_id) NOT LIKE 'qr_%' AND lower(OLD.card_id) NOT LIKE 'temp_%' THEN
            DELETE FROM attendance.user_cards
            WHERE supabase_auth_user_id = OLD.supabase_auth_user_id
              AND card_id = OLD.card_id;
        END IF;
        INSERT INTO attendance.user_cards (supabase_auth_user_id, card_id)
        VALUES (NEW.supabase_auth_user_id, NEW.card_id)
        ON CONFLICT (card_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;
