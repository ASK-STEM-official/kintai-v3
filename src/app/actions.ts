'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';

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
    .single();

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
  const token = `qr_${randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: existingUser } = await supabase.from('users').select('id').eq('card_id', cardId).single();
  if (existingUser) {
    return { success: false, message: 'このカードは既に登録されています。' };
  }
  
  const { error } = await supabase.from('temp_registrations').upsert(
    { card_id: cardId, qr_token: token, expires_at: expires_at, is_used: false },
    { onConflict: 'card_id' }
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
  const { startOfMonth, endOfMonth } = {
    startOfMonth: new Date(month.getFullYear(), month.getMonth(), 1),
    endOfMonth: new Date(month.getFullYear(), month.getMonth() + 1, 0)
  };
  
  const { data, error } = await supabase
    .from('attendances')
    .select('date, type')
    .eq('user_id', userId)
    .gte('date', startOfMonth.toISOString().split('T')[0])
    .lte('date', endOfMonth.toISOString().split('T')[0])
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

// Admin actions
export async function getAllUsers() {
    const supabase = createSupabaseAdminClient();
    return supabase.from('users').select('*, teams(id, name)');
}

export async function getAllTeams() {
    const supabase = createSupabaseAdminClient();
    return supabase.from('teams').select('*').order('name');
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
        .single();
    
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
    return { success: true, message: `ユーザーを強制的に${newType === 'in' ? '出勤' : '退勤'}させました。` };
}

export async function getTeamWithMembersStatus(teamId: number) {
    const supabase = createSupabaseServerClient();
    const { data: team, error: teamError } = await supabase.from('teams').select('*').eq('id', teamId).single();

    if(teamError) return { team: null, members: [] };

    const { data: members, error: membersError } = await supabase
        .from('users')
        .select('id, display_name, generation, latest_attendance:attendances(type)')
        .eq('team_id', teamId)
        .order('timestamp', { foreignTable: 'attendances', ascending: false })
        .limit(1, { foreignTable: 'attendances' })
        .order('generation', { ascending: false })
        .order('display_name');
        
    return { team, members: members || [] };
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
