
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
import { checkDiscordMembership } from "@/app/actions";

async function UserProfile({ user, displayName }: { user: any; displayName: string }) {
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

function MainSidebar({ user, isAdmin, displayName }: { user: any, isAdmin: boolean, displayName: string }) {
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
        <UserProfile user={user} displayName={displayName} />
      </SidebarFooter>
    </>
  )
}

function MobileHeader({ user, isAdmin, displayName }: { user: any, isAdmin: boolean, displayName: string }) {
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
                    <MainSidebar user={user} isAdmin={isAdmin} displayName={displayName} />
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

  // プロフィールと勤怠ユーザーを並列取得
  const [profileResult, attendanceUserResult] = await Promise.all([
    supabase
      .schema('member')
      .from('members')
      .select('is_admin, discord_uid, display_name')
      .eq('supabase_auth_user_id', user.id)
      .single(),
    supabase
      .schema('attendance')
      .from('users')
      .select('card_id')
      .eq('supabase_auth_user_id', user.id)
      .single(),
  ]);

  const { data: profile, error: profileError } = profileResult;

  // member.membersに登録されていない場合は、メインシステム登録画面へ
  if (profileError || !profile) {
    console.error('Profile fetch error:', profileError);
    return redirect("/register/member-unregistered");
  }

  // Discordサーバーに参加しているか確認 + ニックネーム取得（1つのAPIコールで両方）
  let displayName = profile.display_name || '名無しさん';
  if (profile.discord_uid) {
    try {
      const discordCheck = await checkDiscordMembership(profile.discord_uid);
      if (discordCheck.success && !discordCheck.isInServer) {
        console.log('User not in Discord server, redirecting:', profile.discord_uid);
        return redirect("/register/discord-required");
      }
      // checkDiscordMembershipのレスポンスにニックネームが含まれる
      if (discordCheck.nickname && displayName === '名無しさん') {
        // ニックネームから名前部分を抽出（"1期 | 米川 明希" → "米川 明希"）
        const parts = discordCheck.nickname.split('|');
        const nameOnly = parts.length > 1 ? parts[parts.length - 1].trim() : discordCheck.nickname.trim();
        displayName = nameOnly;
        // DBにもキャッシュ保存（非同期）
        const adminClient = await createSupabaseAdminClient();
        adminClient.schema('member').from('members')
          .update({ display_name: nameOnly })
          .eq('discord_uid', profile.discord_uid!)
          .then(() => console.log(`Cached display_name for ${profile.discord_uid}`));
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
        throw error;
      }
      console.error('Discord membership check failed:', error);
      return redirect("/register/discord-required");
    }
  }

  const { data: attendanceUser, error: attendanceError } = attendanceUserResult;

  // attendanceUserレコード自体が存在しない場合は自動作成
  if (attendanceError?.code === 'PGRST116' || !attendanceUser) {
    console.log('No attendance user record found, auto-creating with temp card_id:', user.id);
    
    // attendance.users レコードを自動作成
    const adminClient = await createSupabaseAdminClient();
    const { error: createError } = await adminClient
      .schema('attendance')
      .from('users')
      .insert({
        supabase_auth_user_id: user.id,
        card_id: `TEMP_${user.id}`,  // 一時的なカードID（後でQRコードで実際のカードIDに更新可能）
      });
    
    if (createError) {
      console.error('Failed to auto-create attendance user:', createError);
      return redirect("/register/card-unregistered");
    }
    
    console.log('Auto-created attendance.users record with temp card_id');
    // 作成後、そのまま続行（attendanceUserは使われない）
  } else if (attendanceError) {
    console.error('Unexpected error fetching attendance user:', attendanceError);
    return redirect("/register/card-unregistered");
  }

  const isAdmin = profile.is_admin;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="hidden sm:flex">
            <MainSidebar user={user} isAdmin={isAdmin} displayName={displayName} />
        </Sidebar>
        <div className="flex flex-1 flex-col">
          <MobileHeader user={user} isAdmin={isAdmin} displayName={displayName} />
          <main className="flex-1 p-2 sm:p-4 bg-secondary/50">
              {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
