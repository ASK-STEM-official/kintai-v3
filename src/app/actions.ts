

'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { differenceInSeconds, startOfDay, endOfDay, subDays, format, startOfMonth, endOfMonth } from 'date-fns';
import { fetchAllMemberNames, fetchMemberNickname } from '@/lib/name-api';
import { fetchMemberStatus } from '@/lib/member-status-api';

type Member = Tables<'member', 'members'>;
type AttendanceUser = Tables<'attendance', 'users'>;
type Team = Tables<'member', 'teams'>;

type UserWithTeam = Member & { teams: Team[] | null };

export async function recordAttendance(cardId: string): Promise<{ success: boolean; message: string; user: { display_name: string | null; } | null; type: 'in' | 'out' | null; }> {
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

  const { data: lastAttendance, error: lastAttendanceError } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('type')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAttendanceError) {
      console.error('Error fetching last attendance:', lastAttendanceError);
      return { success: false, message: '過去の打刻記録の取得中にエラーが発生しました。', user: null, type: null };
  }

  const attendanceType = lastAttendance?.type === 'in' ? 'out' : 'in';

  const { error: insertError } = await supabase
    .schema('attendance')
    .from('attendances')
    .insert({ user_id: userId, type: attendanceType, card_id: normalizedCardId });

  if (insertError) {
    console.error('Attendance insert error:', insertError);
    return { success: false, message: '打刻処理中にエラーが発生しました。', user: null, type: null };
  }
  
  revalidatePath('/dashboard/teams');
  return { 
    success: true, 
    message: attendanceType === 'in' ? '出勤しました' : '退勤しました',
    user: { display_name: userDisplayName },
    type: attendanceType,
  };
}


