'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type UserWithTeam = Tables<'users'> & { teams: Tables<'teams'> | null };

export async function recordAttendance(cardId: string): Promise<{ success: boolean; message: string; user: UserWithTeam | null; type: 'in' | 'out' | null; anomalyReason?: string }> {
  const supabase = createSupabaseAdminClient();

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*, teams(*)')
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
  
  return { 
    success: true, 
    message: attendanceType === 'in' ? '出勤しました' : '退勤しました',
    user,
    type: attendanceType,
  };
}


export async function createTempRegistration(cardId: string): Promise<{ success: boolean; token?: string; message: string }> {
  const supabase = createSupabaseAdminClient();
  const token = `qr_${crypto.randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Check if card is already registered
  const { data: existingUser } = await supabase.from('users').select('id').eq('card_id', cardId).single();
  if (existingUser) {
    return { success: false, message: 'このカードは既に登録されています。' };
  }
  
  // Upsert temp registration
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

    // Mark as accessed
    if (!data.accessed_at) {
        const admin = createSupabaseAdminClient();
        await admin.from('temp_registrations').update({ accessed_at: new Date().toISOString() }).eq('id', data.id);
    }

    return data;
}

export async function completeRegistration(
  token: string,
  formData: { displayName: string; generation: number; teamId: number }
): Promise<{ success: boolean; message: string }> {
  const supabase = createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.user_metadata.provider_id) {
    return { success: false, message: "認証されていません。" };
  }
  
  const { data: tempReg, error: tempRegError } = await adminSupabase
    .from('temp_registrations')
    .select('*')
    .eq('qr_token', token)
    .single();

  if (tempRegError || !tempReg) {
    return { success: false, message: "無効な登録セッションです。" };
  }
  if (tempReg.is_used) {
    return { success: false, message: "この登録セッションは既に使用されています。" };
  }
  if (new Date(tempReg.expires_at) < new Date()) {
    return { success: false, message: "登録セッションの有効期限が切れています。" };
  }

  const userData: TablesInsert<'users'> = {
    id: user.id,
    display_name: `${formData.displayName}#${Math.floor(1000 + Math.random() * 9000)}`,
    discord_id: user.user_metadata.provider_id,
    generation: formData.generation,
    team_id: formData.teamId,
    card_id: tempReg.card_id,
    role: 0, // Default role
    is_active: true,
  };

  const { error: insertUserError } = await adminSupabase.from('users').insert(userData);

  if (insertUserError) {
    console.error("Error inserting user:", insertUserError);
    if(insertUserError.code === '23505') { // unique violation
      if (insertUserError.details.includes('discord_id')) {
        return { success: false, message: "このDiscordアカウントは既に登録されています。" };
      }
      if (insertUserError.details.includes('display_name')) {
        // Retry with a new random suffix if display_name is not unique
        userData.display_name = `${formData.displayName}#${Math.floor(1000 + Math.random() * 9000)}`;
        const { error: retryError } = await adminSupabase.from('users').insert(userData);
        if (retryError) {
           return { success: false, message: "ユーザー登録に失敗しました。(表示名)" };
        }
      } else {
        return { success: false, message: "ユーザー登録に失敗しました。" };
      }
    } else {
       return { success: false, message: "ユーザー登録に失敗しました。" };
    }
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
    const cookieStore = cookies();
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return;
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

  // Aggregate by date
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
    return supabase.from('teams').select('*');
}

export async function updateUser(userId: string, data: TablesUpdate<'users'>) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('users').update(data).eq('id', userId);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: 'ユーザー情報を更新しました。' };
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
