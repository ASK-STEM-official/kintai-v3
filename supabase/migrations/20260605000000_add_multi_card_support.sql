-- マルチカードID対応: Phase 1（非破壊的マイグレーション）
-- attendance.user_cards テーブルを新設し、既存 attendance.users.card_id からデータを移行する。
-- attendance.users.card_id は後方互換性のため残す（アプリコード更新後にPhase 2で削除予定）。

-- ============================================================
-- 1. user_cards テーブル作成
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance.user_cards (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    supabase_auth_user_id uuid NOT NULL REFERENCES attendance.users(supabase_auth_user_id) ON DELETE CASCADE,
    card_id character varying NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT user_cards_card_id_unique UNIQUE (card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_cards_user_id ON attendance.user_cards (supabase_auth_user_id);

ALTER TABLE attendance.user_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to service_role" ON attendance.user_cards FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow read access to authenticated users" ON attendance.user_cards FOR SELECT TO authenticated USING (true);

GRANT ALL ON attendance.user_cards TO service_role;
GRANT SELECT ON attendance.user_cards TO authenticated;

-- ============================================================
-- 2. 既存データを移行（qr_ プレースホルダーは除外）
-- ============================================================
INSERT INTO attendance.user_cards (supabase_auth_user_id, card_id)
SELECT supabase_auth_user_id, card_id
FROM attendance.users
WHERE card_id NOT LIKE 'qr_%'
ON CONFLICT (card_id) DO NOTHING;

-- ============================================================
-- 3. attendance.users への書き込みを user_cards へ自動同期するトリガー
--    （アプリコードを変更しなくても新規登録・更新が user_cards に反映される）
-- ============================================================
CREATE OR REPLACE FUNCTION attendance.sync_user_card_to_multi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance
AS $$
BEGIN
    -- qr_ プレースホルダーは同期しない
    IF NEW.card_id LIKE 'qr_%' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO attendance.user_cards (supabase_auth_user_id, card_id)
        VALUES (NEW.supabase_auth_user_id, NEW.card_id)
        ON CONFLICT (card_id) DO NOTHING;

    ELSIF TG_OP = 'UPDATE' AND OLD.card_id IS DISTINCT FROM NEW.card_id THEN
        -- 旧カードを削除（qr_ でない場合のみ）
        IF OLD.card_id NOT LIKE 'qr_%' THEN
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

CREATE TRIGGER trg_sync_user_card
AFTER INSERT OR UPDATE ON attendance.users
FOR EACH ROW EXECUTE FUNCTION attendance.sync_user_card_to_multi();

-- ============================================================
-- 4. record_attendance_by_card を user_cards 参照に更新
--    （1カード→Nカード対応。既存の呼び出し方は変わらない）
-- ============================================================
CREATE OR REPLACE FUNCTION attendance.record_attendance_by_card(p_card_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance, member
AS $$
DECLARE
  v_user_id      uuid;
  v_display_name text;
  v_discord_uid  text;
  v_last_type    text;
  v_new_type     text;
  v_now          timestamptz := now();
  v_date         date := (v_now AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- user_cards からユーザーID取得（マルチカード対応）
  SELECT uc.supabase_auth_user_id INTO v_user_id
  FROM attendance.user_cards uc
  WHERE uc.card_id = p_card_id;

  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', '未登録のカードです。',
      'user', null,
      'type', null
    );
  END IF;

  -- メンバー情報取得（display_nameはDBに存在しないためdiscord_usernameを使用）
  SELECT m.discord_username, m.discord_uid INTO v_display_name, v_discord_uid
  FROM member.members m
  WHERE m.supabase_auth_user_id = v_user_id;

  IF v_display_name IS NULL THEN
    SELECT au.raw_user_meta_data->>'custom_claims'->>'global_name'
    INTO v_display_name
    FROM auth.users au WHERE au.id = v_user_id;
  END IF;

  -- 最新打刻取得 → トグル
  SELECT a.type INTO v_last_type
  FROM attendance.attendances a
  WHERE a.user_id = v_user_id
  ORDER BY a.timestamp DESC LIMIT 1;

  v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

  -- 打刻記録挿入
  INSERT INTO attendance.attendances (user_id, card_id, type, timestamp, date)
  VALUES (v_user_id, p_card_id, v_new_type, v_now, v_date);

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN v_new_type = 'in' THEN '出勤しました' ELSE '退勤しました' END,
    'user', json_build_object('display_name', v_display_name, 'discord_uid', v_discord_uid),
    'type', v_new_type
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'message', '打刻処理中にエラーが発生しました: ' || SQLERRM,
    'user', null,
    'type', null
  );
END;
$$;
