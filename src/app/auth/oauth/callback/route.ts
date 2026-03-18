/**
 * OAuth Callback Handler
 * STEM-system からのOAuth認証コールバックを処理
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // エラーチェック
  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return redirect('/login?error=invalid_callback');
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  const codeVerifier = cookieStore.get('oauth_code_verifier')?.value;

  // CSRF チェック
  if (state !== savedState) {
    return redirect('/login?error=invalid_state');
  }

  if (!codeVerifier) {
    return redirect('/login?error=missing_verifier');
  }

  try {
    // トークンエンドポイントにリクエスト
    const tokenEndpoint = process.env.NEXT_PUBLIC_STEM_OAUTH_TOKEN_URL || 'http://localhost:3000/oauth/token';
    const clientId = process.env.STEM_OAUTH_CLIENT_ID!;
    const clientSecret = process.env.STEM_OAUTH_CLIENT_SECRET!;
    const redirectUri = process.env.NEXT_PUBLIC_STEM_OAUTH_REDIRECT_URI!;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Token exchange failed:', errorData);
      return redirect(`/login?error=${encodeURIComponent(errorData.error || 'token_exchange_failed')}`);
    }

    const { access_token } = await tokenResponse.json();

    // UserInfo エンドポイントからユーザー情報を取得
    const userinfoEndpoint = process.env.NEXT_PUBLIC_STEM_OAUTH_USERINFO_URL || 'http://localhost:3000/oauth/userinfo';
    
    const userinfoResponse = await fetch(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userinfoResponse.ok) {
      return redirect('/login?error=userinfo_failed');
    }

    const userInfo = await userinfoResponse.json();
    
    // ユーザー情報を Supabase に保存・更新
    const supabase = await createClient();
    
    // users テーブルにユーザーを作成/更新
    const { error: upsertError } = await supabase
      .from('public.users')
      .upsert({
        id: userInfo.sub,
        display_name: userInfo.display_name,
        discord_id: userInfo.discord_id,
      }, {
        onConflict: 'id'
      });

    if (upsertError) {
      console.error('Failed to upsert user:', upsertError);
    }

    // OAuth セッションを Cookie に保存
    cookieStore.set('oauth_access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60, // 1時間
      path: '/',
    });

    cookieStore.set('oauth_user_id', userInfo.sub, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60,
      path: '/',
    });

    // 使用済みのワンタイムトークンを削除
    cookieStore.delete('oauth_state');
    cookieStore.delete('oauth_code_verifier');

    // ダッシュボードにリダイレクト
    return redirect('/');
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    return redirect('/login?error=callback_failed');
  }
}
