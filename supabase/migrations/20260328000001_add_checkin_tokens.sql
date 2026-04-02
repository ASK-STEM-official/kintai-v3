-- QRコード出退勤用トークンテーブルと関連RPC
-- - キオスクが30秒ごとに新トークンを生成し、QRコードに埋め込む
-- - トークンは90秒で期限切れ、1回使用したら無効
-- - 不正な使い回しを防止

-- ================================================================
-- TABLE: temp_checkin_tokens
-- ================================================================

CREATE TABLE IF NOT EXISTS attendance.temp_checkin_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token      text        NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  is_used    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLSを有効化（SECURITY DEFINER RPCが内部でアクセスするため、直接アクセスは不要）
ALTER TABLE attendance.temp_checkin_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance.temp_checkin_tokens FORCE ROW LEVEL SECURITY;

-- anon・authenticated に直接テーブルアクセス権を与えない
REVOKE ALL ON attendance.temp_checkin_tokens FROM anon;
REVOKE ALL ON attendance.temp_checkin_tokens FROM authenticated;


-- ================================================================
-- RPC: create_checkin_token
-- キオスク（ブラウザ、anon）が呼び出す
-- 新しいトークンを作成して返す。期限切れトークンのクリーンアップも行う。
-- ================================================================

CREATE OR REPLACE FUNCTION attendance.create_checkin_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance
AS $$
DECLARE
  v_token text;
BEGIN
  -- 1時間以上前に期限切れのトークンを削除（テーブルの肥大化を防ぐ）
  DELETE FROM attendance.temp_checkin_tokens
  WHERE expires_at < now() - interval '1 hour';

  -- 新しいランダムトークンを生成（UUIDからハイフンを除いた32文字）
  v_token := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO attendance.temp_checkin_tokens (token, expires_at)
  VALUES (v_token, now() + interval '90 seconds');

  RETURN v_token;
END;
$$;

-- キオスクのブラウザ（anon）から呼び出せるようにGRANT
GRANT EXECUTE ON FUNCTION attendance.create_checkin_token() TO anon;


-- ================================================================
-- RPC: record_attendance_with_token
-- サーバーアクション（service_role）が呼び出す
-- トークン検証（未使用・期限内）→ 使用済みマーク → 出退勤記録
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
  v_last_ts       timestamptz;
  v_new_type      text;
  v_placeholder   text;
  v_now           timestamptz := now();
  v_date          date        := (v_now AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- トークンを検証（存在する・期限内）
  -- 同じQRコードは有効期限内であれば何度でも使用可能
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

  -- カード未登録ユーザー: attendance.users にQR用センチネルを自動挿入
  v_placeholder := 'qr_' || p_user_id::text;
  INSERT INTO attendance.users (supabase_auth_user_id, card_id)
  VALUES (p_user_id, v_placeholder)
  ON CONFLICT (supabase_auth_user_id) DO NOTHING;

  -- 最終打刻タイプ・時刻取得
  SELECT a.type, a.timestamp INTO v_last_type, v_last_ts
  FROM attendance.attendances a
  WHERE a.user_id = p_user_id
  ORDER BY a.timestamp DESC LIMIT 1;

  -- 3分以内の重複打刻を防止（リロード誤操作対策）
  IF v_last_ts IS NOT NULL AND v_last_ts > v_now - interval '3 minutes' THEN
    RETURN json_build_object(
      'success', true,
      'message', CASE WHEN v_last_type = 'in' THEN '出勤しました' ELSE '退勤しました' END,
      'user', json_build_object('display_name', v_display_name),
      'type', v_last_type
    );
  END IF;

  v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

  -- 出退勤記録
  INSERT INTO attendance.attendances (user_id, card_id, type, timestamp, date)
  VALUES (p_user_id, v_placeholder, v_new_type, v_now, v_date);

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

-- service_role からのみ呼び出せる（デフォルトでservice_roleはすべてEXECUTE可能だが明示）
GRANT EXECUTE ON FUNCTION attendance.record_attendance_with_token(uuid, text) TO service_role;
