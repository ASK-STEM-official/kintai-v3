import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { formatInTimeZone } from 'date-fns-tz';

export const dynamic = 'force-dynamic';

const timeZone = 'Asia/Tokyo';

export async function GET() {
  try {
    const supabase = await createSupabaseAdminClient();
    const todayDate = formatInTimeZone(new Date(), timeZone, 'yyyy-MM-dd');

    const { data, error } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('user_id')
      .eq('date', todayDate)
      .eq('type', 'in');

    if (error) {
      console.error('Error fetching attendance count:', error);
      return NextResponse.json({ success: false, message: 'DBエラー' }, { status: 500 });
    }

    const uniqueUserCount = new Set(data?.map(a => a.user_id)).size;

    return NextResponse.json({ success: true, date: todayDate, count: uniqueUserCount });
  } catch (error) {
    console.error('Error in attendance-count API route:', error);
    return NextResponse.json({ success: false, message: 'サーバー内部でエラーが発生しました。' }, { status: 500 });
  }
}