export async function createTempRegistration(cardId: string): Promise<{ success: boolean; token?: string; message: string }> {
  const supabase = await createSupabaseAdminClient();
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();
  
  const { data: existingUser, error: existingUserError } = await supabase
    .schema('attendance')
    .from('users')
    .select('supabase_auth_user_id')
    .eq('card_id', normalizedCardId)
    .single();

  if (existingUserError && existingUserError.code !== 'PGRST116') { // Ignore "No rows found" error
    console.error("Error checking for existing card:", existingUserError);
    return { success: false, message: "カード情報の確認中にデータベースエラーが発生しました。" };
  }
  
  if (existingUser) {
    return { success: false, message: 'このカードは既に登録されています。' };
  }

  // Find and delete previous incomplete registrations for this card
  await supabase.schema('attendance').from('temp_registrations').delete().match({ card_id: normalizedCardId, is_used: false });

  const token = `qr_${randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  
  const { error } = await supabase.schema('attendance').from('temp_registrations').insert(
    { card_id: normalizedCardId, qr_token: token, expires_at: expires_at, is_used: false }
  );
  
  if (error) {
    console.error("Temp registration error:", error);
    return { success: false, message: "仮登録中にエラーが発生しました。" };
  }

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
  
  const attendanceUserData: TablesInsert<'attendance', 'users'> = {
      supabase_auth_user_id: user.id,
      card_id: tempReg.card_id
  }
  
  console.log('[DEBUG] About to upsert attendance user:', { 
    supabase_auth_user_id: user.id, 
    card_id: tempReg.card_id,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceRoleKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20)
  });
  
  // supabase_auth_user_id カラムに user_id を設定
  const { error: insertAttendanceUserError } = await adminSupabase
    .schema('attendance')
    .from('users')
    .upsert(
      { 
        supabase_auth_user_id: user.id,
        card_id: tempReg.card_id 
      }, 
      { onConflict: 'supabase_auth_user_id' }
    );
  if (insertAttendanceUserError) {
      console.error("Error creating attendance user link:", insertAttendanceUserError);
      return redirect(`/register/${token}?error=Failed to link card to user.`);
  }
  
  await adminSupabase.schema('attendance').from('temp_registrations').update({ is_used: true }).eq('id', tempReg.id);

  revalidatePath('/admin');
  redirect(`/register/${token}?success=true`);
}


export async function signInWithDiscord(formData?: FormData) {
    const supabase = await createSupabaseServerClient();
    const next = formData?.get('next') as string | undefined;
    
    // 登録ページから来た場合、nextパラメータをCookieに保存
    if (next) {
        const cookieStore = await cookies();
        cookieStore.set('auth_next', next, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 600, // 10分
            path: '/'
        });
    }
    
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
            scopes: 'identify',
        },
    });

    if (error) {
        console.error('Sign in with Discord error:', error);
        return redirect('/login?error=Could not authenticate with Discord.');
    }

    if (data.url) {
        redirect(data.url);
    }
}

export async function signOut() {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return redirect('/login');
}

export async function getMonthlyAttendance(userId: string, month: Date) {
  const supabase = await createSupabaseAdminClient();
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  // 認証ユーザーIDから勤怠ユーザーIDを取得
  const { data: attendanceUser, error: attendanceUserError } = await supabase
    .schema('attendance')
    .from('users')
    .select('id')
    .eq('supabase_auth_user_id', userId)
    .single();

  if (attendanceUserError || !attendanceUser) {
    console.error('Error fetching attendance user:', attendanceUserError);
    return [];
  }
  const internalUserId = attendanceUser.id;

  const { data, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('date, type')
    .eq('user_id', internalUserId)
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'))
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching monthly attendance:', error);
    return [];
  }

  const dailyStatus: Record<string, 'in' | 'out' | 'mixed'> = {};
  data.forEach(att => {
    if (!att.date) return;
    dailyStatus[att.date] = att.type as 'in' | 'out';
  });

  return Object.keys(dailyStatus).map(date => ({
    date,
    status: dailyStatus[date]
  }));
}

export async function getMonthlyAttendanceSummary(month: Date) {
  const supabase = await createSupabaseAdminClient();
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  const end = format(endOfMonth(month), 'yyyy-MM-dd');

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

        const dateKey = format(new Date(date), 'yyyy-MM-dd');

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

  return totalSeconds / 3600; // Convert seconds to hours
}

// Admin actions
// @ts-ignore - 型定義が更新されていないが、実際のDBスキーマには存在する
export async function getAllUsersWithStatus() {
    const supabase = await createSupabaseAdminClient();
    
    // @ts-ignore
    // member.membersからユーザー情報を取得
    const { data: members, error: membersError } = await supabase
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
            member_team_relations(team_id, teams(name))
        `);

    if (membersError) {
        console.error('Error fetching members:', membersError);
        return { data: [], error: membersError };
    }

    // attendance.usersからカード情報を取得
    const { data: attendanceUsers, error: attendanceUsersError } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id, card_id');

    const cardMap = new Map(attendanceUsers?.map(u => [u.supabase_auth_user_id, u.card_id]) || []);

    // @ts-ignore
    // 最新の打刻情報を取得
    const memberIds = members?.map(m => m.supabase_auth_user_id) || [];
    const { data: latestAttendances } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id, type, timestamp')
        .in('user_id', memberIds)
        .order('timestamp', { ascending: false });

    // 各ユーザーの最新打刻を抽出
    const latestAttendanceMap = new Map<string, { type: string; timestamp: string }>();
    latestAttendances?.forEach(att => {
        if (!latestAttendanceMap.has(att.user_id)) {
            latestAttendanceMap.set(att.user_id, { type: att.type, timestamp: att.timestamp });
        }
    });

    // @ts-ignore
    // Discord UIDから本名を一括取得
    const discordUids = members?.map(m => m.discord_uid).filter(Boolean) || [];
    const nameMap = new Map<string, string>();
    
    // 本名取得API呼び出し（並列処理）
    await Promise.all(
        discordUids.map(async (discord_uid) => {
            if (discord_uid) {
                const { data: nickname } = await fetchMemberNickname(discord_uid);
                if (nickname) {
                    nameMap.set(discord_uid, nickname);
                }
            }
        })
    );

    // @ts-ignore
    // データを結合
    const users = members?.map((member: any) => {
        const latestAttendance = latestAttendanceMap.get(member.supabase_auth_user_id);
        const teamRelation = member.member_team_relations?.[0];
        const realName = member.discord_uid ? nameMap.get(member.discord_uid) : null;
        
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
            status: member.status ?? 0, // member.membersのstatusフィールド (0: 中学生, 1: 高校生, 2: OB/OG)
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
    const { data: teams, error: teamsError } = await supabase.schema('member').from('teams').select('id, name').order('name');
    if (teamsError) return [];

    const { data: memberTeamRelations, error: usersError } = await supabase.schema('member').from('member_team_relations').select('member_id, team_id');
    if (usersError || !memberTeamRelations) return teams.map(t => ({ ...t, current: 0, total: 0 }));
    
    const userIds = memberTeamRelations.map(u => u.member_id);

    const { data: attendanceUserIds, error: attendanceUsersError } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .in('supabase_auth_user_id', userIds);
    
    if (attendanceUsersError) return [];
    
    const userIdsWithCard = attendanceUserIds.map(u => u.supabase_auth_user_id);


    const { data: latestAttendances, error: attendanceError } = await (supabase as any)
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
    
    const { data: currentlyIn, error: currentlyInError } = await (supabase as any)
        .rpc('get_currently_in_user_ids');

    if (currentlyInError) {
        console.error('Error fetching currently in users:', currentlyInError);
        return { success: false, message: `DBエラー: ${currentlyInError.message}` };
    }
    
    const usersToLogOut = currentlyIn as {user_id: string, card_id: string}[];

    if (usersToLogOut.length === 0) {
        await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'success' });
        return { success: true, message: '現在活動中のユーザーはいません。', count: 0 };
    }

    const attendanceRecords = usersToLogOut.map(user => ({ user_id: user.user_id, card_id: user.card_id, type: 'out' as const }));
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

    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert({ user_id: attendanceUser.supabase_auth_user_id, type: newType, card_id: attendanceUser.card_id });
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

    // @ts-ignore
    if (!profile?.is_admin && !profile?.member_team_relations.some(rel => rel.team_id === teamId)) {
        return { team: null, members: [], stats: null, error: 'Access denied' };
    }

    const { data: team, error: teamError } = await supabase.schema('member').from('teams').select('*').eq('id', String(teamId)).single();
    if(teamError || !team) return { team: null, members: [], stats: null, error: teamError?.message };

    const { data, error: membersError } = await (supabase.schema('attendance') as any)
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
    const today = new Date();

    const { count: totalMembersCount, error: totalMembersError } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

    if (totalMembersError) return null;
    
    const { data: teamMemberRelations } = await supabase.schema('member').from('member_team_relations').select('member_id').eq('team_id', teamId);
    const memberIds = teamMemberRelations?.map(m => m.member_id) || [];
    
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
        .gte('timestamp', startOfDay(today).toISOString())
        .lte('timestamp', endOfDay(today).toISOString())
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
    const { data: teamMembers, error: teamMembersError } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('member_id')
        .eq('team_id', teamId);

    if (teamMembersError || !teamMembers || teamMembers.length === 0) return 0;
    
    const memberIds = teamMembers.map(m => m.member_id);

    const { data: attendanceUsers } = await supabase.schema('attendance').from('users').select('supabase_auth_user_id').in('supabase_auth_user_id', memberIds);
    const attendanceUserIds = attendanceUsers?.map(u => u.supabase_auth_user_id) || [];

    if(attendanceUserIds.length === 0) return 0;

    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

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

