'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { differenceInSeconds, startOfDay, endOfDay, subDays, format, startOfMonth, endOfMonth } from 'date-fns';

type UserWithTeam = Tables<'users'> & { teams: Tables<'teams'> | null };

export async function recordAttendance(cardId: string): Promise<{ success: boolean; message: string; user: UserWithTeam | null; type: 'in' | 'out' | null; anomalyReason?: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*, teams (id, name)')
    .eq('card_id', cardId)
    .single();

  if (userError || !user) {
    return { success: false, message: '未登録のカードです。', user: null, type: null };
  }

  const { data: lastAttendance, error: lastAttendanceError } = await supabase
    .from('attendances')
    .select('type')
    .eq('user_id', user.id)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAttendanceError) {
      console.error('Error fetching last attendance:', lastAttendanceError);
      return { success: false, message: '過去の打刻記録の取得中にエラーが発生しました。', user, type: null };
  }

  const attendanceType = lastAttendance?.type === 'in' ? 'out' : 'in';

  const { error: insertError } = await supabase
    .from('attendances')
    .insert({ user_id: user.id, type: attendanceType });

  if (insertError) {
    console.error('Attendance insert error:', insertError);
    return { success: false, message: '打刻処理中にエラーが発生しました。', user, type: null };
  }
  
  revalidatePath('/dashboard/teams');
  return { 
    success: true, 
    message: attendanceType === 'in' ? '出勤しました' : '退勤しました',
    user,
    type: attendanceType,
  };
}


export async function createTempRegistration(cardId: string): Promise<{ success: boolean; token?: string; message: string }> {
  const supabase = createSupabaseAdminClient();
  
  const { data: existingUser, error: existingUserError } = await supabase
    .from('users')
    .select('id')
    .eq('card_id', cardId);

  if (existingUserError) {
    console.error("Error checking for existing user:", existingUserError);
    return { success: false, message: "ユーザーの確認中にエラーが発生しました。" };
  }
  
  if (existingUser && existingUser.length > 0) {
    return { success: false, message: 'このカードは既に登録されています。' };
  }

  const token = `qr_${randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  
  const { error } = await supabase.from('temp_registrations').upsert(
    { card_id: cardId, qr_token: token, expires_at: expires_at, is_used: false },
    { onConflict: 'card_id', ignoreDuplicates: false }
  );
  
  if (error) {
    console.error("Temp registration error:", error);
    return { success: false, message: "仮登録中にエラーが発生しました。" };
  }

  return { success: true, token, message: "QRコードを生成しました。" };
}

export async function getTempRegistration(token: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
        .from('temp_registrations')
        .select('*')
        .eq('qr_token', token)
        .single();
    if (error || !data) return null;

    if (!data.accessed_at) {
        const admin = createSupabaseAdminClient();
        await admin.from('temp_registrations').update({ accessed_at: new Date().toISOString() }).eq('id', data.id);
    }

    return data;
}

export async function completeRegistration(formData: FormData) {
  const token = formData.get('token') as string;
  const displayName = formData.get('displayName') as string;
  const generation = Number(formData.get('generation'));
  const teamId = Number(formData.get('teamId'));

  if (!token || !displayName || !generation || !teamId) {
    return redirect(`/register/${token}?error=Missing form data`);
  }

  const supabase = createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.user_metadata.provider_id) {
    return redirect(`/register/${token}?error=Not authenticated`);
  }
  
  const { data: tempReg, error: tempRegError } = await adminSupabase
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

  const userData: TablesInsert<'users'> = {
    id: user.id,
    display_name: `${displayName}#${Math.floor(1000 + Math.random() * 9000)}`,
    discord_id: user.user_metadata.provider_id,
    generation: generation,
    team_id: teamId,
    card_id: tempReg.card_id,
    role: 0,
    is_active: true,
  };

  const { error: insertUserError } = await adminSupabase.from('users').insert(userData);

  if (insertUserError) {
    console.error("Error inserting user:", insertUserError);
    if(insertUserError.code === '23505') {
      if (insertUserError.details.includes('discord_id')) {
        return redirect(`/register/${token}?error=This Discord account is already registered.`);
      }
       return redirect(`/register/${token}?error=Display name might be taken.`);
    }
    return redirect(`/register/${token}?error=${insertUserError.message}`);
  }
  
  await adminSupabase.from('temp_registrations').update({ is_used: true }).eq('id', tempReg.id);

  revalidatePath('/admin');
  redirect(`/register/${token}?success=true`);
}


