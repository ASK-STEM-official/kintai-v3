'use server';

import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * 仮登録情報を全件取得
 */
export async function getTempRegistrations() {
    const supabase = await createSupabaseAdminClient();
    return supabase
        .schema('attendance')
        .from('temp_registrations')
        .select('*')
        .order('created_at', { ascending: false });
}

/**
 * 仮登録トークンから情報を取得
 */
export async function getTempRegistrationByToken(token: string) {
    const supabase = await createSupabaseAdminClient();
    
    const { data, error } = await supabase
        .schema('attendance')
        .from('temp_registrations')
        .select('*')
        .eq('token', token)
        .single();

    if (error) {
        console.error('Error fetching temp registration:', error);
        return { data: null, error };
    }

    return { data, error: null };
}

/**
 * カードIDで本登録を完了
 */
export async function completeTempRegistration(token: string, cardId: string) {
    const supabase = await createSupabaseAdminClient();

    try {
        // トークンの検証
        const { data: tempReg, error: tempRegError } = await supabase
            .schema('attendance')
            .from('temp_registrations')
            .select('*')
            .eq('token', token)
            .single();

        if (tempRegError || !tempReg) {
            return { success: false, message: '無効なトークンです。' };
        }

        if (tempReg.completed_at) {
            return { success: false, message: 'この登録は既に完了しています。' };
        }

        // カードIDの重複チェック
        const normalizedCardId = cardId.toLowerCase().replace(/:/g, '');
        
        const { data: existingUser, error: checkError } = await supabase
            .schema('attendance')
            .from('users')
            .select('supabase_auth_user_id')
            .eq('card_id', normalizedCardId)
            .single();

        if (existingUser) {
            return { success: false, message: 'このカードIDは既に使用されています。' };
        }

        // attendance.usersにレコードを作成
        const { error: insertError } = await supabase
            .schema('attendance')
            .from('users')
            .insert({
                supabase_auth_user_id: tempReg.user_id,
                card_id: normalizedCardId,
            });

        if (insertError) {
            console.error('Error inserting user:', insertError);
            return { success: false, message: 'ユーザー登録に失敗しました。' };
        }

        // 仮登録を完了状態に
        const { error: updateError } = await supabase
            .schema('attendance')
            .from('temp_registrations')
            .update({ completed_at: new Date().toISOString() })
            .eq('token', token);

        if (updateError) {
            console.error('Error updating temp registration:', updateError);
        }

        return { success: true, message: '登録が完了しました！' };
    } catch (error) {
        console.error('Error in completeTempRegistration:', error);
        return { success: false, message: '予期しないエラーが発生しました。' };
    }
}

/**
 * 仮登録を削除
 */
export async function deleteTempRegistration(token: string) {
    const supabase = await createSupabaseAdminClient();
    
    return supabase
        .schema('attendance')
        .from('temp_registrations')
        .delete()
        .eq('token', token);
}
