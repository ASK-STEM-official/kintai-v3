/**
 * 認証ヘルパー
 * OAuth トークン（STEM-system 経由）と Supabase セッションの両方に対応
 */

import { cookies } from 'next/headers';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { jwtVerify } from 'jose';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthUser = {
  id: string;
  displayName: string;
  discordId: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** OAuth JWT から認証された場合 true */
  isOAuth: boolean;
};

/**
 * STEM OAuth JWT の署名検証 + ペイロード取得。
 * JWT_SECRET 必須。未設定の場合は認証を拒否する（セキュリティ優先）。
 */
async function verifyOAuthToken(token: string): Promise<Record<string, unknown> | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[AUTH] JWT_SECRET is not configured — rejecting all OAuth tokens');
    return null;
  }

  const oauthBaseUrl = (process.env.NEXT_PUBLIC_STEM_OAUTH_BASE_URL || '').replace(/\/$/, '');
  // issuer は OAuth base URL そのまま、または /oauth を除いた base の両方を許容
  const issuerVariants: string[] = [];
  if (oauthBaseUrl) {
    issuerVariants.push(oauthBaseUrl);
    const stripped = oauthBaseUrl.replace(/\/oauth$/, '');
    if (stripped !== oauthBaseUrl) issuerVariants.push(stripped);
  }

  try {
    const encodedSecret = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, encodedSecret, {
      algorithms: ['HS256'],
      ...(issuerVariants.length > 0 ? { issuer: issuerVariants } : {}),
    });
    return payload as Record<string, unknown>;
  } catch (error) {
    console.warn('[AUTH] OAuth token verification failed:', (error as Error).message);
    return null;
  }
}

/**
 * OAuth cookie からユーザー情報を取得。
 * JWT 署名・有効期限を検証し、不正なトークンは拒否する。
 */
export async function getOAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('oauth_access_token')?.value;
  const userId = cookieStore.get('oauth_user_id')?.value;

  if (!token || !userId) return null;

  const payload = await verifyOAuthToken(token);
  if (!payload) return null;

  // JWT の sub は必須。sub がないトークンや cookie との不一致は拒否
  const tokenSub = payload.sub as string | undefined;
  if (!tokenSub || tokenSub !== userId) {
    console.warn('OAuth token sub missing or does not match oauth_user_id cookie');
    return null;
  }

  return {
    id: tokenSub,
    displayName: (payload.display_name as string) || '名無しさん',
    discordId: (payload.discord_id as string) || null,
    email: null,
    avatarUrl: null,
    isOAuth: true,
  };
}

/**
 * 認証済みユーザーの ID と Supabase クライアントを取得。
 * OAuth の場合は admin client（RLS バイパス）を返す。
 * 未認証なら /login にリダイレクト。
 */
export async function requireAuth(): Promise<{ userId: string; supabase: SupabaseClient }> {
  // OAuth を先にチェック
  const oauthUser = await getOAuthUser();
  if (oauthUser) {
    const supabase = await createSupabaseAdminClient();
    return { userId: oauthUser.id, supabase };
  }

  // Supabase セッションにフォールバック
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return { userId: user.id, supabase };
}

/**
 * Server Action 用の認証ガード。
 * 未認証の場合は例外を投げる（リダイレクトしない）。
 */
export async function requireServerAuth(): Promise<AuthUser> {
  const user = await getOAuthUser();
  if (user) return user;

  // Supabase セッションにフォールバック
  const supabase = await createSupabaseServerClient();
  const { data: { user: sbUser } } = await supabase.auth.getUser();
  if (!sbUser) {
    throw new Error('認証が必要です。');
  }

  return {
    id: sbUser.id,
    displayName: sbUser.user_metadata?.full_name || '名無しさん',
    discordId: sbUser.user_metadata?.provider_id || null,
    email: sbUser.email || null,
    avatarUrl: sbUser.user_metadata?.avatar_url || null,
    isOAuth: false,
  };
}

/**
 * Server Action 用の管理者認証ガード。
 * 未認証または管理者でない場合は例外を投げる。
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireServerAuth();
  const supabase = await createSupabaseAdminClient();
  const { data: profile } = await supabase
    .schema('member')
    .from('members')
    .select('is_admin')
    .eq('supabase_auth_user_id', user.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error('管理者権限が必要です。');
  }

  return user;
}
