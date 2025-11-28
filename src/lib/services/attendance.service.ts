'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { format, startOfMonth, endOfMonth, subDays, startOfDay, endOfDay } from 'date-fns';

/**
 * ユーザーの出退勤を強制的に切り替える
 */
export async function forceToggleAttendance(userId: string) {
    const supabase = await createSupabaseAdminClient();

    try {
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
        
        if (lastAttendanceError && lastAttendanceError.code !== 'PGRST116') {
            return { success: false, message: lastAttendanceError.message };
        }

        const newType = lastAttendance?.type === 'in' ? 'out' : 'in';

        const { error: insertError } = await supabase
            .schema('attendance')
            .from('attendances')
            .insert({ 
                user_id: attendanceUser.supabase_auth_user_id, 
                type: newType, 
                card_id: attendanceUser.card_id 
            });

        if (insertError) {
            return { success: false, message: insertError.message };
        }

        revalidatePath('/admin');
        revalidatePath('/dashboard/teams', 'page');
        revalidatePath('/dashboard/layout');
        
        return { 
            success: true, 
            message: `ユーザーを強制的に${newType === 'in' ? '出勤' : '退勤'}させました。` 
        };
    } catch (error) {
        console.error('Error in forceToggleAttendance:', error);
        return { success: false, message: '予期しないエラーが発生しました。' };
    }
}

/**
 * 日次出勤ログを全件取得
 */
export async function getAllDailyLogoutLogs() {
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('attendance')
        .from('daily_logout_logs')
        .select('*')
        .order('timestamp', { ascending: false });
}

/**
 * 月次出席サマリーを取得
 */
export async function getMonthlyAttendanceSummary(month: Date) {
    const supabase = await createSupabaseAdminClient();
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');

    const { data, error } = await (supabase as any).rpc('get_monthly_attendance_summary', { 
        start_date: start, 
        end_date: end 
    });

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
            summary[dateKey].byTeam[team_id].byGeneration[generation] = count;
        }
    }

    return summary;
}

/**
 * 日別出勤数を取得
 */
export async function getDailyAttendanceCounts(month: Date) {
    const supabase = await createSupabaseAdminClient();
    const start = format(startOfMonth(month), 'yyyy-MM-dd');
    const end = format(endOfMonth(month), 'yyyy-MM-dd');

    const { data, error } = await (supabase as any).rpc('get_monthly_attendance_summary', { 
        start_date: start, 
        end_date: end 
    });
    
    if (error) {
        console.error('Failed to fetch monthly attendance summary:', error);
        throw new Error('月次出席サマリーの取得に失敗しました');
    }

    const dailyCounts = new Map<string, number>();
    
    if (data) {
        for (const record of (data as any[])) {
            const dateKey = format(new Date(record.date), 'yyyy-MM-dd');
            dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + (record.count || 0));
        }
    }
    
    return dailyCounts;
}

/**
 * 特定日の出勤詳細を取得
 */
export async function getDailyAttendanceDetails(date: Date) {
    const supabase = await createSupabaseAdminClient();
    const targetDate = format(date, 'yyyy-MM-dd');
    
    const { data, error } = await (supabase as any).rpc('get_monthly_attendance_summary', { 
        start_date: targetDate, 
        end_date: targetDate 
    });
    
    if (error) {
        console.error('Failed to fetch daily attendance details:', error);
        throw new Error('日次出席詳細の取得に失敗しました');
    }

    type DailyDetail = {
        total: number;
        byTeam: Record<string, { name: string; total: number; byGeneration: Record<number, number> }>;
    };

    const detail: DailyDetail = { total: 0, byTeam: {} };
    
    if (data) {
        for (const record of (data as any[])) {
            const { team_id, team_name, generation, count } = record;
            if (!team_id || !team_name || count === null) continue;
            
            if (!detail.byTeam[team_id]) {
                detail.byTeam[team_id] = { name: team_name, total: 0, byGeneration: {} };
            }
            
            detail.total += count;
            detail.byTeam[team_id].total += count;
            detail.byTeam[team_id].byGeneration[generation] = count;
        }
    }
    
    return detail;
}

/**
 * 全体統計を取得
 */
export async function getOverallStats(days: number = 30) {
    const supabase = await createSupabaseAdminClient();
    const today = new Date();
    const startDate = format(subDays(today, days - 1), 'yyyy-MM-dd');
    const endDate = format(today, 'yyyy-MM-dd');

    try {
        // 総メンバー数
        const { count: totalMembers } = await supabase
            .schema('member')
            .from('members')
            .select('*', { count: 'exact', head: true })
            .is('deleted_at', null);

        // 今日の出席者数
        const { data: attendanceUsers } = await supabase
            .schema('attendance')
            .from('users')
            .select('supabase_auth_user_id');

        const attendanceUserIds = attendanceUsers?.map(u => u.supabase_auth_user_id) || [];

        const { data: todayAttendanceData } = await supabase
            .schema('attendance')
            .from('attendances')
            .select('user_id', { count: 'exact' })
            .eq('type', 'in')
            .gte('timestamp', startOfDay(today).toISOString())
            .lte('timestamp', endOfDay(today).toISOString())
            .in('user_id', attendanceUserIds);

        const uniqueTodayAttendees = todayAttendanceData 
            ? new Set(todayAttendanceData.map(d => d.user_id)).size 
            : 0;

        // 過去N日間の活動日数
        const { data: activityDays } = await supabase
            .schema('attendance')
            .from('attendances')
            .select('date', { count: 'exact' })
            .gte('date', startDate)
            .lte('date', endDate);

        const uniqueActivityDays = activityDays 
            ? new Set(activityDays.map(d => d.date)).size 
            : 0;

        // 過去N日間の合計活動時間
        const { data: activityHours } = await supabase
            .schema('attendance')
            .from('attendances')
            .select('user_id, type, timestamp')
            .gte('timestamp', subDays(today, days - 1).toISOString())
            .order('user_id')
            .order('timestamp');

        let totalHours = 0;
        if (activityHours) {
            const userSessions = new Map<string, Date[]>();
            activityHours.forEach((record: any) => {
                if (!userSessions.has(record.user_id)) {
                    userSessions.set(record.user_id, []);
                }
                userSessions.get(record.user_id)!.push(new Date(record.timestamp));
            });

            userSessions.forEach(timestamps => {
                for (let i = 0; i < timestamps.length - 1; i += 2) {
                    const diff = timestamps[i + 1].getTime() - timestamps[i].getTime();
                    totalHours += diff / (1000 * 60 * 60);
                }
            });
        }

        return {
            totalMembers: totalMembers || 0,
            todayAttendees: uniqueTodayAttendees,
            activityDays: uniqueActivityDays,
            totalHours: Math.round(totalHours * 10) / 10,
        };
    } catch (error) {
        console.error('Error in getOverallStats:', error);
        return {
            totalMembers: 0,
            todayAttendees: 0,
            activityDays: 0,
            totalHours: 0,
        };
    }
}
