'use server';

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchMemberNickname } from "@/lib/name-api";

type UserWithDetails = {
    id: string;
    display_name: string;
    card_id: string | null;
    team_name: string | null;
    team_id: string | null;
    generation: number;
    is_admin: boolean;
    latest_attendance_type: string | null;
    latest_timestamp: string | null;
    deleted_at: string | null;
    student_number: string | null;
    status: number;
};

/**
 * すべてのユーザー情報を取得（管理画面用）
 */
export async function getAllUsersWithStatus(): Promise<{ data: UserWithDetails[], error: any }> {
    const supabase = await createSupabaseAdminClient();

    try {
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
        const { data: attendanceUsers } = await supabase
            .schema('attendance')
            .from('users')
            .select('supabase_auth_user_id, card_id');

        const cardMap = new Map(attendanceUsers?.map(u => [u.supabase_auth_user_id, u.card_id]) || []);

        // 最新の打刻情報を取得
        const memberIds = members?.map((m: any) => m.supabase_auth_user_id) || [];
        const { data: latestAttendances } = await supabase
            .schema('attendance')
            .from('attendances')
            .select('user_id, type, timestamp')
            .in('user_id', memberIds)
            .order('timestamp', { ascending: false });

        // 各ユーザーの最新打刻を抽出
        const latestAttendanceMap = new Map<string, { type: string; timestamp: string }>();
        latestAttendances?.forEach((att: any) => {
            if (!latestAttendanceMap.has(att.user_id)) {
                latestAttendanceMap.set(att.user_id, { type: att.type, timestamp: att.timestamp });
            }
        });

        // Discord UIDから本名を一括取得（エラー耐性を持たせる）
        const discordUids = members?.map((m: any) => m.discord_uid).filter(Boolean) || [];
        const nameMap = new Map<string, string>();
        
        // 本名取得API呼び出し（エラーが発生しても続行）
        await Promise.allSettled(
            discordUids.map(async (discord_uid: string) => {
                try {
                    const { data: nickname, error } = await fetchMemberNickname(discord_uid);
                    if (nickname && !error) {
                        nameMap.set(discord_uid, nickname);
                    }
                } catch (error) {
                    // 個別のエラーは無視して続行
                    console.warn(`Failed to fetch nickname for ${discord_uid}:`, error);
                }
            })
        );

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
                status: member.status ?? 0, // 0: 中学生, 1: 高校生, 2: OB/OG
            };
        }) || [];

        return { data: users, error: null };
    } catch (error) {
        console.error('Error in getAllUsersWithStatus:', error);
        return { data: [], error };
    }
}

/**
 * ユーザーの表示名を更新
 */
export async function updateUserDisplayName(userId: string, displayName: string) {
    const supabase = await createSupabaseAdminClient();
    
    const { error } = await supabase
        .schema('member')
        .from('members')
        .update({ display_name: displayName })
        .eq('supabase_auth_user_id', userId);
    
    return { success: !error, error };
}

/**
 * 全ユーザーの表示名を一括更新
 */
export async function updateAllUserDisplayNames() {
    const supabase = await createSupabaseAdminClient();

    try {
        const { data: members, error: fetchError } = await supabase
            .schema('member')
            .from('members')
            .select('supabase_auth_user_id, discord_uid');

        if (fetchError || !members) {
            return { success: false, message: 'ユーザーの取得に失敗しました。' };
        }

        let successCount = 0;
        let failCount = 0;

        // 並列処理で全ユーザーの名前を更新（エラー耐性）
        await Promise.allSettled(
            members.map(async (member: any) => {
                if (!member.discord_uid) return;

                try {
                    const { data: nickname, error } = await fetchMemberNickname(member.discord_uid);
                    
                    if (nickname && !error) {
                        const { error: updateError } = await supabase
                            .schema('member')
                            .from('members')
                            .update({ display_name: nickname })
                            .eq('supabase_auth_user_id', member.supabase_auth_user_id);

                        if (!updateError) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                    } else {
                        failCount++;
                    }
                } catch {
                    failCount++;
                }
            })
        );

        return {
            success: true,
            message: `更新完了: 成功 ${successCount}件、失敗 ${failCount}件`,
        };
    } catch (error) {
        console.error('Error updating all display names:', error);
        return { success: false, message: '更新中にエラーが発生しました。' };
    }
}

/**
 * ユーザーのカードIDを更新
 */
export async function updateUserCardId(userId: string, newCardId: string) {
    const supabase = await createSupabaseAdminClient();

    try {
        // カードIDを正規化（コロンを削除、小文字化）
        const normalizedCardId = newCardId.toLowerCase().replace(/:/g, '');

        // 既存のカードIDとの重複チェック
        const { data: existingUser, error: checkError } = await supabase
            .schema('attendance')
            .from('users')
            .select('supabase_auth_user_id')
            .eq('card_id', normalizedCardId)
            .neq('supabase_auth_user_id', userId)
            .single();

        if (existingUser) {
            return { success: false, message: 'このカードIDは既に使用されています。' };
        }

        // カードIDを更新
        const { error: updateError } = await supabase
            .schema('attendance')
            .from('users')
            .update({ card_id: normalizedCardId })
            .eq('supabase_auth_user_id', userId);

        if (updateError) {
            console.error('Error updating card ID:', updateError);
            return { success: false, message: 'カードIDの更新に失敗しました。' };
        }

        return { success: true, message: 'カードIDを更新しました。' };
    } catch (error) {
        console.error('Error in updateUserCardId:', error);
        return { success: false, message: '予期しないエラーが発生しました。' };
    }
}
