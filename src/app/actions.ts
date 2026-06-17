

'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { getOAuthUser, requireServerAuth, requireAdmin } from '@/lib/auth';
import { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { differenceInSeconds, startOfDay, endOfDay, subDays, format as formatDate, startOfMonth, endOfMonth } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { fetchAllMemberNames, fetchMemberNickname } from '@/lib/name-api';
import { fetchMemberStatus } from '@/lib/member-status-api';

type Member = Tables<'member', 'members'>;
type AttendanceUser = Tables<'attendance', 'users'>;
type Team = Tables<'member', 'teams'>;

type UserWithTeam = Member & { teams: Team[] | null };

const timeZone = 'Asia/Tokyo';

export async function recordAttendance(cardId: string): Promise<{ success: boolean; message: string; user: { display_name: string | null; } | null; type: 'in' | 'out' | null; }> {
  const TIMEOUT_MS = 10000; // 10秒タイムアウト
  const traceId = randomUUID();
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      recordAttendanceInternal(cardId, traceId),
      timeoutPromise
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === 'TIMEOUT') {
      console.error(`[RECORD_ATTENDANCE:${traceId}] ❌ Timeout after ${TIMEOUT_MS}ms - Card ID: ${cardId.substring(0, 10)}...`);
      return { success: false, message: 'サーバーの応答がタイムアウトしました。もう一度お試しください。', user: null, type: null };
    }
    console.error(`[RECORD_ATTENDANCE:${traceId}] Unexpected error:`, error);
    return { success: false, message: '予期しないエラーが発生しました。', user: null, type: null };
  }
}