// 全体統計情報を取得
export async function getOverallStats(days: number = 30) {
    const supabase = await createSupabaseAdminClient();
    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    
    // 今日の出席人数を取得
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: todayAttendances } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id, type')
        .eq('date', today)
        .order('timestamp', { ascending: false });
    
    // 今日出勤したユニークなユーザー（最後の記録がinの人）
    const userLastStatus = new Map<string, string>();
    todayAttendances?.forEach(att => {
        if (!userLastStatus.has(att.user_id)) {
            userLastStatus.set(att.user_id, att.type);
        }
    });
    const todayActiveUsers = Array.from(userLastStatus.values()).filter(type => type === 'in').length;
    
    // 総登録部員数
    const { count: totalMembers } = await supabase
        .schema('member')
        .from('members')
        .select('*', { count: 'exact', head: true });
    
    // 過去N日間のユニークな出勤日数
    const { data: distinctDates } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('date')
        .eq('type', 'in')
        .gte('date', startDate);
    
    const activeDaysCount = distinctDates ? new Set(distinctDates.map(d => d.date)).size : 0;
    
    // 過去N日間の総活動時間（全員の合計）
    const { data: allAttendances } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id, type, timestamp')
        .gte('date', startDate)
        .order('user_id')
        .order('timestamp', { ascending: true });
    
    let totalActivityHours = 0;
    if (allAttendances) {
        const userSessions = new Map<string, { in: Date | null }>();
        
        for (const att of allAttendances) {
            const session = userSessions.get(att.user_id) || { in: null };
            
            if (att.type === 'in') {
                session.in = new Date(att.timestamp);
            } else if (att.type === 'out' && session.in) {
                const duration = differenceInSeconds(new Date(att.timestamp), session.in) / 3600;
                totalActivityHours += duration;
                session.in = null;
            }
            
            userSessions.set(att.user_id, session);
        }
    }
    
    return {
        todayActiveUsers,
        totalMembers: totalMembers || 0,
        activeDaysCount,
        totalActivityHours: Math.round(totalActivityHours * 10) / 10,
    };
}

