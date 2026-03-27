
import { NextResponse } from 'next/server';
import { forceLogoutAll } from '@/app/actions';
import { toZonedTime } from 'date-fns-tz';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timeZone = 'Asia/Tokyo';
  const now = toZonedTime(new Date(), timeZone);

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // JSTの22:50から23:50までの間かチェック
  const isTimeWindowActive = 
    (currentHour === 22 && currentMinute >= 50) || 
    (currentHour === 23 && currentMinute <= 50);

  if (!isTimeWindowActive) {
    return NextResponse.json(
      { success: false, message: '現在、この機能は利用できません。JST 22:50から23:50の間のみ有効です。' },
      { status: 403 } // Forbidden
    );
  }

  try {
    const result = await forceLogoutAll();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in force-logout-all API route:', error);
    return NextResponse.json(
      { success: false, message: 'サーバー内部でエラーが発生しました。' },
      { status: 500 }
    );
  }
}
