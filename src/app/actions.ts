

'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
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

  // display_name がDBにない場合、Discord Bot APIから取得してDBにも保存
  if (result.success && result.user && !result.user.display_name && result.user.discord_uid) {
    const nicknameStart = Date.now();
    const { data: nickname } = await fetchMemberNickname(result.user.discord_uid);
    console.log(`[RECORD_ATTENDANCE:${traceId}] Nickname API fallback: ${Date.now() - nicknameStart}ms`);
    if (nickname) {
      result.user.display_name = nickname;
      // DBにもキャッシュ保存（非同期、レスポンスは待たない）
      supabase.schema('member').from('members')
        .update({ display_name: nickname })
        .eq('discord_uid', result.user.discord_uid)
        .then(() => console.log(`[RECORD_ATTENDANCE:${traceId}] Cached display_name for ${result.user!.discord_uid}`));
    }
  }
  if (result.user && !result.user.display_name) {
    result.user.display_name = '名無しさん';
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[RECORD_ATTENDANCE:${traceId}] ${result.success ? 'Success' : 'Failed'} - ${result.type} (${totalDuration}ms) - User: ${result.user?.display_name}`);

  if (result.success) {
    revalidatePath('/dashboard/teams');
  }

  // discord_uid をクライアントに返さない
  const { discord_uid, ...userWithoutDiscordUid } = result.user || { discord_uid: null };
  return { ...result, user: result.user ? userWithoutDiscordUid : null };
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
  const { data: existingUser, error: existingUserError } = await supabase
    .schema('attendance')
    .from('users')
    .select('supabase_auth_user_id')
    .eq('card_id', normalizedCardId)
    .single();
  console.log(`[CREATE_TEMP_REG:${traceId}] User lookup: ${Date.now() - existingStart}ms`);

  if (existingUserError && existingUserError.code !== 'PGRST116') { // Ignore "No rows found" error
    console.error(`[CREATE_TEMP_REG:${traceId}] Error checking for existing card:`, existingUserError);
    return { success: false, message: "カード情報の確認中にデータベースエラーが発生しました。" };
  }
  
  if (existingUser) {
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

export async function getTempRegistration(token: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
        .schema('attendance')
        .from('temp_registrations')
        .select('*')
        .eq('qr_token', token)
        .single();
    if (error || !data) return null;

    if (!data.accessed_at) {
        const admin = await createSupabaseAdminClient();
        await admin.schema('attendance').from('temp_registrations').update({ accessed_at: new Date().toISOString() }).eq('id', data.id);
    }

    return data;
}

export async function completeRegistration(formData: FormData) {
  const token = formData.get('token') as string;

  if (!token) {
    return redirect(`/register/${token}?error=Missing token`);
  }

  const supabase = await createSupabaseServerClient();
  const adminSupabase = await createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.user_metadata.provider_id) {
    return redirect(`/register/${token}?error=Not authenticated`);
  }
  
  const { data: member, error: memberError } = await adminSupabase
    .schema('member')
    .from('members')
    .select('supabase_auth_user_id')
    .eq('supabase_auth_user_id', user.id)
    .single();

  if (memberError && memberError.code !== 'PGRST116') {
      console.error("Error fetching member profile:", memberError);
      return redirect(`/register/${token}?error=ユーザープロファイルの取得中にエラーが発生しました。`);
  }
  if (!member) {
    console.warn(`Attempted registration for non-existent member profile: ${user.id}`);
    // ここでユーザープロファイルを作成する、またはエラーを返す
    // 今回はエラーを返す
     return redirect(`/register/${token}?error=ユーザープロファイルが中央DBに存在しません。管理者に連絡してください。`);
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
  
  const { error: insertAttendanceUserError } = await adminSupabase
    .schema('attendance')
    .from('users')
    .upsert(
      { 
        supabase_auth_user_id: user.id,
        card_id: newCardId
      }, 
      { onConflict: 'supabase_auth_user_id' }
    );
  if (insertAttendanceUserError) {
      console.error("Error creating attendance user link:", insertAttendanceUserError);
      return redirect(`/register/${token}?error=Failed to link card to user.`);
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

export async function getMonthlyAttendanceSummary(month: Date) {
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
  const supabase = await createSupabaseServerClient();
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
    const supabase = await createSupabaseAdminClient();

    // メンバー、勤怠ユーザー、名前を全て並列取得
    const [membersResult, attendanceUsersResult, nameApiResult] = await Promise.all([
      supabase
        .schema('member')
        .from('members')
        .select(`
            supabase_auth_user_id,
            discord_uid,
            generation,
            is_admin,
            student_number,
            status,
            deleted_at,
            display_name,
            member_team_relations(team_id, teams(name))
        `),
      supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id, card_id'),
      fetchAllMemberNames(),
    ]);

    const { data: members, error: membersError } = membersResult;

    if (membersError) {
        console.error('Error fetching members:', membersError);
        return { data: [], error: membersError };
    }

    const cardMap = new Map(attendanceUsersResult.data?.map(u => [u.supabase_auth_user_id, u.card_id]) || []);

    // バッチAPIの結果からnameMapを構築（N+1 APIコール排除）
    const nameMap = new Map<string, string>();
    if (nameApiResult.data) {
        nameApiResult.data.forEach(item => {
            nameMap.set(item.uid, item.name);
        });
    }

    const memberIds = members?.map(m => m.supabase_auth_user_id) || [];

    const { data: latestAttendances } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('user_id, type, timestamp')
      .in('user_id', memberIds)
      .order('timestamp', { ascending: false });

    // 各ユーザーごとに最新の記録を取得
    const latestAttendanceMap = new Map<string, { type: string; timestamp: string }>();
    if (latestAttendances) {
      latestAttendances.forEach(att => {
        if (!latestAttendanceMap.has(att.user_id)) {
          latestAttendanceMap.set(att.user_id, { type: att.type, timestamp: att.timestamp });
        }
      });
    }

    const users = members?.map((member: any) => {
        const latestAttendance = latestAttendanceMap.get(member.supabase_auth_user_id);
        const teamRelation = member.member_team_relations?.[0];
        // DB display_name → バッチAPI名 → 名無しさん
        const realName = member.display_name
            || (member.discord_uid ? nameMap.get(member.discord_uid) : null);

        return {
            id: member.supabase_auth_user_id,
            display_name: realName || '名無しさん',
            card_id: cardMap.get(member.supabase_auth_user_id) || null,
            team_name: teamRelation?.teams?.name || null,
            team_id: teamRelation?.team_id || null,
            generation: member.generation,
            is_admin: member.is_admin,
            latest_attendance_type: latestAttendance?.type || null,
            latest_timestamp: latestAttendance?.timestamp || null,
            deleted_at: member.deleted_at,
            student_number: member.student_number,
            status: member.status ?? 0,
        };
    }) || [];

    return { data: users, error: null };
}

export async function getAllTeams() {
    const supabase = await createSupabaseAdminClient();
    return supabase.schema('member').from('teams').select('*').order('name');
}

export async function getTeamsWithMemberStatus() {
    const supabase = await createSupabaseAdminClient();

    // チームとメンバーリレーションを並列取得
    const [teamsResult, relationsResult] = await Promise.all([
      supabase.schema('member').from('teams').select('id, name').order('name'),
      supabase.schema('member').from('member_team_relations').select('member_id, team_id'),
    ]);

    const { data: teams, error: teamsError } = teamsResult;
    if (teamsError) return [];

    const { data: memberTeamRelations, error: usersError } = relationsResult;
    if (usersError || !memberTeamRelations) return teams.map(t => ({ ...t, current: 0, total: 0 }));

    const userIds = memberTeamRelations.map(u => u.member_id);

    const { data: attendanceUserIds, error: attendanceUsersError } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .in('supabase_auth_user_id', userIds);

    if (attendanceUsersError) return [];

    const userIdsWithCard = attendanceUserIds.map(u => u.supabase_auth_user_id);

    const { data: latestAttendances } = await (supabase as any)
        .rpc('get_latest_attendance_for_users', { user_ids: userIdsWithCard });

    const statusMap = new Map<string, string>();
    if (latestAttendances) {
        (latestAttendances as any[]).forEach(att => {
            statusMap.set(att.user_id, att.type);
        });
    }

    const memberStatusByTeam = memberTeamRelations.reduce((acc, relation) => {
        if (!relation.team_id) return acc;
        if (!acc[relation.team_id]) {
            acc[relation.team_id] = { current: 0, total: 0 };
        }
        acc[relation.team_id].total++;
        if (statusMap.get(relation.member_id) === 'in') {
            acc[relation.team_id].current++;
        }
        return acc;
    }, {} as Record<string, { current: number; total: number }>);

    return teams.map(team => ({
        ...team,
        ...memberStatusByTeam[team.id] || { current: 0, total: 0 },
    }));
}


export async function createTeam(name: string) {
    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase.schema('member').from('teams').insert({ name, discord_role_id: 'temp-id' }); // discord_role_id is not null
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を作成しました。'};
}

export async function updateTeam(id: number, name: string) {
    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase.schema('member').from('teams').update({ name }).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を更新しました。'};
}

export async function deleteTeam(id: number) {
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
    const supabase = await createSupabaseAdminClient();

    const { data: attendanceUser, error: attUserError } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id, card_id')
        .eq('supabase_auth_user_id', userId)
        .single();
    
    if (attUserError || !attendanceUser) {
        return { success: false, message: '勤怠ユーザーが見つかりません。' };
    }

    const { data: lastAttendance, error: lastAttendanceError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('type')
        .eq('user_id', attendanceUser.supabase_auth_user_id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if(lastAttendanceError && lastAttendanceError.code !== 'PGRST116') { // Not an error if no rows found
        return { success: false, message: lastAttendanceError.message };
    }

    const newType = lastAttendance?.type === 'in' ? 'out' : 'in';
    const now = new Date();
    const dateInJST = formatInTimeZone(now, timeZone, 'yyyy-MM-dd');

    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert({ user_id: attendanceUser.supabase_auth_user_id, type: newType, card_id: attendanceUser.card_id, timestamp: now.toISOString(), date: dateInJST });
    if(insertError) {
        return { success: false, message: insertError.message };
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    revalidatePath('/dashboard/layout');
    return { success: true, message: `ユーザーを強制的に${newType === 'in' ? '出勤' : '退勤'}させました。` };
}

export async function getTeamWithMembersStatus(teamId: number) {
    const supabase = await createSupabaseAdminClient();
    const { data: { user } } = await (await createSupabaseServerClient()).auth.getUser();
    if (!user) return { team: null, members: [], stats: null, error: 'Not authenticated' };
    
    const { data: profile } = await supabase.schema('member').from('members').select('is_admin, member_team_relations!inner(team_id)').eq('supabase_auth_user_id', user.id).single();

    if (!profile?.is_admin && !profile?.member_team_relations.some(rel => rel.team_id === teamId)) {
        return { team: null, members: [], stats: null, error: 'Access denied' };
    }

    const { data: team, error: teamError } = await supabase.schema('member').from('teams').select('*').eq('id', String(teamId)).single();
    if(teamError || !team) return { team: null, members: [], stats: null, error: teamError?.message };

    const { data, error: membersError } = await (supabase.schema('member') as any)
        .from('users_with_latest_attendance_and_team')
        .select(`
            id,
            display_name,
            generation,
            latest_attendance_type,
            latest_timestamp
        `)
        .eq('team_id', String(teamId));
    
    if (membersError || !data) {
        console.error("Error fetching team members with status:", membersError);
        return { team, members: [], stats: null, error: membersError?.message || 'Failed to fetch members' };
    }

    const members = (data as any[]).map(m => ({
        id: m.id,
        display_name: m.display_name,
        generation: m.generation,
        latest_attendance_type: m.latest_attendance_type || 'out',
        latest_timestamp: m.latest_timestamp || null,
    }));
    
    const stats = await getTeamStats(teamId as any);

    return { team, members: members.sort((a,b) => b.generation - a.generation || a.display_name.localeCompare(b.display_name)), stats: stats, error: null };
}


async function getTeamStats(teamId: string) {
    const supabase = await createSupabaseAdminClient();
    const today = toZonedTime(new Date(), timeZone);

    // OB/OG（status === 2）を除外してチームメンバーを取得
    const { data: teamMemberRelations } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('member_id, members!inner(status)')
        .eq('team_id', teamId)
        .neq('members.status', 2);
    
    const memberIds = teamMemberRelations?.map(m => m.member_id) || [];
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
    const supabase = await createSupabaseAdminClient();
    // OB/OG（status === 2）を除外
    const { data: teamMembers, error: teamMembersError } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('member_id, members!inner(status)')
        .eq('team_id', teamId)
        .neq('members.status', 2);

    if (teamMembersError || !teamMembers || teamMembers.length === 0) return 0;
    
    const memberIds = teamMembers.map(m => m.member_id);

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
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('attendance')
        .from('daily_logout_logs')
        .select('*')
        .order('executed_at', { ascending: false });
}

export async function getTempRegistrations() {
    const supabase = await createSupabaseAdminClient();
    return supabase.schema('attendance').from('temp_registrations').select('*').order('created_at', { ascending: false });
}

export async function deleteTempRegistration(id: string) {
    const supabase = await createSupabaseAdminClient();
    const { error } = await supabase.schema('attendance').from('temp_registrations').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: '仮登録を削除しました。' };
}

export async function updateAllUserDisplayNames(): Promise<{ success: boolean, message: string, count: number }> {
    const supabase = await createSupabaseAdminClient();

    const { data: users, error: usersError } = await supabase
        .schema('member')
        .from('members')
        .select('supabase_auth_user_id, discord_uid');

    if (usersError) {
        return { success: false, message: `ユーザーの取得に失敗しました: ${usersError.message}`, count: 0 };
    }
    if (!users) {
        return { success: false, message: '更新対象のユーザーが見つかりません。', count: 0 };
    }

    const nameApiResult = await fetchAllMemberNames();
    if (!nameApiResult.data) {
        return { success: false, message: 'APIからの名前リストの取得に失敗しました。', count: 0 };
    }

    const nameMap = new Map<string, string>(nameApiResult.data.map(item => [item.uid, item.name]));
    let updatedCount = 0;
    const errors: string[] = [];

    for (const user of users) {
        if (!user.discord_uid) continue;
        const newName = nameMap.get(user.discord_uid);
        if (newName) {
            const { error: updateError } = await supabase
                .schema('member')
                .from('members')
                .update({ display_name: newName })
                .eq('supabase_auth_user_id', user.supabase_auth_user_id);

            if (updateError) {
                errors.push(`ID ${user.supabase_auth_user_id} の更新に失敗: ${updateError.message}`);
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
    return { success: true, message: `${updatedCount}人のユーザー表示名を正常に更新しました。`, count: updatedCount };
}

export async function getOverallStats(days: number = 30) {
    const supabase = await createSupabaseAdminClient();
    const today = toZonedTime(new Date(), timeZone);
    const startDate = formatDate(subDays(today, days), 'yyyy-MM-dd');
    const todayStr = formatDate(today, 'yyyy-MM-dd');

    // 初期クエリを並列実行
    const [usersWithCardResult, activeMembersResult, distinctDatesResult, allAttendancesResult] = await Promise.all([
      supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .not('card_id', 'is', null)
        .neq('card_id', ''),
      supabase
        .schema('member')
        .from('members')
        .select('supabase_auth_user_id')
        .neq('status', 2)
        .is('deleted_at', null),
      supabase
        .schema('attendance')
        .from('attendances')
        .select('date')
        .gte('date', startDate),
      supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id, type, timestamp')
        .gte('date', startDate)
        .order('user_id')
        .order('timestamp', { ascending: true }),
    ]);

    const userIdsWithCard = usersWithCardResult.data?.map(u => u.supabase_auth_user_id) || [];

    // 今日の出勤者を取得（userIdsWithCardに依存するが、上記と並列化するためallAttendancesからフィルタ）
    const todayAttendances = allAttendancesResult.data?.filter(
      a => a.type === 'in' && userIdsWithCard.includes(a.user_id)
    );
    // 今日のデータはdistinctDatesからも推定できるが、正確にはtodayの出勤者を計算
    const todayInRecords = allAttendancesResult.data?.filter(a => {
      const attDate = new Date(a.timestamp);
      const attDateStr = formatDate(toZonedTime(attDate, timeZone), 'yyyy-MM-dd');
      return attDateStr === todayStr && a.type === 'in' && userIdsWithCard.includes(a.user_id);
    });
    const todayActiveUsers = todayInRecords ? new Set(todayInRecords.map(a => a.user_id)).size : 0;

    const activeMemberIds = activeMembersResult.data?.map(m => m.supabase_auth_user_id) || [];
    const totalMembers = activeMemberIds.filter(id => userIdsWithCard.includes(id)).length;

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
                    const duration = differenceInSeconds(new Date(att.timestamp), inTime) / 3600;
                    totalActivityHours += duration;
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
    const supabase = await createSupabaseAdminClient();

    const { data: attendanceData, error: attendanceError } = await supabase
        .rpc('get_daily_attendance_details', { for_date: date });


    if (attendanceError) {
        console.error("Error fetching daily attendance details:", attendanceError);
        return { byTeam: {}, byGrade: {}, byTeamAndGrade: {}, total: 0 };
    }

    const byTeam: Record<string, number> = {};
    const byGrade: Record<string, number> = {};
    const byTeamAndGrade: Record<string, Record<string, number>> = {};
    let total = 0;

    attendanceData?.forEach(row => {
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


export async function updateUserCardId(userId: string, newCardId: string) {
    const supabase = await createSupabaseAdminClient();
    
    const normalizedCardId = newCardId.replace(/:/g, '').toLowerCase();
    
    // 同じカードIDが既に別のユーザーに登録されていないか確認
    const { data: existingCard } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .eq('card_id', normalizedCardId)
        .single();
    
    if (existingCard && existingCard.supabase_auth_user_id !== userId) {
        return { success: false, message: 'このカードIDは既に別のユーザーに登録されています。' };
    }
    
    // ユーザーがattendance.usersテーブルに存在するか確認
    const { data: existingUser } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .eq('supabase_auth_user_id', userId)
        .single();
    
    let error;
    if (existingUser) {
        // 既存ユーザーの場合はupdate
        const result = await supabase
            .schema('attendance')
            .from('users')
            .update({ card_id: normalizedCardId })
            .eq('supabase_auth_user_id', userId);
        error = result.error;
    } else {
        // 新規ユーザーの場合はinsert
        const result = await supabase
            .schema('attendance')
            .from('users')
            .insert({ supabase_auth_user_id: userId, card_id: normalizedCardId });
        error = result.error;
    }
    
    if (error) {
        console.error('Card ID update error:', error);
        return { success: false, message: `カードIDの更新に失敗しました: ${error.message}` };
    }
    
    revalidatePath('/admin');
    return { success: true, message: 'カードIDを更新しました。' };
}


export async function checkDiscordMembership(discordUid: string) {
    'use server';
    
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
