
import { signOut } from "@/app/actions";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icons } from "@/components/icons";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import DashboardNav from "./components/DashboardNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getOAuthUser } from "@/lib/auth";
import { FormButton } from "@/components/ui/loading-button";

function UserProfile({ avatarUrl, email, displayName }: { avatarUrl?: string | null; email?: string | null; displayName: string }) {
  const initials = displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar>
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
            <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
            <span className="font-semibold text-sm">{displayName}</span>
            {email && <span className="text-xs text-muted-foreground">{email}</span>}
        </div>
      </div>
       <form action={signOut}>
          <FormButton variant="ghost" size="icon" title="ログアウト">
            <Icons.LogOut />
          </FormButton>
       </form>
    </div>
  )
}

function MainSidebar({ avatarUrl, email, isAdmin, displayName }: { avatarUrl?: string | null, email?: string | null, isAdmin: boolean, displayName: string }) {
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
        <UserProfile avatarUrl={avatarUrl} email={email} displayName={displayName} />
      </SidebarFooter>
    </>
  )
}

function MobileHeader({ isAdmin, displayName }: { isAdmin: boolean, displayName: string }) {
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
                    <MainSidebar isAdmin={isAdmin} displayName={displayName} />
                </SheetContent>
            </Sheet>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
        </header>
    )
}

/**
 * 認証 + 最低限のプロフィール取得のみ行う。
 * Discord API コールなど重い処理はレイアウトから除外。
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. 認証
  const oauthUser = await getOAuthUser();
  let userId: string;
  let avatarUrl: string | null = null;
  let email: string | null = null;

  if (oauthUser) {
    userId = oauthUser.id;
  } else {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return redirect("/login");
    userId = user.id;
    avatarUrl = user.user_metadata?.avatar_url ?? null;
    email = user.email ?? null;
  }

  // 2. プロフィール取得（admin client で高速 — RLS スキップ）
  const adminClient = await createSupabaseAdminClient();

  const [profileResult, attendanceResult] = await Promise.all([
    adminClient
      .schema('member')
      .from('members')
      .select('is_admin, display_name')
      .eq('supabase_auth_user_id', userId)
      .single(),
    adminClient
      .schema('attendance')
      .from('users')
      .select('card_id')
      .eq('supabase_auth_user_id', userId)
      .single(),
  ]);

  if (!profileResult.data) {
    return redirect("/register/member-unregistered");
  }

  // attendance.users が無ければ自動作成（fire-and-forget）
  if (attendanceResult.error?.code === 'PGRST116' || !attendanceResult.data) {
    adminClient
      .schema('attendance')
      .from('users')
      .insert({ supabase_auth_user_id: userId, card_id: `TEMP_${userId}` })
      .then(() => {});
  }

  const displayName = profileResult.data.display_name || oauthUser?.displayName || '名無しさん';
  const isAdmin = profileResult.data.is_admin;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar className="hidden sm:flex">
            <MainSidebar avatarUrl={avatarUrl} email={email} isAdmin={isAdmin} displayName={displayName} />
        </Sidebar>
        <div className="flex flex-1 flex-col">
          <MobileHeader isAdmin={isAdmin} displayName={displayName} />
          <main className="flex-1 p-2 sm:p-4 bg-secondary/50">
              {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
