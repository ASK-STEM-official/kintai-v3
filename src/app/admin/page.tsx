import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersTab from "./_components/UsersTab";
import AnnouncementsTab from "./_components/AnnouncementsTab";
import LogsTab from "./_components/LogsTab";
import { getAllUsers, getAllTeams, getAllAnnouncements, getAllUserEditLogs, getAllDailyLogoutLogs } from "../actions";
import { User, Annoyed, History } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { data: users, error: usersError } = await getAllUsers();
  const { data: teams, error: teamsError } = await getAllTeams();
  const { data: announcements, error: announcementsError } = await getAllAnnouncements();
  const { data: userEditLogs, error: userEditLogsError } = await getAllUserEditLogs();
  const { data: dailyLogoutLogs, error: dailyLogoutLogsError } = await getAllDailyLogoutLogs();

  const supabase = await createSupabaseServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">管理者ダッシュボード</h1>
        <p className="text-muted-foreground">ユーザーとシステムを管理します。</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">
            <User className="mr-2 h-4 w-4" />
            ユーザー管理
          </TabsTrigger>
          <TabsTrigger value="announcements">
            <Annoyed className="mr-2 h-4 w-4" />
            お知らせ管理
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="mr-2 h-4 w-4" />
            ログ
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab 
            users={users || []} 
            teams={teams || []} 
            currentUser={currentUser!}
          />
        </TabsContent>
        <TabsContent value="announcements">
          <AnnouncementsTab 
            announcements={announcements || []} 
            currentUser={currentUser!}
          />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab 
            userEditLogs={userEditLogs || []} 
            dailyLogoutLogs={dailyLogoutLogs || []}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