export async function signInWithDiscord() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
            scopes: 'identify guilds',
            queryParams: {
                prompt: 'consent',
            },
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
    cookies().getAll();
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return redirect('/login');
}

export async function getMonthlyAttendance(userId: string, month: Date) {
  const supabase = createSupabaseServerClient();
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  
  const { data, error } = await supabase
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
  data.forEach(att => {
    const date = att.date;
    dailyStatus[date] = att.type as 'in' | 'out';
  });

  return Object.keys(dailyStatus).map(date => ({
    date,
    status: dailyStatus[date]
  }));
}

export async function getMonthlyAttendanceSummary(month: Date) {
  const supabase = createSupabaseAdminClient();
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  const { data, error } = await supabase
    .from('attendances')
    .select('date, users (generation)')
    .eq('type', 'in')
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'));

  if (error) {
    console.error('Error fetching monthly attendance summary:', error);
    return {};
  }
  
  const summary: Record<string, { total: number; byGeneration: Record<number, number> }> = {};

  for (const record of data) {
    const { date, users } = record;
    if (!date || !users) continue;
    
    if (!summary[date]) {
      summary[date] = { total: 0, byGeneration: {} };
    }
    
    // This logic assumes one 'in' record per user per day for counting.
    // If a user can have multiple 'in' records a day, we need to count unique users.
    // Let's refine this to count unique users per day.
  }

  // To count unique users, we need to process the data differently
  const dailyUsers: Record<string, Map<string, number>> = {};
  const { data: uniqueData, error: uniqueError } = await supabase
    .from('attendances')
    .select('date, user_id, users(generation)')
    .eq('type', 'in')
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'));

  if (uniqueError) {
    console.error('Error fetching monthly unique attendance summary:', uniqueError);
    return {};
  }

  if (uniqueData) {
    for (const record of uniqueData) {
        const { date, user_id, users } = record;
        if (!date || !user_id || !users) continue;

        if (!dailyUsers[date]) {
            dailyUsers[date] = new Map();
        }
        if (!dailyUsers[date].has(user_id)) {
            dailyUsers[date].set(user_id, users.generation);
        }
    }
  }


  Object.keys(dailyUsers).forEach(date => {
      const usersMap = dailyUsers[date];
      summary[date] = { total: usersMap.size, byGeneration: {} };
      usersMap.forEach((generation) => {
          summary[date].byGeneration[generation] = (summary[date].byGeneration[generation] || 0) + 1;
      });
  });
  
  return summary;
}


export async function calculateTotalActivityTime(userId: string): Promise<number> {
  const supabase = createSupabaseServerClient();

  const { data: attendances, error } = await supabase
    .from('attendances')
    .select('type, timestamp')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });

  if (error || !attendances) {
    console.error('Error fetching attendances for time calculation:', error);
    return 0;
  }

  let totalSeconds = 0;
  let inTime: Date | null = null;

  for (const attendance of attendances) {
    if (attendance.type === 'in') {
      // If there are consecutive 'in' records, use the latest one.
      inTime = new Date(attendance.timestamp);
    } else if (attendance.type === 'out' && inTime) {
      // If there is an 'out' record and a preceding 'in' record, calculate the duration.
      const outTime = new Date(attendance.timestamp);
      totalSeconds += differenceInSeconds(outTime, inTime);
      inTime = null; // Reset inTime after calculating the duration.
    }
  }

  return totalSeconds / 3600; // Convert seconds to hours
}

