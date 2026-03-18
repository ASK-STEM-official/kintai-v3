'use server'

import { generateCodeVerifier, generateCodeChallenge, generateState, buildAuthorizationUrl } from '@/lib/oauth/pkce';
import { cookies } from 'next/headers';

export async function signInWithSTEM(): Promise<{ url: string }> {
  const oauthBaseUrl = (process.env.NEXT_PUBLIC_STEM_OAUTH_BASE_URL || 'http://localhost:3000/oauth').replace(/\/$/, '');
  const clientId = process.env.STEM_OAUTH_CLIENT_ID!;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001').replace(/\/$/, '');
  const redirectUri = `${appUrl}/auth/oauth/callback`;

  // PKCE パラメータを生成
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Cookie に保存（OAuth コールバックで使用）
  const cookieStore = await cookies();
  cookieStore.set('oauth_code_verifier', codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });
  
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  // OAuth 認可URLを構築して返す
  const authUrl = buildAuthorizationUrl({
    authorizationEndpoint: `${oauthBaseUrl}/authorize`,
    clientId,
    redirectUri,
    codeChallenge,
    state,
  });

  return { url: authUrl };
}
