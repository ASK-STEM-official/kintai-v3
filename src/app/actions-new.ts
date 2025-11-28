'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { Tables } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { differenceInSeconds, startOfDay, endOfDay, subDays, format, startOfMonth, endOfMonth } from 'date-fns';
import { fetchMemberNickname } from '@/lib/name-api';

// ========================================
// サービス層からの再エクスポート
// ========================================

// 認証関連
export { signInWithDiscord, signOut } from '@/lib/services/auth.service';

// ユーザー管理関連
export { 
  getAllUsersWithStatus,
  updateUserDisplayName,
  updateAllUserDisplayNames,
  updateUserCardId
} from '@/lib/services/user.service';

// 勤怠管理関連
export {
  forceToggleAttendance,
  getAllDailyLogoutLogs,
  getMonthlyAttendanceSummary,
  getDailyAttendanceCounts,
  getDailyAttendanceDetails,
  getOverallStats
} from '@/lib/services/attendance.service';

// チーム管理関連
export {
  getAllTeams,
  getTeamsWithMemberStatus,
  getTeamWithMembersStatus
  // createTeam, updateTeam, deleteTeam は型定義の問題で一時的にコメントアウト
} from '@/lib/services/team.service';

// 登録管理関連
export {
  getTempRegistrations,
  getTempRegistrationByToken,
  deleteTempRegistration
  // completeTempRegistration は型の問題により actions.ts に実装
} from '@/lib/services/registration.service';

// システム管理関連
export { forceLogoutAll } from '@/lib/services/system.service';

// ========================================
// コアビジネスロジック（actions.tsに残す関数）
// ========================================

type Member = Tables<'member', 'members'>;
type AttendanceUser = Tables<'attendance', 'users'>;

/**
 * カードタッチで勤怠を記録
 * キオスク端末から呼び出される主要な関数
 */
export async function recordAttendance(cardId: string): Promise<{ 
  success: boolean; 
  message: string; 
  user: { display_name: string | null } | null; 
  type: 'in' | 'out' | null 
}> {
  const supabase = await createSupabaseAdminClient();
  
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  const { data: attendanceUser, error: attendanceUserError } = await supabase
    .schema('attendance')
    .from('users')
    .select('supabase_auth_user_id, card_id')
    .eq('card_id', normalizedCardId)
    .single();

  if (attendanceUserError || !attendanceUser) {
    return { success: false, message: '未登録のカードです。', user: null, type: null };
  }

  const userId = attendanceUser.supabase_auth_user_id;
  
  // member.members テーブルから Discord UID を取得
  const { data: memberData } = await supabase
    .schema('member')
    .from('members')
    .select('discord_uid')
    .eq('supabase_auth_user_id', userId)
    .single();
  
  let userDisplayName = '名無しさん';
  
  // Discord UIDがある場合、APIから本名を取得
  if (memberData?.discord_uid) {
    const { data: nickname } = await fetchMemberNickname(memberData.discord_uid);
    if (nickname) {
      userDisplayName = nickname;
    }
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  const now = new Date();

  const { data: recentAttendances } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .order('timestamp', { ascending: false })
    .limit(1);

  let attendanceType: 'in' | 'out' = 'in';
  if (recentAttendances && recentAttendances.length > 0) {
    const lastType = recentAttendances[0].type;
    attendanceType = lastType === 'in' ? 'out' : 'in';
  }

  const { error: insertError } = await supabase
    .schema('attendance')
    .from('attendances')
    .insert({
      user_id: userId,
      type: attendanceType,
      timestamp: now.toISOString(),
      date: today,
    });

  if (insertError) {
    console.error('Error inserting attendance:', insertError);
    return { 
      success: false, 
      message: '勤怠記録に失敗しました。', 
      user: { display_name: userDisplayName }, 
      type: null 
    };
  }

  const message = attendanceType === 'in' ? `${userDisplayName}さん、おはようございます!` : `${userDisplayName}さん、お疲れ様でした!`;
  
  revalidatePath('/dashboard');
  revalidatePath('/admin');
  
  return { 
    success: true, 
    message, 
    user: { display_name: userDisplayName }, 
    type: attendanceType 
  };
}

/**
 * 仮登録トークンを作成
 */
export async function createTempRegistration(cardId: string): Promise<{ 
  success: boolean; 
  token?: string; 
  message: string 
}> {
  const supabase = await createSupabaseAdminClient();
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  const { data: existingCard } = await supabase
    .schema('attendance')
    .from('users')
    .select('card_id')
    .eq('card_id', normalizedCardId)
    .single();

  if (existingCard) {
    return { success: false, message: 'このカードは既に登録されています。' };
  }

  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error } = await supabase
    .schema('member')
    .from('temp_registrations')
    .insert({
      token,
      card_id: normalizedCardId,
      expires_at: expiresAt.toISOString(),
    });

  if (error) {
    console.error('Error creating temp registration:', error);
    return { success: false, message: '仮登録の作成に失敗しました。' };
  }

  return { 
    success: true, 
    token, 
    message: `登録URL: ${process.env.NEXT_PUBLIC_APP_URL}/register/${token}` 
  };
}

/**
 * ユーザーの勤怠統計を取得
 */