// Admin actions
export async function getAllUsersWithStatus() {
    const supabase = createSupabaseAdminClient();
    const { data: users, error: usersError } = await supabase.from('users').select('*, teams(id, name)');
    if (usersError) return { data: [], error: usersError };

    const userIds = users.map(u => u.id);
    const { data: latestAttendances, error: attendanceError } = await supabase
        .from('attendances')
        .select('user_id, type')
        .in('user_id', userIds)
        .order('timestamp', { ascending: false });
    
    if (attendanceError) return { data: users, error: null }; // Return users without status on error

    const statusMap = new Map<string, string>();
    latestAttendances.forEach(att => {
        if (!statusMap.has(att.user_id)) {
            statusMap.set(att.user_id, att.type);
        }
    });

    const usersWithStatus = users.map(u => ({
        ...u,
        status: statusMap.get(u.id) || 'out'
    }));
    
    return { data: usersWithStatus, error: null };
}

export async function getAllTeams() {
    const supabase = createSupabaseAdminClient();
    return supabase.from('teams').select('*').order('name');
}

export async function getTeamsWithMemberStatus() {
    const supabase = createSupabaseAdminClient();
    const { data: teams, error: teamsError } = await supabase.from('teams').select('id, name').order('name');
    if (teamsError) return [];

    const { data: users, error: usersError } = await supabase.from('users').select('id, team_id');
    if (usersError) return teams.map(t => ({ ...t, current: 0, total: 0 }));
    
    const userIds = users.map(u => u.id);
     const { data: latestAttendances, error: attendanceError } = await supabase
        .from('attendances')
        .select('user_id, type')
        .in('user_id', userIds)
        .order('timestamp', { ascending: false });

    const statusMap = new Map<string, string>();
    if (latestAttendances) {
        latestAttendances.forEach(att => {
            if (!statusMap.has(att.user_id)) {
                statusMap.set(att.user_id, att.type);
            }
        });
    }

    const memberStatusByTeam = users.reduce((acc, user) => {
        if (!user.team_id) return acc;
        if (!acc[user.team_id]) {
            acc[user.team_id] = { current: 0, total: 0 };
        }
        acc[user.team_id].total++;
        if (statusMap.get(user.id) === 'in') {
            acc[user.team_id].current++;
        }
        return acc;
    }, {} as Record<number, { current: number; total: number }>);

    return teams.map(team => ({
        ...team,
        ...memberStatusByTeam[team.id] || { current: 0, total: 0 },
    }));
}


export async function updateUser(userId: string, data: TablesUpdate<'users'>) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('users').update(data).eq('id', userId);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: 'ユーザー情報を更新しました。' };
}

export async function createTeam(name: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('teams').insert({ name });
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を作成しました。'};
}

export async function updateTeam(id: number, name: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('teams').update({ name }).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を更新しました。'};
}

export async function deleteTeam(id: number) {
    const supabase = createSupabaseAdminClient();
    const { count } = await supabase.from('users').select('*', { count: 'exact' }).eq('team_id', id);

    if (count && count > 0) {
        return { success: false, message: `この班には${count}人のユーザーが所属しているため、削除できません。` };
    }

    const { error } = await supabase.from('teams').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を削除しました。' };
}

