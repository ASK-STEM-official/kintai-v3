import { getOAuthUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import RegisterFaceClient from './page-client';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

// QR経路の本人確認ページ。/checkin/[token] を手本にした server component。
// OAuthで本人確認し、face_reg_sessions に user_id を紐付ける（status=identified）。
// 実際の顔キャプチャは kiosk 側カメラ + Python が行う（このページはキャプチャしない）。
export default async function RegisterFacePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createSupabaseAdminClient();

  // face_reg_sessions は生成型に未登録のため schema 結果をキャストして利用
  const sessions = (supabase.schema('attendance') as any).from('face_reg_sessions');

  const { data: session } = await sessions
    .select('id, status, expires_at')
    .eq('qr_token', token)
    .maybeSingle();

  if (!session) {
    return <RegisterFaceClient status="invalid" token={token} />;
  }
  if (session.status === 'done') {
    return <RegisterFaceClient status="already_used" token={token} />;
  }
  if (new Date(session.expires_at) <= new Date()) {
    return <RegisterFaceClient status="expired" token={token} />;
  }

  // 認証確認
  const oauthUser = await getOAuthUser();
  if (!oauthUser) {
    return <RegisterFaceClient status="unauthenticated" token={token} />;
  }

  // 在籍確認（completeRegistration と同じ確認）
  const { data: memberProfile } = await supabase
    .schema('member')
    .from('members')
    .select('supabase_auth_user_id')
    .eq('supabase_auth_user_id', oauthUser.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!memberProfile) {
    return <RegisterFaceClient status="not_member" token={token} />;
  }

  // セッションに user_id を紐付け（kiosk がこれを検知してキャプチャ開始）
  const { error: updateError } = await sessions
    .update({
      user_id: oauthUser.id,
      status: 'identified',
      accessed_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  if (updateError) {
    console.error('register-face bind error:', updateError);
    return <RegisterFaceClient status="error" token={token} message="本人確認の保存に失敗しました。" />;
  }

  return (
    <RegisterFaceClient
      status="success"
      token={token}
      displayName={oauthUser.displayName || '名無しさん'}
    />
  );
}
