
'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchMemberStatus } from '@/lib/member-status-api';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  
  // Cookieから登録ページのパスを取得（もしあれば）
  const cookieStore = await cookies();
  const authNext = cookieStore.get('auth_next')?.value;
  const next = authNext || searchParams.get('next') || '/dashboard';
  
  // 使用済みCookieを削除
  if (authNext) {
    cookieStore.delete('auth_next');
  }

  console.log('[AUTH CALLBACK] ========================================');
  console.log('[AUTH CALLBACK] Timestamp:', new Date().toISOString());
  console.log('[AUTH CALLBACK] Request URL:', request.url);
  console.log('[AUTH CALLBACK] Origin:', origin);
  console.log('[AUTH CALLBACK] Next redirect:', next);
  console.log('[AUTH CALLBACK] Code present:', !!code);
  console.log('[AUTH CALLBACK] Error param:', errorParam);
  console.log('[AUTH CALLBACK] Error description:', errorDescription);
  if (code) {
    console.log('[AUTH CALLBACK] Code (first 20 chars):', code.substring(0, 20) + '...');
  }

  // OAuthプロバイダーからのエラーをチェック
  if (errorParam) {
    console.error('[AUTH CALLBACK] ❌ OAuth error from provider');
    console.error('[AUTH CALLBACK] Error:', errorParam);
    console.error('[AUTH CALLBACK] Error code:', searchParams.get('error_code'));
    console.error('[AUTH CALLBACK] Error description:', errorDescription);
    console.error('[AUTH CALLBACK] ========================================');
    
    // ユーザーに分かりやすいエラーメッセージを表示
    let userMessage = '認証中にエラーが発生しました。';
    if (errorDescription?.includes('Unable to exchange external code')) {
      userMessage = '認証の処理中にエラーが発生しました。時間をおいて再度お試しください。改善しない場合は管理者にお問い合わせください。';
    } else if (errorDescription) {
      userMessage = errorDescription;
    }
    
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(userMessage)}`);
  }

  if (!code) {
    console.error('[AUTH CALLBACK] No code parameter in callback URL');
    return NextResponse.redirect(`${origin}/login?error=認証コードが見つかりません。`);
  }

  const supabase = await createSupabaseServerClient();
  
  console.log('[AUTH CALLBACK] Attempting code exchange with Supabase...');
  // PKCEフローでコードをセッションに交換
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[AUTH CALLBACK] ❌ Code exchange FAILED');
    console.error('[AUTH CALLBACK] Error name:', error.name);
    console.error('[AUTH CALLBACK] Error message:', error.message);
    console.error('[AUTH CALLBACK] Error status:', error.status);
    console.error('[AUTH CALLBACK] Error code:', error.code);
    console.error('[AUTH CALLBACK] Full error object:', JSON.stringify(error, null, 2));
    
    // PKCEエラーの場合は再ログインを促す
    if (error.message.includes('flow state')) {
      return NextResponse.redirect(`${origin}/login?error=セッションの有効期限が切れました。もう一度ログインしてください。`);
    }
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました: ${error.message}`);
  }

  console.log('[AUTH CALLBACK] ✅ Code exchange successful');

  if (!data.session || !data.user) {
    console.error('[AUTH CALLBACK] ❌ No session or user in response');
    console.error('[AUTH CALLBACK] data.session:', !!data.session);
    console.error('[AUTH CALLBACK] data.user:', !!data.user);
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました。`);
  }
  
  console.log('[AUTH CALLBACK] User ID:', data.user.id);
  console.log('[AUTH CALLBACK] User email:', data.user.email);
  console.log('[AUTH CALLBACK] Session expires at:', data.session.expires_at);
  console.log('[AUTH CALLBACK] User metadata:', JSON.stringify(data.user.user_metadata, null, 2));

  const discordUid = data.user.user_metadata.provider_id;
  console.log('[AUTH CALLBACK] Discord UID:', discordUid);
  
  if (!discordUid) {
      console.error('[AUTH CALLBACK] ❌ Discord UID not found in user metadata');
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
  console.log('[AUTH CALLBACK] Checking member.members table for Discord UID:', discordUid);
  const { data: memberRecord, error: memberError } = await supabase
    .schema('member')
    .from('members')
    .select('supabase_auth_user_id')
    .eq('discord_uid', discordUid)
    .single();

  if (memberError) {
    console.error('[AUTH CALLBACK] ❌ Member lookup error');
    console.error('[AUTH CALLBACK] Error code:', memberError.code);
    console.error('[AUTH CALLBACK] Error message:', memberError.message);
    console.error('[AUTH CALLBACK] Error details:', memberError.details);
    console.error('[AUTH CALLBACK] Error hint:', memberError.hint);
  }

  if (memberError || !memberRecord) {
      console.log('[AUTH CALLBACK] ❌ User not found in member.members table');
      console.log('[AUTH CALLBACK] Discord UID searched:', discordUid);
      console.log('[AUTH CALLBACK] Member record:', memberRecord);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_registered`);
  }

  console.log('[AUTH CALLBACK] ✅ User found in members table');
  console.log('[AUTH CALLBACK] Member supabase_auth_user_id:', memberRecord.supabase_auth_user_id);
  console.log('[AUTH CALLBACK] Redirecting to:', next);
  console.log('[AUTH CALLBACK] ========================================');
  
  return NextResponse.redirect(`${origin}${next}`);
}