// 日別の出席人数を取得（カレンダー用）
export async function getDailyAttendanceCounts(year: number, month: number) {
    const supabase = await createSupabaseAdminClient();
    const start = startOfMonth(new Date(year, month - 1));
    const end = endOfMonth(new Date(year, month - 1));
    
    const { data: attendances } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('date, user_id, type')
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'))
        .order('date')
        .order('timestamp', { ascending: false });
    
    const dailyCounts = new Map<string, number>();
    
    if (attendances) {
        const dateUserStatus = new Map<string, Map<string, string>>();
        
        attendances.forEach(att => {
            const key = att.date;
            if (!dateUserStatus.has(key)) {
                dateUserStatus.set(key, new Map());
            }
            const userMap = dateUserStatus.get(key)!;
            if (!userMap.has(att.user_id)) {
                userMap.set(att.user_id, att.type);
            }
        });
        
        dateUserStatus.forEach((userMap, date) => {
            const count = Array.from(userMap.values()).filter(type => type === 'in').length;
            dailyCounts.set(date, count);
        });
    }
    
    return Object.fromEntries(dailyCounts);
}

// 特定日の詳細な出席情報を取得（班別・学年別）
export async function getDailyAttendanceDetails(date: string) {
    const supabase = await createSupabaseAdminClient();
    
    const { data: attendances } = await supabase
        .schema('attendance')
        .from('attendances')
        .select(`
            user_id,
            type,
            timestamp
        `)
        .eq('date', date)
        .order('timestamp', { ascending: false });
    
    if (!attendances) {
        return { byTeam: {}, byGrade: {}, total: 0 };
    }
    
    // 各ユーザーの最後の状態を取得
    const userLastStatus = new Map<string, string>();
    attendances.forEach(att => {
        if (!userLastStatus.has(att.user_id)) {
            userLastStatus.set(att.user_id, att.type);
        }
    });
    
    const activeUserIds = Array.from(userLastStatus.entries())
        .filter(([_, type]) => type === 'in')
        .map(([userId, _]) => userId);
    
    if (activeUserIds.length === 0) {
        return { byTeam: {}, byGrade: {}, total: 0 };
    }
    
    // ユーザー情報を取得
    const { data: members } = await supabase
        .schema('member')
        .from('members')
        .select(`
            supabase_auth_user_id,
            generation,
            member_team_relations(
                teams(name)
            )
        `)
        .in('supabase_auth_user_id', activeUserIds);
    
    const byTeam: Record<string, number> = {};
    const byGrade: Record<string, number> = {};
    
    members?.forEach(member => {
        // 班別
        const teamName = member.member_team_relations?.[0]?.teams?.name || '未所属';
        byTeam[teamName] = (byTeam[teamName] || 0) + 1;
        
        // 学年別
        const grade = member.generation ? `${member.generation}期` : '不明';
        byGrade[grade] = (byGrade[grade] || 0) + 1;
    });
    
    return {
        byTeam,
        byGrade,
        total: activeUserIds.length,
    };
}

// カードIDを変更
export async function updateUserCardId(userId: string, newCardId: string) {
    const supabase = await createSupabaseAdminClient();
    
    // カードIDを正規化（コロンを削除、小文字化）
    const normalizedCardId = newCardId.replace(/:/g, '').toLowerCase();
    
    // 既存のカードIDと重複していないか確認
    const { data: existingCard } = await supabase
        .schema('attendance')
        .from('users')
        .select('supabase_auth_user_id')
        .eq('card_id', normalizedCardId)
        .single();
    
    if (existingCard && existingCard.supabase_auth_user_id !== userId) {
        return { success: false, message: 'このカードIDは既に別のユーザーに登録されています。' };
    }
    
    // attendance.users テーブルでカードIDを更新
    const { error } = await supabase
        .schema('attendance')
        .from('users')
        .update({ card_id: normalizedCardId })
        .eq('supabase_auth_user_id', userId);
    
    if (error) {
        console.error('Card ID update error:', error);
        return { success: false, message: 'カードIDの更新に失敗しました。' };
    }
    
    revalidatePath('/admin');
    return { success: true, message: 'カードIDを更新しました。' };
}
