import { signOut, getTeamsWithMemberStatus } from "@/app/actions";
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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, Moon, Sun } from "lucide-react";
import DashboardNav from "./_components/DashboardNav";
import { ThemeToggle } from "@/components/ThemeToggle";

async function UserProfile({ user }: { user: any }) {
  const { data: profile } = await createSupabaseServerClient().from('users').select('display_name').eq('id', user.id).single();
  const initials = profile?.display_name?.charAt(0).toUpperCase() || 'U';
  
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar>
            <AvatarImage src={user.user_metadata.avatar_url} alt={profile?.display_name} />
            <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
            <span className="font-semibold text-sm">{profile?.display_name || '名無しさん'}</span>
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

async function MainSidebar({ user, isAdmin, userTeamId }: { user: any, isAdmin: boolean, userTeamId: number | null }) {
  const teams = await getTeamsWithMemberStatus();

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
                <Icons.Logo className="w-6 h-6 text-primary" />
                <h2 className="font-semibold text-lg">AttendanceZen</h2>
            </div>
            <ThemeToggle />
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <DashboardNav isAdmin={isAdmin} teams={teams || []} userTeamId={userTeamId} />
      </SidebarContent>
      <SidebarFooter>
        <UserProfile user={user} />
      </SidebarFooter>
    </>
  )
}

function MobileHeader({ user, isAdmin, userTeamId }: { user: any, isAdmin: boolean, userTeamId: number | null }) {
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
                    <MainSidebar user={user} isAdmin={isAdmin} userTeamId={userTeamId} />
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

  const { data: profile, error } = await supabase.from('users').select('id, role, team_id').eq('id', user.id).single();

  if (!profile) {
    return redirect("/register/unregistered");
  }

  const isAdmin = profile.role === 1;

  return (
    <SidebarProvider>
      <Sidebar className="hidden sm:flex">
        <MainSidebar user={user} isAdmin={isAdmin} userTeamId={profile.team_id} />
      </Sidebar>
      <div className="flex flex-col sm:pl-64">
        <MobileHeader user={user} isAdmin={isAdmin} userTeamId={profile.team_id} />
        <main className="flex-1 p-4 sm:p-6 bg-secondary/50 min-h-screen">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
