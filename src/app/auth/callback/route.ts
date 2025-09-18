'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server'
import axios from 'axios';
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const discordToken = data.session.provider_token;
      const requiredServerId = process.env.NEXT_PUBLIC_DISCORD_SERVER_ID;
      
      if (!requiredServerId) {
        console.error('DISCORD_SERVER_ID is not set in environment variables.');
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=サーバーの設定に問題があります。(管理者に連絡してください)`);
      }

      if (discordToken) {
        try {
          const response = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
              'Authorization': `Bearer ${discordToken}`,
            },
          });
          
          const guilds = response.data;
          const isMember = guilds.some((guild: any) => guild.id === requiredServerId);

          if (isMember) {
            return NextResponse.redirect(`${origin}${next}`);
          } else {
            await supabase.auth.signOut();
            return NextResponse.redirect(`${origin}/login?error=指定されたDiscordサーバーのメンバーではありません。`);
          }
        } catch (e: any) {
          console.error('Error communicating with Discord API:', e.response?.data || e.message);
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?error=Discordとの通信中にエラーが発生しました。`);
        }
      } else {
         await supabase.auth.signOut();
         return NextResponse.redirect(`${origin}/login?error=Discordの認証トークンが見つかりませんでした。権限スコープを再確認してください。`);
      }
    } else {
      console.error('Supabase code exchange error:', error?.message);
    }
  }

  // Fallback for any other error cases
  return NextResponse.redirect(`${origin}/login?error=ユーザーを認証できませんでした。`)
}
