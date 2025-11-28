'use server';

import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * 全ユーザーを強制退勤させる
 */
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

    const attendanceRecords = usersToLogOut.map(user => ({ 
        user_id: user.user_id, 
        card_id: user.card_id, 
        type: 'out' as const 
    }));
    
    const { error: insertError } = await supabase
        .schema('attendance')
        .from('attendances')
        .insert(attendanceRecords);

    if (insertError) {
        await supabase.schema('attendance').from('daily_logout_logs').insert({ 
            affected_count: 0, 
            status: 'error' 
        });
        return { success: false, message: insertError.message };
    }

    await supabase.schema('attendance').from('daily_logout_logs').insert({ 
        affected_count: usersToLogOut.length, 
        status: 'success' 
    });

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    
    return { 
        success: true, 
        message: `${usersToLogOut.length}人のユーザーを強制退勤させました。`, 
        count: usersToLogOut.length 
    };
}
