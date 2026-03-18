'use server'

import { generateCodeVerifier, generateCodeChallenge, generateState, buildAuthorizationUrl } from '@/lib/oauth/pkce';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function signInWithSTEM() {
  const authEndpoint = process.env.NEXT_PUBLIC_STEM_OAUTH_URL || 'http://localhost:3000/oauth/authorize';
  const clientId = process.env.STEM_OAUTH_CLIENT_ID!;
  const redirectUri = process.env.NEXT_PUBLIC_STEM_OAUTH_REDIRECT_URI!;

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
    maxAge: 60 * 10, // 10分
    path: '/',
  });
  
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  });

  // OAuth 認可URLを構築してリダイレクト
  const authUrl = buildAuthorizationUrl({
    authorizationEndpoint: authEndpoint,
    clientId,
    redirectUri,
    codeChallenge,
    state,
  });

  redirect(authUrl);
}
