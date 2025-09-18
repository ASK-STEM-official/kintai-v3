import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersTab from "./_components/UsersTab";
import AnnouncementsTab from "./_components/AnnouncementsTab";
import LogsTab from "./_components/LogsTab";
import { getAllUsers, getAllTeams, getAllAnnouncements, getAllUserEditLogs, getAllDailyLogoutLogs } from "../actions";
import { User, Annoyed, History, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  const [
    usersResult,
    teamsResult,
    announcementsResult,
    userEditLogsResult,
    dailyLogoutLogsResult,
  ] = await Promise.all([
    getAllUsers(),
    getAllTeams(),
    getAllAnnouncements(),
    getAllUserEditLogs(),
    getAllDailyLogoutLogs(),
  ]);

  const { data: users, error: usersError } = usersResult;
  const { data: teams, error: teamsError } = teamsResult;
  const { data: announcements, error: announcementsError } = announcementsResult;
  const { data: userEditLogs, error: userEditLogsError } = userEditLogsResult;
  const { data: dailyLogoutLogs, error: dailyLogoutLogsError } = dailyLogoutLogsResult;

  const errors = [usersError, teamsError, announcementsError, userEditLogsError, dailyLogoutLogsError].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">管理者ダッシュボード</h1>
        <p className="text-muted-foreground">ユーザーとシステムを管理します。</p>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>データの読み込みエラー</AlertTitle>
            <AlertDescription>
                <ul className="list-disc pl-5">
                    {errors.map((error, index) => <li key={index}>{error.message}</li>)}
                </ul>
            </AlertDescription>
        </Alert>
      )}

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
