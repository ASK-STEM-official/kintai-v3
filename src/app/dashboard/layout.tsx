
import { signOut } from "@/app/actions";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icons } from "@/components/icons";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import DashboardNav from "./components/DashboardNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchMemberNickname } from "@/lib/name-api";
import { checkDiscordMembership } from "@/app/actions";

async function UserProfile({ user }: { user: any }) {
  const supabase = await createSupabaseServerClient();
  
  let displayName = '名無しさん';
  
  try {
    const { data: profile, error } = await supabase
      .schema('member')
      .from('members')
      .select('discord_uid')
      .eq('supabase_auth_user_id', user.id)
      .single();
    
    if (!error && profile) {
      if (profile.discord_uid) {
        try {
          const { data: nickname } = await fetchMemberNickname(profile.discord_uid);
          if (nickname) {
            displayName = nickname;
          }
        } catch (e) {
          console.error('Failed to fetch nickname:', e);
        }
      }
    }
  } catch (e) {
    console.error('Failed to fetch profile:', e);
  }
  
  const initials = displayName.charAt(0).toUpperCase() || 'U';
  
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar>
            <AvatarImage src={user.user_metadata.avatar_url} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
            <span className="font-semibold text-sm">{displayName}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>
      </div>
       <form action={signOut}>
          <Button variant="ghost" size="icon" type="submit" title="ログアウト">
            <Icons.LogOut />
          </Button>
       </form>
    </div>
  )
}

function MainSidebar({ user, isAdmin }: { user: any, isAdmin: boolean }) {
  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icons.Logo className="w-6 h-6 text-primary" />
                <h2 className="font-semibold text-lg">STEM研究部</h2>
            </div>
            <ThemeToggle />
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <DashboardNav isAdmin={isAdmin} />
      </SidebarContent>
      <SidebarFooter>
        <UserProfile user={user} />
      </SidebarFooter>
    </>
  )
}

function MobileHeader({ user, isAdmin }: { user: any, isAdmin: boolean }) {
    return (
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 sm:hidden">
            <Sheet>
                <SheetTrigger asChild>
                    <Button size="icon" variant="outline" className="sm:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="sm:max-w-xs flex flex-col p-0">
                    <SheetTitle className="sr-only">ナビゲーションメニュー</SheetTitle>
                    <MainSidebar user={user} isAdmin={isAdmin} />
                </SheetContent>
            </Sheet>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
        </header>
    )
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .schema('member')
    .from('members')
    .select('is_admin, discord_uid')
    .eq('supabase_auth_user_id', user.id)
    .single();

  // member.membersに登録されていない場合は、メインシステム登録画面へ
  if (profileError || !profile) {
    console.error('Profile fetch error:', profileError);
    console.error('User ID:', user.id);
    return redirect("/register/member-unregistered");
  }

  // Discordサーバーに参加しているか確認
  if (profile.discord_uid) {
    try {
      const discordCheck = await checkDiscordMembership(profile.discord_uid);
      if (discordCheck.success && !discordCheck.isInServer) {
        // Discordサーバーに未参加の場合は専用ページへリダイレクト
        console.log('User not in Discord server, redirecting:', profile.discord_uid);
        return redirect("/register/discord-required");
      }
    } catch (error) {
      // redirectはエラーとしてthrowされるため、NEXT_REDIRECTの場合は再スロー
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        throw error;
      }
      // その他のDiscord確認エラーの場合も未参加として扱う
      console.error('Discord membership check failed:', error);
      return redirect("/register/discord-required");
    }
  }

  // カードID未登録でもダッシュボードにアクセス可能にする
  // （カード未登録の警告はpage.tsxで表示）
  const { data: attendanceUser, error: attendanceError } = await supabase
    .schema('attendance')
    .from('users')
    .select('card_id')
    .eq('supabase_auth_user_id', user.id)
    .single();

  // attendanceUserレコード自体が存在しない場合はカード未登録画面へ
  // （レコードは引き継ぎ時に作成される）
  if (attendanceError?.code === 'PGRST116' || !attendanceUser) {
    // PGRST116 = レコードが見つからない
    console.log('No attendance user record found, redirecting to card registration:', user.id);
    return redirect("/register/card-unregistered");
  } 
  
  if (attendanceError) {
    // その他のエラー（DB接続エラーなど）
    console.error('Unexpected error fetching attendance user:', attendanceError);
    return redirect("/register/card-unregistered");
  }

  const isAdmin = profile.is_admin;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="hidden sm:flex">
            <MainSidebar user={user} isAdmin={isAdmin} />
        </Sidebar>
        <div className="flex flex-1 flex-col">
          <MobileHeader user={user} isAdmin={isAdmin} />
          <main className="flex-1 p-2 sm:p-4 bg-secondary/50">
              {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
