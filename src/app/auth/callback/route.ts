import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const discordToken = data.session.provider_token;
      const requiredServerId = process.env.DISCORD_SERVER_ID;

      if (!requiredServerId) {
        console.error('DISCORD_SERVER_ID is not set in environment variables.');
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=サーバーの設定に問題があります。`);
      }

      if (discordToken) {
        try {
          const response = await fetch('https://discord.com/api/users/@me/guilds', {
            headers: {
              'Authorization': `Bearer ${discordToken}`,
            },
          });

          if (response.ok) {
            const guilds = await response.json();
            const isMember = guilds.some((guild: any) => guild.id === requiredServerId);

            if (isMember) {
              // User is a member, redirect to the intended page
              return NextResponse.redirect(`${origin}${next}`);
            } else {
              // User is not a member, sign out and redirect to login with an error
              await supabase.auth.signOut();
              return NextResponse.redirect(`${origin}/login?error=指定されたDiscordサーバーのメンバーではありません。`);
            }
          } else {
             // Failed to fetch guilds
             await supabase.auth.signOut();
             const errorBody = await response.json();
             console.error('Failed to fetch Discord guilds:', errorBody);
             return NextResponse.redirect(`${origin}/login?error=Discordサーバーの情報を取得できませんでした。`);
          }
        } catch (e) {
          // Network or other errors
          await supabase.auth.signOut();
          console.error('Error communicating with Discord:', e);
          return NextResponse.redirect(`${origin}/login?error=Discordとの通信中にエラーが発生しました。`);
        }
      } else {
        // No discord token available in session
         await supabase.auth.signOut();
         return NextResponse.redirect(`${origin}/login?error=Discordの認証トークンが見つかりませんでした。権限スコープを確認してください。`);
      }
    }
  }

  // Fallback for any other error cases
  return NextResponse.redirect(`${origin}/login?error=ユーザーを認証できませんでした。`)
}
