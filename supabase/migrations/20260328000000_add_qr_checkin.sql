-- QRコード出退勤用RPC関数
-- カード未登録ユーザーでもQRコードで出退勤できるようにする

CREATE OR REPLACE FUNCTION attendance.record_attendance_by_user_id(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = attendance, member, auth
AS $$
DECLARE
  v_display_name text;
  v_last_type    text;
  v_new_type     text;
  v_placeholder  text;
  v_now          timestamptz := now();
  v_date         date := (v_now AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  -- メンバー確認
  SELECT m.display_name INTO v_display_name
  FROM member.members m
  WHERE m.supabase_auth_user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'メンバーが見つかりません。',
      'user', null,
      'type', null
    );
  END IF;

  -- display_nameフォールバック
  IF v_display_name IS NULL THEN
    SELECT au.raw_user_meta_data->'custom_claims'->>'global_name'
    INTO v_display_name
    FROM auth.users au WHERE au.id = p_user_id;
  END IF;

  -- attendance.usersに行がなければQR用センチネルで自動作成
  -- （カード登録済みユーザーは ON CONFLICT でスキップ）
  v_placeholder := 'qr_' || p_user_id::text;
  INSERT INTO attendance.users (supabase_auth_user_id, card_id)
  VALUES (p_user_id, v_placeholder)
  ON CONFLICT (supabase_auth_user_id) DO NOTHING;

  -- 最終打刻タイプ取得→トグル
  SELECT a.type INTO v_last_type
  FROM attendance.attendances a
  WHERE a.user_id = p_user_id
  ORDER BY a.timestamp DESC LIMIT 1;

  v_new_type := CASE WHEN v_last_type = 'in' THEN 'out' ELSE 'in' END;

  -- 打刻記録挿入（card_idにはプレースホルダーを使用）
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
    'user', null,
    'type', null
  );
END;
$$;
