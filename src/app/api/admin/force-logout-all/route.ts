
import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { formatInTimeZone } from 'date-fns-tz';

export const dynamic = 'force-dynamic';

const timeZone = 'Asia/Tokyo';

export async function GET() {
  const now = new Date();

  try {
    const supabase = await createSupabaseAdminClient();
    const todayDate = formatInTimeZone(now, timeZone, 'yyyy-MM-dd');

    const { data: todayAttendances, error: attError } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('user_id, card_id, type, timestamp')
      .eq('date', todayDate)
      .order('timestamp', { ascending: false });

    if (attError) {
      console.error('Error fetching today attendances:', attError);
      return NextResponse.json({ success: false, message: `DBエラー: ${attError.message}` }, { status: 500 });
    }

    const userLatestMap = new Map<string, { user_id: string; card_id: string; type: string }>();
    todayAttendances?.forEach(att => {
      if (!userLatestMap.has(att.user_id)) {
        userLatestMap.set(att.user_id, { user_id: att.user_id, card_id: att.card_id, type: att.type });
      }
    });

    const usersToLogOut = Array.from(userLatestMap.values()).filter(u => u.type === 'in');

    if (usersToLogOut.length === 0) {
      await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'success' });
      return NextResponse.json({ success: true, message: '現在活動中のユーザーはいません。', count: 0 });
    }

    const attendanceRecords = usersToLogOut.map(user => ({
      user_id: user.user_id,
      card_id: user.card_id,
      type: 'out' as const,
      timestamp: now.toISOString(),
      date: todayDate,
    }));

    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert(attendanceRecords);

    if (insertError) {
      await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'error' });
      return NextResponse.json({ success: false, message: insertError.message }, { status: 500 });
    }

    await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: usersToLogOut.length, status: 'success' });

    return NextResponse.json({ success: true, message: `${usersToLogOut.length}人のユーザーを強制退勤させました。`, count: usersToLogOut.length });
  } catch (error) {
    console.error('Error in force-logout-all API route:', error);
    return NextResponse.json({ success: false, message: 'サーバー内部でエラーが発生しました。' }, { status: 500 });
  }
}
