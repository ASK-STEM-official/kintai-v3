import { signOut } from "@/app/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
import DashboardNav from "./_components/DashboardNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchMemberNickname } from "@/lib/name-api";

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
      // Discord UIDがある場合、APIから本名を取得
      if (profile.discord_uid) {
        try {
          const { data: nickname } = await fetchMemberNickname(profile.discord_uid);
          if (nickname) {
            displayName = nickname;
          }
        } catch (e) {
          // API エラーは無視
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

async function MainSidebar({ user, isAdmin }: { user: any, isAdmin: boolean }) {
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

  // member.members テーブルからプロフィールを取得
  const { data: profile, error: profileError } = await supabase
    .schema('member')
    .from('members')
    .select('is_admin')
    .eq('supabase_auth_user_id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profile fetch error:', profileError);
    console.error('User ID:', user.id);
    // プロフィールが見つからない場合は登録ページへ
    return redirect("/register/unregistered");
  }

  // attendance.users テーブルでカードが登録されているか確認
  const { data: attendanceUser } = await supabase
    .schema('attendance')
    .from('users')
    .select('card_id')
    .eq('supabase_auth_user_id', user.id)
    .single();

  // カードが未登録の場合は登録ページへリダイレクト
  if (!attendanceUser) {
    return redirect("/register/unregistered");
  }

  const isAdmin = profile.is_admin;

  return (
    <SidebarProvider>
      <Sidebar className="hidden sm:flex">
        <MainSidebar user={user} isAdmin={isAdmin} />
      </Sidebar>
      <div className="flex flex-col sm:pl-64">
        <MobileHeader user={user} isAdmin={isAdmin} />
        <main className="flex-1 p-4 sm:p-6 bg-secondary/50 min-h-screen">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
