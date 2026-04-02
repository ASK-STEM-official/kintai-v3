-- キオスクがトークンの使用状況をポーリングするためのRPC
-- anon から呼び出せる（キオスクはブラウザで動作）

CREATE OR REPLACE FUNCTION attendance.has_checkin_token_been_used(p_token text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = attendance
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM attendance.temp_checkin_token_uses tcu
    JOIN attendance.temp_checkin_tokens t ON t.id = tcu.token_id
    WHERE t.token = p_token
  );
$$;

GRANT EXECUTE ON FUNCTION attendance.has_checkin_token_been_used(text) TO anon;
