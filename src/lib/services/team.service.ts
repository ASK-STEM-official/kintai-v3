'use server';

import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * 全チームを取得
 */
export async function getAllTeams() {
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('member')
        .from('teams')
        .select('*')
        .order('name');
}

/**
 * チームメンバーステータス付きでチーム情報を取得
 */
export async function getTeamsWithMemberStatus() {
    const supabase = await createSupabaseAdminClient();
    
    const { data: teams, error: teamsError } = await supabase
        .schema('member')
        .from('teams')
        .select('id, name')
        .order('name');
        
    if (teamsError) return [];

    const { data: memberTeamRelations, error: usersError } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('member_id, team_id');
        
    if (usersError || !memberTeamRelations) {
        return teams.map(t => ({ ...t, current: 0, total: 0 }));
    }
    
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

    const teamStats = teams.map(team => {
        const teamMembers = memberTeamRelations.filter(rel => rel.team_id === team.id);
        const currentlyIn = teamMembers.filter(member => 
            statusMap.get(member.member_id) === 'in'
        ).length;
        
        return {
            ...team,
            current: currentlyIn,
            total: teamMembers.length
        };
    });

    return teamStats;
}

/**
 * 特定のチームの詳細情報を取得
 */
export async function getTeamWithMembersStatus(teamId: number) {
    const supabase = await createSupabaseAdminClient();
    
    try {
        const { data: team, error: teamError } = await supabase
            .schema('member')
            .from('teams')
            .select('*')
            .eq('id', String(teamId))
            .single();
            
        if (teamError || !team) {
            return { team: null, members: [], stats: null, error: teamError?.message };
        }

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
            return { team, members: [], stats: null, error: membersError?.message };
        }

        const currentlyIn = data.filter((m: any) => m.latest_attendance_type === 'in').length;
        const stats = {
            totalMembers: data.length,
            currentlyIn,
            attendanceRate: data.length > 0 
                ? Math.round((currentlyIn / data.length) * 100) 
                : 0
        };

        return { team, members: data, stats, error: null };
    } catch (error) {
        console.error('Error in getTeamWithMembersStatus:', error);
        return { team: null, members: [], stats: null, error: 'サーバーエラー' };
    }
}

/**
 * 新しいチームを作成
 */
export async function createTeam(name: string) {
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('member')
        .from('teams')
        .insert({ name })
        .select()
        .single();
}

/**
 * チーム情報を更新
 */
export async function updateTeam(id: string, name: string) {
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('member')
        .from('teams')
        .update({ name })
        .eq('id', id)
        .select()
        .single();
}

/**
 * チームを削除
 */
export async function deleteTeam(id: string) {
    const supabase = await createSupabaseAdminClient();
    
    // 先に関連するmember_team_relationsを削除
    await supabase
        .schema('member')
        .from('member_team_relations')
        .delete()
        .eq('team_id', id);
    
    return supabase
        .schema('member')
        .from('teams')
        .delete()
        .eq('id', id);
}
