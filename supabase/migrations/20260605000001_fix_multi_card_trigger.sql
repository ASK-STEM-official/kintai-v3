-- マルチカード対応フォローアップ修正
-- 1. トリガーに TEMP_ フィルタを追加（TEMP_ プレースホルダーが user_cards に混入するバグ修正）
-- 2. 初回マイグレーション時に混入した TEMP_ / qr_ プレースホルダーをクリーンアップ

-- ============================================================
-- 1. トリガー関数の更新（TEMP_ フィルタ追加）
-- ============================================================
CREATE OR REPLACE FUNCTION attendance.sync_user_card_to_multi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance
AS $$
BEGIN
    -- qr_ / TEMP_ プレースホルダーは user_cards に同期しない
    IF NEW.card_id LIKE 'qr_%' OR NEW.card_id LIKE 'TEMP_%' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO attendance.user_cards (supabase_auth_user_id, card_id)
        VALUES (NEW.supabase_auth_user_id, NEW.card_id)
        ON CONFLICT (card_id) DO NOTHING;

    ELSIF TG_OP = 'UPDATE' AND OLD.card_id IS DISTINCT FROM NEW.card_id THEN
        IF OLD.card_id NOT LIKE 'qr_%' AND OLD.card_id NOT LIKE 'TEMP_%' THEN
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

-- ============================================================
-- 2. 混入済みプレースホルダーのクリーンアップ
-- ============================================================
DELETE FROM attendance.user_cards
WHERE card_id LIKE 'qr_%' OR card_id LIKE 'TEMP_%';
