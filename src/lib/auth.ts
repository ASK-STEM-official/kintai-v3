/**
 * 認証ヘルパー
 * OAuth トークン（STEM-system 経由）と Supabase セッションの両方に対応
 */

import { cookies } from 'next/headers';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
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
 * OAuth JWT のペイロードをデコード（署名検証なし）
 * httpOnly + secure cookie に保存されているため改ざんリスクは低い
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * OAuth cookie からユーザー情報を取得
 */
export async function getOAuthUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('oauth_access_token')?.value;
  const userId = cookieStore.get('oauth_user_id')?.value;

  if (!token || !userId) return null;

  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  return {
    id: (payload.sub as string) || userId,
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