export async function forceLogoutAll() {
    const supabase = createSupabaseAdminClient();
    
    // 1. Get user IDs that are currently 'in'
    const { data: currentlyIn, error: currentlyInError } = await supabase
        .from('attendances')
        .select('user_id')
        .order('timestamp', { ascending: false });

    if (currentlyInError) {
        console.error('Error fetching latest attendance:', currentlyInError);
        return { success: false, message: `DBエラー: ${currentlyInError.message}` };
    }

    // Determine the latest status for each user
    const userStatus: { [key: string]: string } = {};
    if (currentlyIn) {
      for (const att of currentlyIn) {
        if (!userStatus[att.user_id]) {
          const { data: latest, error } = await supabase
            .from('attendances')
            .select('type')
            .eq('user_id', att.user_id)
            .order('timestamp', { ascending: false })
            .limit(1)
            .single();
          if (latest) {
            userStatus[att.user_id] = latest.type;
          }
        }
      }
    }
    
    const usersToLogOut = Object.keys(userStatus).filter(userId => userStatus[userId] === 'in');

    if (usersToLogOut.length === 0) {
        return { success: true, message: '現在活動中のユーザーはいません。', count: 0 };
    }

    const attendanceRecords = usersToLogOut.map((userId: string) => ({ user_id: userId, type: 'out' as const }));
    const { error: insertError } = await supabase.from('attendances').insert(attendanceRecords);

    if (insertError) {
        return { success: false, message: insertError.message };
    }

    await supabase.from('daily_logout_logs').insert({ affected_count: usersToLogOut.length, status: 'success' });

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    return { success: true, message: `${usersToLogOut.length}人のユーザーを強制退勤させました。`, count: usersToLogOut.length };
}