async function recordAttendanceInternal(cardId: string, traceId: string): Promise<{ success: boolean; message: string; user: { display_name: string | null; } | null; type: 'in' | 'out' | null; }> {
  const startTime = Date.now();
  console.log(`[RECORD_ATTENDANCE:${traceId}] Start - Card ID: ${cardId.substring(0, 10)}...`);

  const supabaseStart = Date.now();
  const supabase = await createSupabaseAdminClient();
  const supabaseDuration = Date.now() - supabaseStart;
  console.log(`[RECORD_ATTENDANCE:${traceId}] Supabase client creation: ${supabaseDuration}ms`);

  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  // Single RPC call: lookup + check last attendance + insert (1 HTTP request instead of 3)
  const rpcStart = Date.now();
  const { data, error } = await supabase.schema('attendance').rpc('record_attendance_by_card', {
    p_card_id: normalizedCardId,
  });
  const rpcDuration = Date.now() - rpcStart;
  console.log(`[RECORD_ATTENDANCE:${traceId}] RPC call: ${rpcDuration}ms`);

  if (error) {
    console.error(`[RECORD_ATTENDANCE:${traceId}] RPC error:`, error);
    return { success: false, message: '打刻処理中にエラーが発生しました。', user: null, type: null };
  }

  const result = data as { success: boolean; message: string; user: { display_name: string | null; discord_uid: string | null } | null; type: 'in' | 'out' | null };

  // display_name が無い場合はフォールバック（DBには本名を保存しない）
  if (result.user && !result.user.display_name) {
    result.user.display_name = '名無しさん';
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[RECORD_ATTENDANCE:${traceId}] ${result.success ? 'Success' : 'Failed'} - ${result.type} (${totalDuration}ms) - User: ${result.user?.display_name}`);

  if (result.success) {
    revalidatePath('/dashboard/teams');
  }

  // discord_uid をクライアントに返さない
  if (result.user) {
    const { discord_uid: _uid, ...userWithoutDiscordUid } = result.user;
    return { ...result, user: userWithoutDiscordUid };
  }
  return { ...result, user: null };
}


export async function recordAttendanceWithToken(token: string): Promise<{
  success: boolean;
  message: string;
  user: { display_name: string | null } | null;
  type: 'in' | 'out' | null;
}> {
  const oauthUser = await getOAuthUser();
  if (!oauthUser) {
    return { success: false, message: '認証されていません。', user: null, type: null };
  }
  const supabase = await createSupabaseAdminClient();
  const { data, error } = await supabase.schema('attendance').rpc('record_attendance_with_token', {
    p_user_id: oauthUser.id,
    p_token: token,
  });
  if (error) {
    console.error('QR check-in RPC error:', error);
    return { success: false, message: '打刻処理中にエラーが発生しました。', user: null, type: null };
  }
  const result = data as {
    success: boolean;
    message: string;
    user: { display_name: string | null } | null;
    type: 'in' | 'out' | null;
  };
  if (result.user && !result.user.display_name) result.user.display_name = '名無しさん';
  return result;
}

const processSubmission = async (submissionType: 'idle' | 'register', cardId: string) => {
    if (submissionType === 'register') {
      return await createTempRegistration(cardId);
    }
    return await recordAttendance(cardId);
  }

export async function createTempRegistration(cardId: string): Promise<{ success: boolean; token?: string; message: string }> {
  const TIMEOUT_MS = 10000;
  const traceId = randomUUID();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      createTempRegistrationInternal(cardId, traceId),
      timeoutPromise
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === 'TIMEOUT') {
      console.error(`[CREATE_TEMP_REG:${traceId}] Timeout after ${TIMEOUT_MS}ms`);
      return { success: false, message: 'サーバーの応答がタイムアウトしました。もう一度お試しください。' };
    }
    console.error(`[CREATE_TEMP_REG:${traceId}] Unexpected error:`, error);
    return { success: false, message: '予期しないエラーが発生しました。' };
  }
}

async function createTempRegistrationInternal(cardId: string, traceId: string): Promise<{ success: boolean; token?: string; message: string }> {
  const startTime = Date.now();
  const supabase = await createSupabaseAdminClient();
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();
  console.log(`[CREATE_TEMP_REG:${traceId}] Start - Card ID: ${cardId.substring(0, 10)}...`);
  
  const existingStart = Date.now();
  const { data: existingCard, error: existingCardError } = await supabase
    .schema('attendance')
    .from('user_cards')
    .select('supabase_auth_user_id')
    .eq('card_id', normalizedCardId)
    .single();
  console.log(`[CREATE_TEMP_REG:${traceId}] User lookup: ${Date.now() - existingStart}ms`);

  if (existingCardError && existingCardError.code !== 'PGRST116') {
    console.error(`[CREATE_TEMP_REG:${traceId}] Error checking for existing card:`, existingCardError);
    return { success: false, message: "カード情報の確認中にデータベースエラーが発生しました。" };
  }
  
  if (existingCard) {
    console.log(`[CREATE_TEMP_REG:${traceId}] Already registered card`);
    return { success: false, message: 'このカードは既に登録されています。' };
  }

  // Find and delete previous incomplete registrations for this card
  const cleanupStart = Date.now();
  await supabase.schema('attendance').from('temp_registrations').delete().match({ card_id: normalizedCardId, is_used: false });
  console.log(`[CREATE_TEMP_REG:${traceId}] Cleanup: ${Date.now() - cleanupStart}ms`);

  const token = `qr_${randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  
  const insertStart = Date.now();
  const { error } = await supabase.schema('attendance').from('temp_registrations').insert(
    { card_id: normalizedCardId, qr_token: token, expires_at: expires_at, is_used: false }
  );
  console.log(`[CREATE_TEMP_REG:${traceId}] Insert: ${Date.now() - insertStart}ms`);
  
  if (error) {
    console.error(`[CREATE_TEMP_REG:${traceId}] Temp registration error:`, error);
    return { success: false, message: "仮登録中にエラーが発生しました。" };
  }

  console.log(`[CREATE_TEMP_REG:${traceId}] Success (${Date.now() - startTime}ms)`);
  return { success: true, token, message: "QRコードを生成しました。" };
}

// --- 顔登録（face registration） ---
// 配線仕様は kintai-v3/doc/face-auth-protocol.md を参照。
// QR経路: createFaceRegSession でトークン発行 → /register-face/[token] で本人確認 →
//   face_reg_sessions に user_id を紐付け → kiosk が検知して Python に登録指示。
// カード経路: resolveUserByCard で即 user_id 解決。

/**
 * 顔登録用のQRセッションを発行する（カード未所持者向けのQR経路）。
 * createTempRegistration と同じ admin client パターン。kioskから呼ぶ（認証不要）。
 */
export async function createFaceRegSession(): Promise<{ success: boolean; token?: string; message: string }> {
  const supabase = await createSupabaseAdminClient();
  const token = `facereg_${randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // face_reg_sessions は生成型に未登録のため schema 結果をキャストして利用
  const { error } = await (supabase.schema('attendance') as any)
    .from('face_reg_sessions')
    .insert({ qr_token: token, status: 'pending', expires_at });

  if (error) {
    console.error('createFaceRegSession error:', error);
    return { success: false, message: '顔登録セッションの作成に失敗しました。' };
  }
  return { success: true, token, message: 'ok' };
}

/**
 * カードIDから user_id と表示名を解決する（顔登録のカード経路）。
 * createTempRegistrationInternal のカード照会を踏襲。未登録カードはエラー。
 */
export async function resolveUserByCard(cardId: string): Promise<{ success: boolean; userId?: string; displayName?: string; message: string }> {
  const supabase = await createSupabaseAdminClient();
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  const { data: card, error } = await supabase
    .schema('attendance')
    .from('user_cards')
    .select('supabase_auth_user_id')
    .eq('card_id', normalizedCardId)
    .maybeSingle();

  if (error) {
    console.error('resolveUserByCard error:', error);
    return { success: false, message: 'カード照会中にエラーが発生しました。' };
  }
  if (!card) {
    return { success: false, message: 'このカードは未登録です。先にカード登録をしてください。' };
  }

  const userId = card.supabase_auth_user_id;
  const { data: member } = await supabase
    .schema('member')
    .from('members')
    .select('discord_username')
    .eq('supabase_auth_user_id', userId)
    .maybeSingle();

  return {
    success: true,
    userId,
    displayName: member?.discord_username || '名無しさん',
    message: 'ok',
  };
}

/**
 * 顔登録セッションの状態を取得（kioskがQR経路でポーリング）。
 * face_reg_sessions は service_role のみアクセス可のためサーバアクション経由で読む。
 */
export async function getFaceRegSession(token: string): Promise<{ status: string | null; userId: string | null }> {
  const supabase = await createSupabaseAdminClient();
  const { data } = await (supabase.schema('attendance') as any)
    .from('face_reg_sessions')
    .select('status, user_id, expires_at')
    .eq('qr_token', token)
    .maybeSingle();

  if (!data) return { status: null, userId: null };
  if (new Date(data.expires_at) <= new Date()) return { status: 'expired', userId: null };
  return { status: data.status, userId: data.user_id };
}

/**
 * 顔登録セッションを完了状態にする（キャプチャ完了後にkioskから呼ぶ）。
 */
export async function markFaceRegSessionDone(token: string): Promise<void> {
  const supabase = await createSupabaseAdminClient();
  await (supabase.schema('attendance') as any)
    .from('face_reg_sessions')
    .update({ status: 'done' })
    .eq('qr_token', token);
}

// --- 顔データ（face_encodings）管理 ---
// face_encodings は service_role のみアクセス可のため admin クライアントで操作。
// 自己操作は getOAuthUser の id に限定し、他人のデータは触れない。

type FaceDataSummary = { count: number; latest: string | null; adaptive: number };

async function getFaceDataByUserId(userId: string): Promise<FaceDataSummary> {
  const supabase = await createSupabaseAdminClient();
  const { data } = await (supabase.schema('attendance') as any)
    .from('face_encodings')
    .select('id, is_adaptive, created_at')
    .eq('user_id', userId);
  const rows: { is_adaptive: boolean; created_at: string }[] = data ?? [];
  const latest = rows.reduce<string | null>((m, r) => (!m || r.created_at > m ? r.created_at : m), null);
  return { count: rows.length, latest, adaptive: rows.filter((r) => r.is_adaptive).length };
}

async function deleteFaceDataByUserId(userId: string): Promise<{ success: boolean; message: string; deleted: number }> {
  const supabase = await createSupabaseAdminClient();
  const { data, error } = await (supabase.schema('attendance') as any)
    .from('face_encodings')
    .delete()
    .eq('user_id', userId)
    .select('id');
  if (error) {
    console.error('deleteFaceDataByUserId error:', error);
    return { success: false, message: '顔データの削除に失敗しました。', deleted: 0 };
  }
  return { success: true, message: '顔データを削除しました。', deleted: (data ?? []).length };
}

/** 自分の顔データ件数（プロフィール表示用） */
export async function getMyFaceData(): Promise<FaceDataSummary> {
  const oauthUser = await getOAuthUser();
  if (!oauthUser) return { count: 0, latest: null, adaptive: 0 };
  return getFaceDataByUserId(oauthUser.id);
}

/** 自分の顔データを全削除（本人のみ） */
export async function deleteMyFaceData() {
  const oauthUser = await getOAuthUser();
  if (!oauthUser) return { success: false, message: '認証されていません。', deleted: 0 };
  return deleteFaceDataByUserId(oauthUser.id);
}

/** 指定ユーザーの顔データ件数（管理者用） */
export async function getFaceDataForUser(userId: string): Promise<FaceDataSummary> {
  await requireAdmin();
  return getFaceDataByUserId(userId);
}

/** 指定ユーザーの顔データを全削除（管理者用） */
export async function deleteFaceDataForUser(userId: string) {
  await requireAdmin();
  return deleteFaceDataByUserId(userId);
}

export async function getNickname(discordId: string): Promise<string | null> {
  await requireServerAuth();
  const { data } = await fetchMemberNickname(discordId);
  return data;
}

export async function getTempRegistration(token: string) {
    const supabase = await createSupabaseAdminClient();
    const { data, error } = await supabase
        .schema('attendance')
        .from('temp_registrations')
        .select('*')
        .eq('qr_token', token)
        .single();
    if (error || !data) return null;

    if (!data.accessed_at) {
        await supabase.schema('attendance').from('temp_registrations').update({ accessed_at: new Date().toISOString() }).eq('id', data.id);
    }

    return data;
}

export async function completeRegistration(formData: FormData) {
  const token = formData.get('token') as string;

  if (!token) {
    return redirect(`/register/${token}?error=Missing token`);
  }

  const adminSupabase = await createSupabaseAdminClient();

  // STEM OAuth で認証チェック
  const oauthUser = await getOAuthUser();
  if (!oauthUser) {
    return redirect(`/register/${token}?error=Not authenticated`);
  }

  // 部員プロファイルを直接DBで確認（HTTP APIを介さず確実に）
  const { data: memberProfile } = await adminSupabase
    .schema('member')
    .from('members')
    .select('supabase_auth_user_id')
    .eq('supabase_auth_user_id', oauthUser.id)
    .is('deleted_at', null)
    .single();

  if (!memberProfile) {
    console.warn(`Attempted registration for non-existent member profile: ${oauthUser.id}`);
    return redirect(`/register/${token}?error=${encodeURIComponent('ユーザープロファイルが中央DBに存在しません。管理者に連絡してください。')}`);
  }

  const { data: tempReg, error: tempRegError } = await adminSupabase
    .schema('attendance')
    .from('temp_registrations')
    .select('*')
    .eq('qr_token', token)
    .single();

  if (tempRegError || !tempReg) {
    return redirect(`/register/${token}?error=Invalid session`);
  }
  if (tempReg.is_used) {
    return redirect(`/register/${token}?error=Session already used`);
  }
  if (new Date(tempReg.expires_at) < new Date()) {
    return redirect(`/register/${token}?error=Session expired`);
  }
  
  const newCardId = tempReg.card_id;

  // attendance.users 行が既にあるか確認
  const { data: existingAttUser } = await adminSupabase
    .schema('attendance')
    .from('users')
    .select('supabase_auth_user_id')
    .eq('supabase_auth_user_id', oauthUser.id)
    .single();

  if (existingAttUser) {
    // 既存ユーザー: attendance.users は変更せず user_cards に直接追加（既存カードを保持）
    const { error: insertCardError } = await adminSupabase
      .schema('attendance')
      .from('user_cards')
      .insert({ supabase_auth_user_id: oauthUser.id, card_id: newCardId });
    if (insertCardError) {
      console.error("Error adding card to user_cards:", insertCardError);
      return redirect(`/register/${token}?error=${encodeURIComponent('このカードは既に使用されています。')}`);
    }
  } else {
    // 新規ユーザー: attendance.users を作成（トリガーが user_cards へ自動同期）
    const { error: insertUserError } = await adminSupabase
      .schema('attendance')
      .from('users')
      .insert({ supabase_auth_user_id: oauthUser.id, card_id: newCardId });
    if (insertUserError) {
      console.error("Error creating attendance user link:", insertUserError);
      return redirect(`/register/${token}?error=Failed to link card to user.`);
    }
  }
  
  await adminSupabase.schema('attendance').from('temp_registrations').update({ is_used: true }).eq('id', tempReg.id);

  revalidatePath('/admin');
  revalidatePath(`/register/${token}`, 'layout');
  redirect(`/register/${token}?success=true&newCardId=${newCardId}`);
}


export async function signInWithDiscord(formData?: FormData) {
    const supabase = await createSupabaseServerClient();
    const next = formData?.get('next') as string | undefined;
    
    console.log('[AUTH SIGNIN] ========================================');
    console.log('[AUTH SIGNIN] Timestamp:', new Date().toISOString());
    console.log('[AUTH SIGNIN] Next parameter:', next);
    
    // 登録ページから来た場合、nextパラメータをCookieに保存
    if (next) {
        const cookieStore = await cookies();
        cookieStore.set('auth_next', next, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 600, // 10分
            path: '/'
        });
        console.log('[AUTH SIGNIN] Saved auth_next cookie:', next);
    }
    
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;
    console.log('[AUTH SIGNIN] Redirect URL:', redirectTo);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo,
            scopes: 'identify',
        },
    });

    if (error) {
        console.error('[AUTH SIGNIN] ❌ OAuth initiation failed');
        console.error('[AUTH SIGNIN] Error name:', error.name);
        console.error('[AUTH SIGNIN] Error message:', error.message);
        console.error('[AUTH SIGNIN] Error status:', error.status);
        console.error('[AUTH SIGNIN] Error code:', error.code);
        console.error('[AUTH SIGNIN] Full error:', JSON.stringify(error, null, 2));
        console.log('[AUTH SIGNIN] ========================================');
        return redirect('/login?error=Could not authenticate with Discord.');
    }

    console.log('[AUTH SIGNIN] ✅ OAuth URL generated');
    console.log('[AUTH SIGNIN] OAuth URL:', data.url);
    console.log('[AUTH SIGNIN] ========================================');

    if (data.url) {
        redirect(data.url);
    }
}

export async function signOut() {
    // OAuth cookie をクリア
    const cookieStore = await cookies();
    cookieStore.delete('oauth_access_token');
    cookieStore.delete('oauth_user_id');

    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return redirect('/login');
}

export async function getMonthlyAttendance(userId: string, month: Date) {
  try { await requireServerAuth(); } catch { return []; }
  const supabase = await createSupabaseAdminClient();
  const zonedMonth = toZonedTime(month, timeZone);
  const start = startOfMonth(zonedMonth);
  const end = endOfMonth(zonedMonth);

  const { data: attendances, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('date, type')
    .eq('user_id', userId)
    .gte('date', formatDate(start, 'yyyy-MM-dd'))
    .lte('date', formatDate(end, 'yyyy-MM-dd'))
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching monthly attendance:', error);
    return [];
  }

  const dailyStatus: Record<string, 'in' | 'out' | 'mixed'> = {};
  attendances.forEach(att => {
    if (!att.date) return;
    if (att.type === 'in') {
        dailyStatus[att.date] = 'in';
    } else if (!dailyStatus[att.date]) {
        dailyStatus[att.date] = 'out';
    }
  });

  return Object.keys(dailyStatus)
    .filter(date => dailyStatus[date] === 'in')
    .map(date => ({
        date,
        status: 'in' as const
  }));
}

export async function getAttendanceDayRecords(userId: string, date: string): Promise<{ type: string; timestamp: string }[]> {
  try { await requireServerAuth(); } catch { return []; }
  const supabase = await createSupabaseAdminClient();
  const { data, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('type, timestamp')
    .eq('user_id', userId)
    .eq('date', date)
    .order('timestamp');
  if (error) return [];
  return data ?? [];
}

export async function getMonthlyAttendanceSummary(month: Date) {
  try { await requireServerAuth(); } catch { return {}; }
  const supabase = await createSupabaseAdminClient();
  const start = formatDate(startOfMonth(month), 'yyyy-MM-dd');
  const end = formatDate(endOfMonth(month), 'yyyy-MM-dd');

  const { data, error } = await (supabase as any).rpc('get_monthly_attendance_summary', { start_date: start, end_date: end });

  if (error) {
    console.error('Error fetching monthly attendance summary:', error);
    return {};
  }

  type DailySummary = {
    total: number;
    byTeam: Record<string, { name: string; total: number; byGeneration: Record<number, number> }>;
  };

  const summary: Record<string, DailySummary> = {};

  if (data) {
    for (const record of (data as any[])) {
        const { date, team_id, team_name, generation, count } = record;
        if (!date || !team_id || !team_name || count === null) continue;

        const dateKey = formatDate(new Date(date), 'yyyy-MM-dd');

        if (!summary[dateKey]) {
            summary[dateKey] = { total: 0, byTeam: {} };
        }
        
        if (!summary[dateKey].byTeam[team_id]) {
            summary[dateKey].byTeam[team_id] = { name: team_name, total: 0, byGeneration: {} };
        }
        
        summary[dateKey].total += count;
        summary[dateKey].byTeam[team_id].total += count;
        if(generation !== null) {
          summary[dateKey].byTeam[team_id].byGeneration[generation] = (summary[dateKey].byTeam[team_id].byGeneration[generation] || 0) + count;
        }
    }
  }
  return summary;
}


export async function calculateTotalActivityTime(userId: string, days: number): Promise<number> {
  try { await requireServerAuth(); } catch { return 0; }
  const supabase = await createSupabaseAdminClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: attendances, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('type, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', startDate)
    .order('timestamp', { ascending: true });

  if (error || !attendances) {
    console.error('Error fetching attendances for time calculation:', error);
    return 0;
  }

  let totalSeconds = 0;
  let inTime: Date | null = null;

  for (const attendance of attendances) {
    if (attendance.type === 'in') {
      inTime = new Date(attendance.timestamp);
    } else if (attendance.type === 'out' && inTime) {
      const outTime = new Date(attendance.timestamp);
      totalSeconds += differenceInSeconds(outTime, inTime);
      inTime = null; 
    }
  }

  return totalSeconds / 3600;
}

export async function getAllUsersWithStatus() {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const { getMembers } = await import('@/lib/stem-api');

    const [apiMembers, userCardsResult] = await Promise.all([
      getMembers(),
      supabase.schema('attendance').from('user_cards').select('supabase_auth_user_id, card_id'),
    ]);

    const cardMap = new Map<string, string[]>();
    userCardsResult.data?.forEach(uc => {
      const arr = cardMap.get(uc.supabase_auth_user_id) || [];
      arr.push(uc.card_id);
      cardMap.set(uc.supabase_auth_user_id, arr);
    });

    // stem-api が使えない場合は member.members を直接参照
    if (!apiMembers.length) {
      console.warn('[getAllUsersWithStatus] stem-api unavailable, falling back to DB');
      const { data: dbMembers, error: dbError } = await supabase
        .schema('member')
        .from('members')
        .select(`
          supabase_auth_user_id,
          discord_uid,
          discord_username,
          generation,
          is_admin,
          student_number,
          status,
          deleted_at,
          member_team_relations(team_id, teams(id, name))
        `);
      if (dbError || !dbMembers?.length) {
        return { data: [], error: dbError ?? new Error('メンバー一覧を取得できませんでした') };
      }
      const dbMemberIds = dbMembers.map((m: any) => m.supabase_auth_user_id);
      const { data: latestAttendances } = await supabase
        .schema('attendance').from('attendances')
        .select('user_id, type, timestamp')
        .in('user_id', dbMemberIds)
        .order('timestamp', { ascending: false });
      const latestMap = new Map<string, { type: string; timestamp: string }>();
      latestAttendances?.forEach(att => { if (!latestMap.has(att.user_id)) latestMap.set(att.user_id, { type: att.type, timestamp: att.timestamp }); });
      const users = dbMembers.map((member: any) => {
        const latestAttendance = latestMap.get(member.supabase_auth_user_id);
        const teamRelation = member.member_team_relations?.[0];
        return {
          id: member.supabase_auth_user_id,
          display_name: member.discord_username || '不明',
          discord_username: member.discord_username || null,
          card_ids: cardMap.get(member.supabase_auth_user_id) || [],
          team_name: teamRelation?.teams?.name || null,
          team_id: teamRelation?.team_id || null,
          generation: member.generation,
          is_admin: member.is_admin,
          latest_attendance_type: latestAttendance?.type || null,
          latest_timestamp: latestAttendance?.timestamp || null,
          deleted_at: member.deleted_at,
          student_number: member.student_number ?? null,
          status: member.status ?? 0,
        };
      });
      return { data: users, error: null };
    }

    const memberIds = apiMembers.map(m => m.id);

    const { data: latestAttendances } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('user_id, type, timestamp')
      .in('user_id', memberIds)
      .order('timestamp', { ascending: false });

    const latestAttendanceMap = new Map<string, { type: string; timestamp: string }>();
    latestAttendances?.forEach(att => {
      if (!latestAttendanceMap.has(att.user_id)) {
        latestAttendanceMap.set(att.user_id, { type: att.type, timestamp: att.timestamp });
      }
    });

    const users = apiMembers.map((member) => {
      const latestAttendance = latestAttendanceMap.get(member.id);
      const team = member.teams?.[0];
      return {
        id: member.id,
        display_name: member.discord_username || member.display_name || '不明',
        discord_username: member.discord_username || null,
        card_ids: cardMap.get(member.id) || [],
        team_name: team?.name || null,
        team_id: team?.id || null,
        generation: member.generation,
        is_admin: member.is_admin,
        latest_attendance_type: latestAttendance?.type || null,
        latest_timestamp: latestAttendance?.timestamp || null,
        deleted_at: member.deleted_at,
        student_number: member.student_number ?? null,
        status: member.status ?? 0,
      };
    });

    return { data: users, error: null };
}

/**
 * 本名を遅延取得する（チェックボックス押下時に呼ばれる）。
 * DB キャッシュ → Bot API フォールバック。
 * 返り値: { [supabase_auth_user_id]: realName }
 */
/**
 * 本名を Bot API から取得（DBには保存しない）。
 * チェックボックス押下時に呼ばれる。
 */
export async function fetchAllUserRealNames(): Promise<{ data: Record<string, string> | null; error: string | null }> {
    await requireAdmin();
    const { getMembers } = await import('@/lib/stem-api');

    const [members, nameApiResult] = await Promise.all([
      getMembers(),
      fetchAllMemberNames(),
    ]);

    if (!nameApiResult.data) {
        return { data: null, error: 'Bot API からの取得に失敗しました' };
    }

    const nameMap = new Map(nameApiResult.data.map(item => [item.uid, item.name]));
    const result: Record<string, string> = {};

    for (const m of members.filter(m => !m.deleted_at)) {
        if (m.discord_uid) {
            const name = nameMap.get(m.discord_uid);
            if (name) result[m.id] = name;
        }
    }

    return { data: result, error: null };
}

export async function getAllTeams() {
    await requireServerAuth();
    const supabase = await createSupabaseAdminClient();
    const { getTeams } = await import('@/lib/stem-api');
    const apiTeams = await getTeams();
    if (apiTeams.length) {
      return { data: apiTeams.map(t => ({ id: t.id, name: t.name })), error: null };
    }
    // stem-api unavailable: fall back to DB
    const { data: dbTeams, error } = await supabase.schema('member').from('teams').select('id, name');
    return { data: dbTeams?.map(t => ({ id: t.id, name: t.name })) ?? [], error };
}

export async function getTeamsWithMemberStatus() {
    await requireServerAuth();
    const supabase = await createSupabaseAdminClient();
    const { getTeams } = await import('@/lib/stem-api');

    const teams = await getTeams();
    if (!teams.length) return [];

    const allMemberIds = teams.flatMap(t => t.members.map(m => m.id));

    const { data: attendanceUserIds } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .in('supabase_auth_user_id', allMemberIds);

    const userIdsWithCard = attendanceUserIds?.map(u => u.supabase_auth_user_id) ?? [];

    const { data: latestAttendances } = await (supabase as any)
        .rpc('get_latest_attendance_for_users', { user_ids: userIdsWithCard });

    const statusMap = new Map<string, string>();
    (latestAttendances as any[] ?? []).forEach(att => statusMap.set(att.user_id, att.type));

    return teams.map(team => ({
        id: team.id,
        name: team.name,
        current: team.members.filter(m => statusMap.get(m.id) === 'in').length,
        total: team.members.length,
    }));
}


export async function createTeam(name: string) {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase.schema('member').from('teams').insert({ name, discord_role_id: 'temp-id' }); // discord_role_id is not null
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を作成しました。'};
}

export async function updateTeam(id: string, name: string) {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase.schema('member').from('teams').update({ name }).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を更新しました。'};
}

export async function deleteTeam(id: string) {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const { count } = await supabase.schema('member').from('member_team_relations').select('*', { count: 'exact' }).eq('team_id', id);

    if (count && count > 0) {
        return { success: false, message: `この班には${count}人のユーザーが所属しているため、削除できません。` };
    }

    const { error } = await supabase.schema('member').from('teams').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を削除しました。' };
}

export async function forceLogoutAll() {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    
    // 今日の日付を取得
    const now = new Date();
    const todayDate = formatInTimeZone(now, timeZone, 'yyyy-MM-dd');
    
    // 今日出勤した全ユーザーの出勤記録を取得
    const { data: todayAttendances, error: attError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id, card_id, type, timestamp')
        .eq('date', todayDate)
        .order('timestamp', { ascending: false });

    if (attError) {
        console.error('Error fetching today attendances:', attError);
        return { success: false, message: `DBエラー: ${attError.message}` };
    }
    
    // 各ユーザーの最新の出勤記録を取得し、'in'のユーザーのみを抽出
    const userLatestMap = new Map<string, { user_id: string; card_id: string; type: string }>();
    todayAttendances?.forEach(att => {
        if (!userLatestMap.has(att.user_id)) {
            userLatestMap.set(att.user_id, { user_id: att.user_id, card_id: att.card_id, type: att.type });
        }
    });
    
    const usersToLogOut = Array.from(userLatestMap.values()).filter(u => u.type === 'in');

    if (usersToLogOut.length === 0) {
        await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'success' });
        return { success: true, message: '現在活動中のユーザーはいません。', count: 0 };
    }

    const attendanceRecords = usersToLogOut.map(user => ({ user_id: user.user_id, card_id: user.card_id, type: 'out' as const, timestamp: now.toISOString(), date: todayDate }));
    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert(attendanceRecords);

    if (insertError) {
        await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'error' });
        return { success: false, message: insertError.message };
    }

    await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: usersToLogOut.length, status: 'success' });

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    return { success: true, message: `${usersToLogOut.length}人のユーザーを強制退勤させました。`, count: usersToLogOut.length };
}

export async function forceToggleAttendance(userId: string) {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();

    // user_cards から最初の有効カードを取得（なければ admin_force を使用）
    const { data: userCard } = await supabase
        .schema('attendance')
        .from('user_cards')
        .select('card_id')
        .eq('supabase_auth_user_id', userId)
        .limit(1)
        .maybeSingle();

    const cardIdForRecord = userCard?.card_id ?? 'admin_force';

    // attendance.users 行がなければ作成（attendances の FK 制約を満たすため）
    const { data: existingAttUser } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .eq('supabase_auth_user_id', userId)
        .maybeSingle();

    if (!existingAttUser) {
        await supabase
            .schema('attendance')
            .from('users')
            .insert({ supabase_auth_user_id: userId, card_id: `TEMP_${userId}` });
    }

    const { data: lastAttendance, error: lastAttendanceError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('type')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if (lastAttendanceError && lastAttendanceError.code !== 'PGRST116') {
        return { success: false, message: lastAttendanceError.message };
    }

    const newType = lastAttendance?.type === 'in' ? 'out' : 'in';
    const now = new Date();
    const dateInJST = formatInTimeZone(now, timeZone, 'yyyy-MM-dd');

    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert({ user_id: userId, type: newType, card_id: cardIdForRecord, timestamp: now.toISOString(), date: dateInJST });
    if (insertError) {
        return { success: false, message: insertError.message };
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    revalidatePath('/dashboard/layout');
    return { success: true, message: `ユーザーを強制的に${newType === 'in' ? '出勤' : '退勤'}させました。` };
}

export async function getTeamWithMembersStatus(teamId: number) {
    const authUser = await requireServerAuth();
    const { getTeams, getMe } = await import('@/lib/stem-api');

    const [teams, me] = await Promise.all([getTeams(), getMe()]);

    const teamIdStr = String(teamId);
    const team = teams.find(t => String(t.id) === teamIdStr);
    if (!team) return { team: null, members: [], stats: null, error: 'Team not found' };

    // アクセス制御: 管理者またはチームメンバーのみ
    const isAdmin = me?.is_admin || false;
    const isTeamMember = me?.teams.some(t => String(t.id) === teamIdStr) || false;
    if (!isAdmin && !isTeamMember) {
        return { team: null, members: [], stats: null, error: 'Access denied' };
    }

    const memberIds = team.members.map(m => m.id);

    if (memberIds.length === 0) {
        return { team: { id: team.id, name: team.name }, members: [], stats: await getTeamStats(teamIdStr), error: null };
    }

    const supabase = await createSupabaseAdminClient();
    const { data: latestAttendances } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id, type, timestamp')
        .in('user_id', memberIds)
        .order('timestamp', { ascending: false });

    const latestMap = new Map<string, { type: string; timestamp: string }>();
    latestAttendances?.forEach(a => {
        if (!latestMap.has(a.user_id)) latestMap.set(a.user_id, { type: a.type, timestamp: a.timestamp });
    });

    const members = team.members.map(m => {
        const latest = latestMap.get(m.id);
        return {
            id: m.id,
            display_name: m.display_name || '不明',
            generation: m.generation,
            latest_attendance_type: latest?.type || 'out',
            latest_timestamp: latest?.timestamp || null,
        };
    });

    const stats = await getTeamStats(teamIdStr);

    return { team: { id: team.id, name: team.name }, members: members.sort((a,b) => b.generation - a.generation || a.display_name.localeCompare(b.display_name)), stats, error: null };
}


async function getTeamStats(teamId: string) {
    const { getTeams } = await import('@/lib/stem-api');
    const supabase = await createSupabaseAdminClient();
    const today = toZonedTime(new Date(), timeZone);

    const teams = await getTeams();
    const team = teams.find(t => String(t.id) === teamId);
    // OB/OG（status === 2）を除外
    const memberIds = team?.members.filter(m => m.status !== 2).map(m => m.id) || [];
    const totalMembersCount = memberIds.length;
    
    if (memberIds.length === 0) {
      return {
        totalMembers: 0,
        todayAttendees: 0,
        todayAttendanceRate: 0,
        averageAttendanceRate30d: 0,
      }
    }

    const { data: attendanceUsers } = await supabase.schema('attendance').from('users').select('supabase_auth_user_id').in('supabase_auth_user_id', memberIds);
    const attendanceUserIds = attendanceUsers?.map(u => u.supabase_auth_user_id) || [];

    const { data: todayAttendanceData, error: todayAttendanceError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id', { count: 'exact' })
        .eq('type', 'in')
        .eq('date', formatDate(today, 'yyyy-MM-dd'))
        .in('user_id', attendanceUserIds);
    
    const uniqueTodayAttendees = todayAttendanceData ? new Set(todayAttendanceData.map(d => d.user_id)).size : 0;
    
    const attendanceRate = totalMembersCount ? (uniqueTodayAttendees / totalMembersCount) * 100 : 0;

    const avgAttendance = await getMonthlyTeamAttendanceStats(teamId, 30);
    
    return {
        totalMembers: totalMembersCount || 0,
        todayAttendees: uniqueTodayAttendees,
        todayAttendanceRate: attendanceRate,
        averageAttendanceRate30d: avgAttendance,
    };
}


export async function getMonthlyTeamAttendanceStats(teamId: string, days: number): Promise<number> {
    await requireServerAuth();
    const { getTeams } = await import('@/lib/stem-api');
    const supabase = await createSupabaseAdminClient();

    const teams = await getTeams();
    const team = teams.find(t => String(t.id) === teamId);
    // OB/OG（status === 2）を除外
    const memberIds = team?.members.filter(m => m.status !== 2).map(m => m.id) || [];

    if (memberIds.length === 0) return 0;

    const { data: attendanceUsers } = await supabase.schema('attendance').from('users').select('supabase_auth_user_id').in('supabase_auth_user_id', memberIds);
    const attendanceUserIds = attendanceUsers?.map(u => u.supabase_auth_user_id) || [];

    if(attendanceUserIds.length === 0) return 0;
    
    const today = toZonedTime(new Date(), timeZone);
    const startDate = formatDate(subDays(today, days), 'yyyy-MM-dd');
    const endDate = formatDate(today, 'yyyy-MM-dd');

    const { data: activityDays, error: activityDaysError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('date', { count: 'exact' })
        .gte('date', startDate)
        .lte('date', endDate);

    const totalActivityDays = new Set(activityDays?.map(d => d.date)).size;
    if (totalActivityDays === 0) return 0;

    const { data: teamAttendances, error: teamAttendancesError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('date, user_id')
        .in('user_id', attendanceUserIds)
        .eq('type', 'in')
        .gte('date', startDate)
        .lte('date', endDate);

    if (teamAttendancesError || !teamAttendances) return 0;

    const dailyAttendanceCount = teamAttendances.reduce((acc, curr) => {
        if (!curr.date) return acc;
        if (!acc[curr.date]) {
            acc[curr.date] = new Set();
        }
        acc[curr.date].add(curr.user_id);
        return acc;
    }, {} as Record<string, Set<string>>);
    
    const dailyRates = Object.values(dailyAttendanceCount).map(users => (users.size / memberIds.length) * 100);
    const averageRate = dailyRates.length > 0 ? dailyRates.reduce((sum, rate) => sum + rate, 0) / dailyRates.length : 0;

    return averageRate;
}

export async function getAllDailyLogoutLogs() {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('attendance')
        .from('daily_logout_logs')
        .select('*')
        .order('executed_at', { ascending: false });
}

export async function getTempRegistrations() {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    return supabase.schema('attendance').from('temp_registrations').select('*').order('created_at', { ascending: false });
}

export async function deleteTempRegistration(id: string) {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase.schema('attendance').from('temp_registrations').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: '仮登録を削除しました。' };
}

export async function updateAllUserDisplayNames(): Promise<{ success: boolean, message: string, count: number }> {
    await requireAdmin();
    const { getMembers } = await import('@/lib/stem-api');
    const supabase = await createSupabaseAdminClient();

    const users = await getMembers();
    if (!users.length) {
        return { success: false, message: '更新対象のユーザーが見つかりません。', count: 0 };
    }

    const nameApiResult = await fetchAllMemberNames();
    if (!nameApiResult.data) {
        const detail = typeof nameApiResult.error === 'string' ? nameApiResult.error : JSON.stringify(nameApiResult.error);
        return { success: false, message: `Bot APIからの取得に失敗: ${detail}`, count: 0 };
    }

    // Bot API から discord_username を取得して更新（本名はDBに保存しない）
    const usernameMap = new Map<string, string>(
        nameApiResult.data.filter(item => item.username).map(item => [item.uid, item.username!])
    );
    let updatedCount = 0;
    const errors: string[] = [];

    for (const user of users) {
        if (!user.discord_uid) continue;
        const username = usernameMap.get(user.discord_uid);
        if (username && username !== user.discord_username) {
            const { error: updateError } = await supabase
                .schema('member')
                .from('members')
                .update({ discord_username: username })
                .eq('supabase_auth_user_id', user.id);

            if (updateError) {
                errors.push(`ID ${user.id} の更新に失敗: ${updateError.message}`);
            } else {
                updatedCount++;
            }
        }
    }

    if (errors.length > 0) {
        return { success: false, message: `いくつかの更新に失敗しました: ${errors.join(', ')}`, count: updatedCount };
    }

    revalidatePath('/admin/users');
    revalidatePath('/dashboard');
    return { success: true, message: `${updatedCount}人のDiscordユーザー名を更新しました。`, count: updatedCount };
}

export async function getOverallStats(days: number = 30) {
    try { await requireServerAuth(); } catch {
        return { todayActiveUsers: 0, totalMembers: 0, activeDaysCount: 0, totalActivityHours: 0 };
    }
    const supabase = await createSupabaseAdminClient();
    const { getMembers } = await import('@/lib/stem-api');
    const today = toZonedTime(new Date(), timeZone);
    const startDate = formatDate(subDays(today, days), 'yyyy-MM-dd');
    const todayStr = formatDate(today, 'yyyy-MM-dd');

    const [members, usersWithCardResult, distinctDatesResult, allAttendancesResult] = await Promise.all([
      getMembers(),
      supabase.schema('attendance').from('user_cards').select('supabase_auth_user_id'),
      supabase.schema('attendance').from('attendances').select('date').gte('date', startDate),
      supabase.schema('attendance').from('attendances').select('user_id, type, timestamp').gte('date', startDate).order('user_id').order('timestamp', { ascending: true }),
    ]);

    const userIdsWithCard = usersWithCardResult.data?.map(u => u.supabase_auth_user_id) || [];
    const activeMembers = members.filter(m => m.status !== 2 && !m.deleted_at);
    const totalMembers = activeMembers.filter(m => userIdsWithCard.includes(m.id)).length;

    const todayInRecords = allAttendancesResult.data?.filter(a => {
      const attDateStr = formatDate(toZonedTime(new Date(a.timestamp), timeZone), 'yyyy-MM-dd');
      return attDateStr === todayStr && a.type === 'in' && userIdsWithCard.includes(a.user_id);
    });
    const todayActiveUsers = todayInRecords ? new Set(todayInRecords.map(a => a.user_id)).size : 0;
    const activeDaysCount = distinctDatesResult.data ? new Set(distinctDatesResult.data.map(d => d.date)).size : 0;

    let totalActivityHours = 0;
    if (allAttendancesResult.data) {
        const userSessions = new Map<string, Date | null>();
        for (const att of allAttendancesResult.data) {
            if (att.type === 'in') {
                userSessions.set(att.user_id, new Date(att.timestamp));
            } else if (att.type === 'out') {
                const inTime = userSessions.get(att.user_id);
                if (inTime) {
                    totalActivityHours += differenceInSeconds(new Date(att.timestamp), inTime) / 3600;
                    userSessions.set(att.user_id, null);
                }
            }
        }
    }

    return {
        todayActiveUsers,
        totalMembers: totalMembers || 0,
        activeDaysCount,
        totalActivityHours: Math.round(totalActivityHours * 10) / 10,
    };
}

export async function getDailyAttendanceCounts(year: number, month: number) {
    try { await requireServerAuth(); } catch { return {}; }
    const supabase = await createSupabaseAdminClient();
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));
    
    const { data, error } = await (supabase as any).rpc('get_daily_attendance_counts_for_month', { 
        start_date: formatDate(start, 'yyyy-MM-dd'),
        end_date: formatDate(end, 'yyyy-MM-dd')
    });
        
    if (error) {
        console.error('Error fetching daily attendance counts:', error);
        return {};
    }
    
    const result: Record<string, number> = {};
    data?.forEach((row: { date: string, count: number }) => {
        if(row.date) {
            const zonedDate = toZonedTime(new Date(row.date), timeZone);
            result[formatDate(zonedDate, 'yyyy-MM-dd')] = row.count;
        }
    });

    return result;
}

export async function getDailyAttendanceDetails(date: string) {
    try { await requireServerAuth(); } catch { return { byTeam: {}, byGrade: {}, byTeamAndGrade: {}, total: 0 }; }
    const supabase = await createSupabaseAdminClient();

    const { data: attendanceData, error: attendanceError } = await (supabase as any)
        .rpc('get_daily_attendance_details', { for_date: date });


    if (attendanceError) {
        console.error("Error fetching daily attendance details:", attendanceError);
        return { byTeam: {}, byGrade: {}, byTeamAndGrade: {}, total: 0 };
    }

    const byTeam: Record<string, number> = {};
    const byGrade: Record<string, number> = {};
    const byTeamAndGrade: Record<string, Record<string, number>> = {};
    let total = 0;

    attendanceData?.forEach((row: any) => {
        const teamName = row.team_name || '未所属';
        const grade = row.generation ? `${row.generation}期` : '不明';
        const count = row.user_count;
        total += count;

        byTeam[teamName] = (byTeam[teamName] || 0) + count;
        byGrade[grade] = (byGrade[grade] || 0) + count;
        if (!byTeamAndGrade[teamName]) {
            byTeamAndGrade[teamName] = {};
        }
        byTeamAndGrade[teamName][grade] = (byTeamAndGrade[teamName][grade] || 0) + count;
    });

    return {
        byTeam,
        byGrade,
        byTeamAndGrade,
        total,
    };
}


export async function addUserCard(userId: string, cardId: string): Promise<{ success: boolean; message: string }> {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

    // 他ユーザーとの重複チェック
    const { data: existing } = await supabase
        .schema('attendance')
        .from('user_cards')
        .select('supabase_auth_user_id')
        .eq('card_id', normalizedCardId)
        .single();

    if (existing) {
        return { success: false, message: 'このカードIDは既に使用されています。' };
    }

    // attendance.users 行がなければ作成（トリガーが user_cards に自動同期）
    const { data: existingUser } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .eq('supabase_auth_user_id', userId)
        .single();

    if (!existingUser) {
        const { error } = await supabase
            .schema('attendance')
            .from('users')
            .insert({ supabase_auth_user_id: userId, card_id: normalizedCardId });
        if (error) {
            return { success: false, message: `カードの追加に失敗しました: ${error.message}` };
        }
    } else {
        const { error } = await supabase
            .schema('attendance')
            .from('user_cards')
            .insert({ supabase_auth_user_id: userId, card_id: normalizedCardId });
        if (error) {
            return { success: false, message: `カードの追加に失敗しました: ${error.message}` };
        }
    }

    revalidatePath('/admin');
    return { success: true, message: 'カードを追加しました。' };
}

export async function removeUserCard(userId: string, cardId: string): Promise<{ success: boolean; message: string }> {
    await requireAdmin();
    const supabase = await createSupabaseAdminClient();
    const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

    const { error } = await supabase
        .schema('attendance')
        .from('user_cards')
        .delete()
        .eq('supabase_auth_user_id', userId)
        .eq('card_id', normalizedCardId);

    if (error) {
        return { success: false, message: `カードの削除に失敗しました: ${error.message}` };
    }

    revalidatePath('/admin');
    return { success: true, message: 'カードを削除しました。' };
}


export async function checkDiscordMembership(discordUid: string) {
    'use server';
    
    await requireAdmin();
    try {
        const API_BASE = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
        const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;
        
        if (!API_BASE || !API_TOKEN) {
            return { success: false, isInServer: false, message: 'Discord Bot APIの設定が見つかりません。' };
        }
        
        const response = await fetch(`${API_BASE}/api/member/status?discord_uid=${discordUid}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
            },
        });
        
        if (!response.ok) {
            return { success: false, isInServer: false, message: 'Discord APIへの接続に失敗しました。' };
        }
        
        const data = await response.json();
        
        return { 
            success: true, 
            isInServer: data.is_in_server,
            nickname: data.current_nickname,
            roles: data.current_roles
        };
    } catch (error) {
        console.error('Discord membership check error:', error);
        return { success: false, isInServer: false, message: 'Discordサーバーの確認に失敗しました。' };
    }
}
