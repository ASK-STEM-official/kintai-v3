import { signOut, getAllTeams } from "@/app/actions";
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
import { Menu } from "lucide-react";
import DashboardNav from "./_components/DashboardNav";

async function UserProfile({ user }: { user: any }) {
  const { data: profile } = await createSupabaseServerClient().from('users').select('display_name').eq('id', user.id).single();
  const initials = profile?.display_name?.charAt(0).toUpperCase() || 'U';
  
  return (
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
  )
}

async function MainSidebar({ user, isAdmin }: { user: any, isAdmin: boolean }) {
  const { data: teams } = await getAllTeams();

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2">
            <Icons.Logo className="w-6 h-6 text-primary" />
            <h2 className="font-semibold text-lg">AttendanceZen</h2>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <DashboardNav isAdmin={isAdmin} teams={teams || []} />
      </SidebarContent>
      <SidebarFooter>
        <UserProfile user={user} />
      </SidebarFooter>
    </>
  )
}

function MobileHeader({ user, isAdmin }: { user: any, isAdmin: boolean }) {
    return (
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 sm:static sm:h-auto sm:border-0 sm:bg-transparent sm:px-6">
            <Sheet>
                <SheetTrigger asChild>
                    <Button size="icon" variant="outline" className="sm:hidden">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="sm:max-w-xs flex flex-col p-0">
                    <MainSidebar user={user} isAdmin={isAdmin} />
                </SheetContent>
            </Sheet>
            <div className="ml-auto">
              <form action={signOut}>
                <Button variant="outline" size="icon" type="submit"><Icons.LogOut /></Button>
              </form>
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

  const { data: profile, error } = await supabase.from('users').select('id, role').eq('id', user.id).single();

  if (!profile) {
    return redirect("/register/unregistered");
  }

  const isAdmin = profile.role === 1;

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
