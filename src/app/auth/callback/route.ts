
'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchMemberStatus } from '@/lib/member-status-api';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=認証コードが見つかりません。`);
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Supabase code exchange error:', error.message);
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました: ${error.message}`);
  }

  if (!data.session || !data.user) {
    console.error('No session or user received from Supabase after code exchange.');
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました。`);
  }
  
  const discordUid = data.user.user_metadata.provider_id;
  if (!discordUid) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=DiscordユーザーIDが取得できませんでした。`);
  }

  const { data: memberStatus, error: apiError } = await fetchMemberStatus(discordUid);
  
  if (apiError) {
      console.error('Error fetching member status from API:', apiError);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=APIとの通信中にエラーが発生しました。`);
  }

  if (memberStatus && memberStatus.is_in_server) {
      return NextResponse.redirect(`${origin}${next}`);
  } else {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=指定されたDiscordサーバーのメンバーではありません。`);
  }
}

    