export async function forceToggleAttendance(userId: string) {
    const supabase = createSupabaseAdminClient();

    const { data: lastAttendance, error: lastAttendanceError } = await supabase
        .from('attendances')
        .select('type')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if(lastAttendanceError && lastAttendanceError.code !== 'PGRST116') { // Not an error if no rows found
        return { success: false, message: lastAttendanceError.message };
    }

    const newType = lastAttendance?.type === 'in' ? 'out' : 'in';

    const { error: insertError } = await supabase.from('attendances').insert({ user_id: userId, type: newType });
    if(insertError) {
        return { success: false, message: insertError.message };
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    revalidatePath('/dashboard/layout');
    return { success: true, message: `ユーザーを強制的に${newType === 'in' ? '出勤' : '退勤'}させました。` };
}

export async function getTeamWithMembersStatus(teamId: number) {
    const supabase = createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { team: null, members: [], stats: null, error: 'Not authenticated' };
    
    const { data: profile } = await supabase.from('users').select('role, team_id').eq('id', user.id).single();
    const isAdmin = profile?.role === 1;

    if (!isAdmin && profile?.team_id !== teamId) {
        return { team: null, members: [], stats: null, error: 'Access denied' };
    }

    const { data: team, error: teamError } = await supabase.from('teams').select('*').eq('id', teamId).single();

    if(teamError) return { team: null, members: [], stats: null };

    // Get all members of the team with their latest attendance status
    const { data: members, error: membersError } = await supabase
        .from('users')
        .select('id, display_name, generation, discord_id, latest_attendance:attendances!inner(type, timestamp)')
        .eq('team_id', teamId)
        .order('timestamp', { foreignTable: 'attendances', ascending: false })
        .limit(1, { foreignTable: 'attendances' })
        .order('generation', { ascending: false })
        .order('display_name');

    if(membersError) {
        // Fallback for members who might not have any attendance records
        const { data: allMembers, error: allMembersError } = await supabase
            .from('users')
            .select('id, display_name, generation, discord_id')
            .eq('team_id', teamId)
            .order('generation', { ascending: false })
            .order('display_name');

        if (allMembersError) return { team, members: [], stats: null };

        const membersWithNullAttendance = allMembers.map(m => ({ ...m, latest_attendance: [] }));
        return { team, members: membersWithNullAttendance, stats: await getTeamStats(teamId) };
    }
        
    // Combine members with attendance and members without any attendance
    const attendedMemberIds = new Set(members?.map(m => m.id));
    const { data: allMembers, error: allMembersError } = await supabase
        .from('users')
        .select('id, display_name, generation, discord_id')
        .eq('team_id', teamId)
        .order('generation', { ascending: false })
        .order('display_name');

    if (allMembersError) {
        return { team, members: [], stats: null };
    }
    
    const combinedMembers = allMembers.map(m => {
        if(attendedMemberIds.has(m.id)) {
            return members!.find(am => am.id === m.id)!;
        }
        return { ...m, latest_attendance: [] };
    })
    
    return { team, members: combinedMembers || [], stats: await getTeamStats(teamId) };
}

async function getTeamStats(teamId: number) {
    const supabase = createSupabaseAdminClient();
    const today = new Date();

    const { count: totalMembersCount, error: totalMembersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

    if (totalMembersError) return null;

    const { data: todayAttendanceData, error: todayAttendanceError } = await supabase
        .from('attendances')
        .select('user_id', { count: 'exact' })
        .eq('type', 'in')
        .gte('timestamp', startOfDay(today).toISOString())
        .lte('timestamp', endOfDay(today).toISOString())
        .in('user_id', (await supabase.from('users').select('id').eq('team_id', teamId)).data?.map(u => u.id) || []);
    
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


export async function getMonthlyTeamAttendanceStats(teamId: number, days: number): Promise<number> {
    const supabase = createSupabaseAdminClient();
    const { data: teamMembers, error: teamMembersError } = await supabase
        .from('users')
        .select('id')
        .eq('team_id', teamId);

    if (teamMembersError || !teamMembers || teamMembers.length === 0) return 0;
    
    const memberIds = teamMembers.map(m => m.id);

    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    const { data: activityDays, error: activityDaysError } = await supabase
        .from('attendances')
        .select('date', { count: 'exact' })
        .gte('date', startDate)
        .lte('date', endDate);

    const totalActivityDays = new Set(activityDays?.map(d => d.date)).size;
    if (totalActivityDays === 0) return 0;

    const { data: teamAttendances, error: teamAttendancesError } = await supabase
        .from('attendances')
        .select('date, user_id')
        .in('user_id', memberIds)
        .eq('type', 'in')
        .gte('date', startDate)
        .lte('date', endDate);

    if (teamAttendancesError) return 0;

    const dailyAttendanceCount = teamAttendances.reduce((acc, curr) => {
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


export async function getAllAnnouncements() {
    const supabase = createSupabaseAdminClient();
    return supabase.from('announcements').select('*, users(display_name)').order('created_at', { ascending: false });
}

export async function createAnnouncement(data: TablesInsert<'announcements'>) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('announcements').insert(data);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: 'お知らせを作成しました。'};
}

export async function updateAnnouncement(id: string, data: TablesUpdate<'announcements'>) {
    const supabase = createSupabaseAdminClient();
    if(data.is_current) {
        await supabase.from('announcements').update({ is_current: false }).eq('is_current', true);
    }
    const { error } = await supabase.from('announcements').update(data).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/');
    return { success: true, message: 'お知らせを更新しました。'};
}

export async function deleteAnnouncement(id: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('announcements').update({ is_active: false }).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: 'お知らせを削除しました。' };
}

export async function logUserEdit(logData: TablesInsert<'user_edit_logs'>) {
    const supabase = createSupabaseAdminClient();
    await supabase.from('user_edit_logs').insert(logData);
}

export async function getAllUserEditLogs() {
    const supabase = createSupabaseAdminClient();
    return supabase
        .from('user_edit_logs')
        .select('*, editor:editor_user_id(display_name), target:target_user_id(display_name)')
        .order('created_at', { ascending: false });
}

export async function getAllDailyLogoutLogs() {
    const supabase = createSupabaseAdminClient();
    return supabase
        .from('daily_logout_logs')
        .select('*')
        .order('executed_at', { ascending: false });
}

export async function getTempRegistrations() {
    const supabase = createSupabaseAdminClient();
    return supabase.from('temp_registrations').select('*').order('created_at', { ascending: false });
}

export async function deleteTempRegistration(id: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('temp_registrations').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: '仮登録を削除しました。' };
}
