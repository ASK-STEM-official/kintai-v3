import { getOAuthUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import CheckinTokenClient from './page-client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function CheckinTokenPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createSupabaseAdminClient();

  // トークン検証（期限のみチェック・複数利用可能）
  const { data: tokenData } = await supabase
    .schema('attendance')
    .from('temp_checkin_tokens')
    .select('expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!tokenData) {
    return <CheckinTokenClient status="invalid" token={token} />;
  }

  if (new Date(tokenData.expires_at) <= new Date()) {
    return <CheckinTokenClient status="expired" token={token} />;
  }

  // 認証確認
  const oauthUser = await getOAuthUser();

  if (!oauthUser) {
    return <CheckinTokenClient status="unauthenticated" token={token} />;
  }

  // サーバー側で即座に打刻
  const { data: rpcData, error: rpcError } = await supabase
    .schema('attendance')
    .rpc('record_attendance_with_token', {
      p_user_id: oauthUser.id,
      p_token: token,
    });

  if (rpcError || !rpcData) {
    return <CheckinTokenClient status="error" token={token} message="打刻処理中にエラーが発生しました。" />;
  }

  const result = rpcData as {
    success: boolean;
    already_used?: boolean;
    message: string;
    user: { display_name: string | null } | null;
    type: 'in' | 'out' | null;
  };

  if (!result.success) {
    if (result.already_used) {
      return <CheckinTokenClient status="already_used" token={token} />;
    }
    return <CheckinTokenClient status="error" token={token} message={result.message} />;
  }

  return (
    <CheckinTokenClient
      status="success"
      token={token}
      message={result.message}
      displayName={result.user?.display_name || oauthUser.displayName || '名無しさん'}
      resultType={result.type}
    />
  );
}
