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
  
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*, teams (id, name)')
    .eq('card_id', normalizedCardId)
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
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();
  
  const { data: existingUser, error: existingUserError } = await supabase
    .from('users')
    .select('id')
    .eq('card_id', normalizedCardId);

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
    { card_id: normalizedCardId, qr_token: token, expires_at: expires_at, is_used: false },
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

export async function signInAsAnonymousAdmin() {
    const adminSupabase = createSupabaseAdminClient();
    const supabase = createSupabaseServerClient();
    const email = 'admin@example.com';
    const password = 'password';

    // 1. Check if the user already exists in auth.users
    const { data: { users }, error: listUsersError } = await adminSupabase.auth.admin.listUsers();
    if (listUsersError) {
        console.error('Error listing users:', listUsersError);
        return redirect('/login?error=Failed to list users.');
    }

    let authUser = users.find(u => u.email === email);

    if (!authUser) {
        // 2. If not, create the auth user
        const { data: newAuthUserData, error: createAuthUserError } = await adminSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });

        if (createAuthUserError || !newAuthUserData.user) {
            console.error('Error creating anonymous admin auth user:', createAuthUserError);
            return redirect(`/login?error=${createAuthUserError?.message || 'Failed to create user'}`);
        }
        authUser = newAuthUserData.user;
    }
    
    if (!authUser) {
         return redirect('/login?error=Could not create or find anonymous admin user.');
    }

    // 3. Check if the user exists in public.users
    const { data: profile, error: profileError } = await adminSupabase
        .from('users')
        .select('id')
        .eq('id', authUser.id)
        .single();
    
    if (profileError && profileError.code !== 'PGRST116') {
        console.error('Error checking for profile:', profileError);
        return redirect('/login?error=Failed to check for user profile.');
    }

    if (!profile) {
        // 4. If not, create the public.users profile
        const { error: createProfileError } = await adminSupabase.from('users').insert({
            id: authUser.id,
            display_name: '匿名管理者',
            discord_id: 'anonymous_admin',
            card_id: `admin_${randomUUID().slice(0,8)}`,
            generation: 0,
            role: 1, // Admin role
        });

        if (createProfileError) {
            console.error('Error creating anonymous admin profile:', createProfileError);
            return redirect(`/login?error=${createProfileError.message}`);
        }
    }

    // 5. Sign in the user
    const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (signInError) {
        console.error('Sign in error:', signInError);
        return redirect(`/login?error=${signInError.message}`);
    }

    revalidatePath('/', 'layout');
    redirect('/dashboard');
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
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  const end = format(endOfMonth(month), 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('attendances')
    .select('date, user_id, users(generation, team_id, teams(name))')
    .eq('type', 'in')
    .gte('date', start)
    .lte('date', end);

  if (error) {
    console.error('Error fetching monthly attendance summary:', error);
    return {};
  }

  type DailySummary = {
    total: number;
    byTeam: Record<string, { name: string; total: number; byGeneration: Record<number, number> }>;
  };

  const summary: Record<string, DailySummary> = {};
  const dailyUniqueUsers: Record<string, Set<string>> = {};

  if (data) {
    for (const record of data) {
      const { date, user_id, users } = record;
      if (!date || !user_id || !users || !users.teams) continue;

      if (!dailyUniqueUsers[date]) {
        dailyUniqueUsers[date] = new Set();
      }

      if (dailyUniqueUsers[date].has(user_id)) {
        continue;
      }
      dailyUniqueUsers[date].add(user_id);

      if (!summary[date]) {
        summary[date] = { total: 0, byTeam: {} };
      }

      summary[date].total++;

      const teamId = users.team_id!.toString();
      if (!summary[date].byTeam[teamId]) {
        summary[date].byTeam[teamId] = {
          name: users.teams.name,
          total: 0,
          byGeneration: {},
        };
      }

      summary[date].byTeam[teamId].total++;
      
      const generation = users.generation;
      summary[date].byTeam[teamId].byGeneration[generation] = (summary[date].byTeam[teamId].byGeneration[generation] || 0) + 1;
    }
  }

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
    
    if (data.card_id) {
        data.card_id = data.card_id.replace(/:/g, '').toLowerCase();
    }

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
    
    // 1. Check permissions
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { team: null, members: [], stats: null, error: 'Not authenticated' };
    
    const { data: profile } = await supabase.from('users').select('role, team_id').eq('id', user.id).single();
    const isAdmin = profile?.role === 1;

    if (!isAdmin && profile?.team_id !== teamId) {
        return { team: null, members: [], stats: null, error: 'Access denied' };
    }

    // 2. Fetch team details
    const { data: team, error: teamError } = await supabase.from('teams').select('*').eq('id', teamId).single();

    if(teamError || !team) return { team: null, members: [], stats: null };

    // 3. Fetch all members of the team
    const { data: membersData, error: membersError } = await supabase
        .from('users')
        .select('id, display_name, generation, discord_id')
        .eq('team_id', teamId)
        .order('generation', { ascending: false })
        .order('display_name');

    if (membersError) {
        console.error("Error fetching team members:", membersError);
        return { team, members: [], stats: null };
    }

    const memberIds = membersData.map(m => m.id);

    // 4. Fetch the latest attendance for each member
    const { data: latestAttendances, error: attendanceError } = await supabase
        .rpc('get_latest_attendance_for_users', { user_ids: memberIds });

    if (attendanceError) {
        console.error("Error fetching latest attendance:", attendanceError);
        // Continue without status if this fails, but log the error
    }

    const statusMap = new Map<string, { type: 'in' | 'out', timestamp: string }>();
    if (latestAttendances) {
        for (const att of latestAttendances) {
            statusMap.set(att.user_id, { type: att.type, timestamp: att.timestamp });
        }
    }
    
    // 5. Combine member data with status
    const membersWithStatus = membersData.map(member => {
        const attendance = statusMap.get(member.id);
        return {
            ...member,
            status: attendance?.type || 'out',
            timestamp: attendance?.timestamp || null,
        };
    });

    // 6. Get team stats
    const stats = await getTeamStats(teamId);

    return { team, members: membersWithStatus, stats: stats };
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
