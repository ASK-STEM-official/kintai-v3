-- QRトークンの per-user 使用履歴テーブル
-- 同一ユーザーが同一トークンで2回以上打刻するのを防ぐ（リロード誤操作対策）
-- トークンが削除されると ON DELETE CASCADE で自動削除

CREATE TABLE IF NOT EXISTS attendance.temp_checkin_token_uses (
  token_id    uuid  NOT NULL REFERENCES attendance.temp_checkin_tokens(id) ON DELETE CASCADE,
  user_id     uuid  NOT NULL,
  result_type text  NOT NULL, -- 'in' or 'out'
  PRIMARY KEY (token_id, user_id)
);

ALTER TABLE attendance.temp_checkin_token_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.temp_checkin_token_uses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON attendance.temp_checkin_token_uses FROM anon;
REVOKE ALL ON attendance.temp_checkin_token_uses FROM authenticated;


-- ================================================================
-- RPC: record_attendance_with_token（再定義）
-- 同一 (token_id, user_id) の2回目以降はスキップして前回結果を返す
-- ================================================================

CREATE OR REPLACE FUNCTION attendance.record_attendance_with_token(
  p_user_id uuid,
  p_token   text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance, member, auth
AS $$
DECLARE
  v_token_id      uuid;
  v_display_name  text;
  v_last_type     text;
  v_new_type      text;
  v_placeholder   text;
  v_existing_type text;
  v_now           timestamptz := now();
  v_date          date        := (v_now AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- トークンを検証（存在する・期限内）
  SELECT id INTO v_token_id
  FROM attendance.temp_checkin_tokens
  WHERE token      = p_token
    AND expires_at > v_now;

  IF v_token_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'QRコードの有効期限が切れています。キオスクの新しいQRコードを読み取ってください。',
      'user', null, 'type', null
    );
  END IF;

  -- メンバー確認
  SELECT m.discord_username INTO v_display_name
  FROM member.members m
  WHERE m.supabase_auth_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'メンバーが見つかりません。',
      'user', null, 'type', null
    );
  END IF;

  -- display_name フォールバック
  IF v_display_name IS NULL THEN
    SELECT au.raw_user_meta_data->'custom_claims'->>'global_name'
    INTO v_display_name
    FROM auth.users au WHERE au.id = p_user_id;
  END IF;

  -- 同一トークン・同一ユーザーの重複チェック（リロード誤操作対策）
  SELECT result_type INTO v_existing_type
  FROM attendance.temp_checkin_token_uses
  WHERE token_id = v_token_id AND user_id = p_user_id;

  IF FOUND THEN
    -- 既にこのトークンで打刻済み → 前回結果をそのまま返す（記録しない）
    RETURN json_build_object(
      'success', true,
      'message', CASE WHEN v_existing_type = 'in' THEN '出勤しました' ELSE '退勤しました' END,
      'user', json_build_object('display_name', v_display_name),
      'type', v_existing_type
    );
  END IF;

  -- カード未登録ユーザー: attendance.users にQR用センチネルを自動挿入
  v_placeholder := 'qr_' || p_user_id::text;
  INSERT INTO attendance.users (supabase_auth_user_id, card_id)
  VALUES (p_user_id, v_placeholder)
  ON CONFLICT (supabase_auth_user_id) DO NOTHING;

  -- 最終打刻タイプ取得 → トグル
  SELECT a.type INTO v_last_type
  FROM attendance.attendances a
  WHERE a.user_id = p_user_id
  ORDER BY a.timestamp DESC LIMIT 1;

  v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

  -- 出退勤記録
  INSERT INTO attendance.attendances (user_id, card_id, type, timestamp, date)
  VALUES (p_user_id, v_placeholder, v_new_type, v_now, v_date);

  -- 使用履歴に記録
  INSERT INTO attendance.temp_checkin_token_uses (token_id, user_id, result_type)
  VALUES (v_token_id, p_user_id, v_new_type);

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN v_new_type = 'in' THEN '出勤しました' ELSE '退勤しました' END,
    'user', json_build_object('display_name', v_display_name),
    'type', v_new_type
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'message', '打刻処理中にエラーが発生しました: ' || SQLERRM,
    'user', null, 'type', null
  );
END;
$$;

GRANT EXECUTE ON FUNCTION attendance.record_attendance_with_token(uuid, text) TO service_role;
