/**
 * OAuth Callback Handler
 * STEM-system からのOAuth認証コールバックを処理
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

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
    const oauthBaseUrl = (process.env.NEXT_PUBLIC_STEM_OAUTH_BASE_URL || 'http://localhost:3000/oauth').replace(/\/$/, '');
    const clientId = process.env.STEM_OAUTH_CLIENT_ID!;
    const clientSecret = process.env.STEM_OAUTH_CLIENT_SECRET!;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001').replace(/\/$/, '');
    const redirectUri = `${appUrl}/auth/oauth/callback`;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    });

    const tokenResponse = await fetch(`${oauthBaseUrl}/token`, {
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
    const userinfoResponse = await fetch(`${oauthBaseUrl}/userinfo`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userinfoResponse.ok) {
      return redirect('/login?error=userinfo_failed');
    }

    const userInfo = await userinfoResponse.json();

    // OAuth セッションを Cookie に保存
    cookieStore.set('oauth_access_token', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30日
      path: '/',
    });

    cookieStore.set('oauth_user_id', userInfo.sub, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30日
      path: '/',
    });

    // 使用済みのワンタイムトークンを削除
    cookieStore.delete('oauth_state');
    cookieStore.delete('oauth_code_verifier');

    // auth_next cookieがあればそこへ、なければダッシュボードへ
    const authNext = cookieStore.get('auth_next')?.value;
    cookieStore.delete('auth_next');
    return redirect(authNext || '/');

  } catch (error) {
    // redirect() は内部的に特殊なエラーを throw するので再 throw する
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    if (typeof error === 'object' && error !== null && 'digest' in error &&
        typeof (error as { digest: unknown }).digest === 'string' &&
        (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')) throw error;
    console.error('OAuth callback error:', error);
    return redirect('/login?error=callback_failed');
  }
}
