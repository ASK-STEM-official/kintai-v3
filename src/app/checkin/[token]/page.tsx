import { getOAuthUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import CheckinTokenClient from './page-client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function CheckinTokenPage({ params }: Props) {
  const { token } = await params;
  const supabase = await createSupabaseAdminClient();

  // トークン検証（期限・使用済み）
  const { data: tokenData } = await supabase
    .schema('attendance')
    .from('temp_checkin_tokens')
    .select('id, is_used, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!tokenData) {
    return <CheckinTokenClient status="invalid" token={token} displayName={null} currentStatus={null} />;
  }

  if (tokenData.is_used) {
    return <CheckinTokenClient status="used" token={token} displayName={null} currentStatus={null} />;
  }

  if (new Date(tokenData.expires_at) <= new Date()) {
    return <CheckinTokenClient status="expired" token={token} displayName={null} currentStatus={null} />;
  }

  // 認証確認
  const oauthUser = await getOAuthUser();

  if (!oauthUser) {
    return <CheckinTokenClient status="unauthenticated" token={token} displayName={null} currentStatus={null} />;
  }

  // メンバー情報と最終打刻状態を取得
  const [memberResult, lastAttendanceResult] = await Promise.all([
    supabase
      .schema('member')
      .from('members')
      .select('discord_username')
      .eq('supabase_auth_user_id', oauthUser.id)
      .single(),
    supabase
      .schema('attendance')
      .from('attendances')
      .select('type')
      .eq('user_id', oauthUser.id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (memberResult.error || !memberResult.data) {
    return <CheckinTokenClient status="not_member" token={token} displayName={null} currentStatus={null} />;
  }

  const member = memberResult.data;
  const displayName = member.discord_username || oauthUser.displayName || '名無しさん';
  const currentStatus: 'in' | 'out' = lastAttendanceResult.data?.type === 'in' ? 'in' : 'out';

  return (
    <CheckinTokenClient
      status="ready"
      token={token}
      displayName={displayName}
      currentStatus={currentStatus}
    />
  );
}