export async function getUserAttendanceStats(userId: string, days: number = 30) {
  const supabase = await createSupabaseServerClient();
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const { data: attendances } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .order('timestamp', { ascending: true });

  if (!attendances || attendances.length === 0) {
    return {
      totalDays: 0,
      totalTime: 0,
      averageTime: 0,
    };
  }

  const dailySessions = new Map<string, { in: Date | null; totalSeconds: number }>();

  for (const att of attendances) {
    const date = att.date;
    if (!date) continue;

    if (!dailySessions.has(date)) {
      dailySessions.set(date, { in: null, totalSeconds: 0 });
    }

    const session = dailySessions.get(date)!;
    
    if (att.type === 'in') {
      session.in = new Date(att.timestamp);
    } else if (att.type === 'out' && session.in) {
      const outTime = new Date(att.timestamp);
      const seconds = differenceInSeconds(outTime, session.in);
      session.totalSeconds += seconds;
      session.in = null;
    }
  }

  let totalSeconds = 0;
  let daysWithActivity = 0;

  for (const session of dailySessions.values()) {
    if (session.totalSeconds > 0) {
      totalSeconds += session.totalSeconds;
      daysWithActivity++;
    }
  }

  return {
    totalDays: daysWithActivity,
    totalTime: totalSeconds,
    averageTime: daysWithActivity > 0 ? totalSeconds / daysWithActivity : 0,
  };
}

/**
 * ユーザーの最近の勤怠記録を取得
 */
export async function getUserRecentAttendance(userId: string, limit: number = 10) {
  const supabase = await createSupabaseServerClient();

  const { data: attendances, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent attendance:', error);
    return [];
  }

  return attendances || [];
}

/**
 * ユーザーの月次カレンダーデータを取得
 */
export async function getUserMonthlyCalendar(userId: string, month: Date) {
  const supabase = await createSupabaseServerClient();
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  const { data, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('date, type, timestamp')
    .eq('user_id', userId)
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'))
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching monthly calendar:', error);
    return [];
  }

  const dailyStatus: Record<string, { status: 'in' | 'out' | 'mixed'; count: number }> = {};
  
  (data || []).forEach(att => {
    if (!att.date) return;
    
    if (!dailyStatus[att.date]) {
      dailyStatus[att.date] = { status: att.type as 'in' | 'out', count: 1 };
    } else {
      dailyStatus[att.date].count++;
      if (dailyStatus[att.date].status !== att.type) {
        dailyStatus[att.date].status = 'mixed';
      }
    }
  });

  return Object.entries(dailyStatus).map(([date, info]) => ({
    date,
    status: info.status,
    count: info.count
  }));
}

/**
 * チームの平均出席率を計算
 */
export async function getTeamAverageAttendanceRate(teamId: string, days: number = 30): Promise<number> {
  const supabase = await createSupabaseAdminClient();
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  // チームメンバーを取得
  const { data: teamMembers } = await supabase
    .schema('member')
    .from('member_team_relations')
    .select('member_id')
    .eq('team_id', teamId);

  if (!teamMembers || teamMembers.length === 0) {
    return 0;
  }

  const memberIds = teamMembers.map(m => m.member_id);

  // 各メンバーの出席日数を計算
  let totalAttendanceDays = 0;

  for (const memberId of memberIds) {
    const { data: attendances } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('date')
      .eq('user_id', memberId)
      .eq('type', 'in')
      .gte('date', startDate);

    if (attendances) {
      const uniqueDays = new Set(attendances.map(a => a.date)).size;
      totalAttendanceDays += uniqueDays;
    }
  }

  const possibleDays = days * memberIds.length;
  return possibleDays > 0 ? (totalAttendanceDays / possibleDays) * 100 : 0;
}

/**
 * 総活動時間を計算（特定ユーザー）
 */
export async function calculateTotalActivityTime(userId: string, days: number): Promise<number> {
  const supabase = await createSupabaseAdminClient();
  const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');

  const { data: attendances } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .order('timestamp', { ascending: true });

  if (!attendances || attendances.length === 0) {
    return 0;
  }

  let totalSeconds = 0;
  let lastInTime: Date | null = null;

  for (const att of attendances) {
    if (att.type === 'in') {
      lastInTime = new Date(att.timestamp);
    } else if (att.type === 'out' && lastInTime) {
      const outTime = new Date(att.timestamp);
      totalSeconds += differenceInSeconds(outTime, lastInTime);
      lastInTime = null;
    }
  }

  return totalSeconds;
}

/**
 * 月次勤怠データを取得（カレンダー表示用）
 */
export async function getMonthlyAttendance(userId: string, month: Date) {
  const supabase = await createSupabaseServerClient();
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  const { data, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('date, type')
    .eq('user_id', userId)
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'))
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching monthly attendance:', error);
    return [];
  }

  const dailyStatus: Record<string, 'in' | 'out' | 'mixed'> = {};
  
  (data || []).forEach(att => {
    if (!att.date) return;
    dailyStatus[att.date] = att.type as 'in' | 'out';
  });

  return Object.keys(dailyStatus).map(date => ({
    date,
    status: dailyStatus[date]
  }));
}
