
'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchMemberStatus } from '@/lib/member-status-api';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  
  // Cookieから登録ページのパスを取得（もしあれば）
  const cookieStore = await cookies();
  const authNext = cookieStore.get('auth_next')?.value;
  const next = authNext || searchParams.get('next') || '/dashboard';
  
  // 使用済みCookieを削除
  if (authNext) {
    cookieStore.delete('auth_next');
  }

  console.log('[DEBUG AUTH] Callback URL:', request.url);
  console.log('[DEBUG AUTH] Code:', code?.substring(0, 10) + '...');
  console.log('[DEBUG AUTH] Origin:', origin);
  console.log('[DEBUG AUTH] Next:', next);

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=認証コードが見つかりません。`);
  }

  const supabase = await createSupabaseServerClient();
  
  console.log('[DEBUG AUTH] Attempting code exchange...');
  // PKCEフローでコードをセッションに交換
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[DEBUG AUTH] Code exchange error:', error);
    console.error('[DEBUG AUTH] Error details:', JSON.stringify(error, null, 2));
    // PKCEエラーの場合は再ログインを促す
    if (error.message.includes('flow state')) {
      return NextResponse.redirect(`${origin}/login?error=セッションの有効期限が切れました。もう一度ログインしてください。`);
    }
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました: ${error.message}`);
  }

  console.log('[DEBUG AUTH] Code exchange successful!');
  console.log('[DEBUG AUTH] User ID:', data.user?.id);
  console.log('[DEBUG AUTH] Session expires at:', data.session?.expires_at);

  if (!data.session || !data.user) {
    console.error('No session or user received from Supabase after code exchange.');
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました。`);
  }
  
  const discordUid = data.user.user_metadata.provider_id;
  if (!discordUid) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=DiscordユーザーIDが取得できませんでした。`);
  }

  // Discord サーバー所属チェック（一時的にコメントアウト）
  /*
  const { data: memberStatus, error: apiError } = await fetchMemberStatus(discordUid);
  
  if (apiError) {
      console.error('Error fetching member status from API:', apiError);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=APIとの通信中にエラーが発生しました。しばらく待ってから再度お試しください。`);
  }

  if (!memberStatus || !memberStatus.is_in_server) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=指定されたDiscordサーバーのメンバーではありません。`);
  }
  */

  // member.members テーブルにユーザーが登録されているかチェック
  const { data: memberRecord, error: memberError } = await supabase
    .schema('member')
    .from('members')
    .select('supabase_auth_user_id')
    .eq('discord_uid', discordUid)
    .single();

  if (memberError || !memberRecord) {
      console.log('[DEBUG AUTH] User not found in member.members table');
      console.log('[DEBUG AUTH] Discord UID:', discordUid);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_registered`);
  }

  console.log('[DEBUG AUTH] User found in members table, redirecting to:', next);
  return NextResponse.redirect(`${origin}${next}`);
}
