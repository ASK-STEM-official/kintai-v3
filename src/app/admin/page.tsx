
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersTab from "./components/UsersTab";
import LogsTab from "./components/LogsTab";
import SystemTab from "./components/SystemTab";
import { getAllUsersWithStatus, getAllTeams, getAllDailyLogoutLogs, getTempRegistrations } from "../actions";
import { User, History, AlertCircle, Power, FilePenLine } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import TempRegistrationsTab from "./components/TempRegistrationsTab";
import { requireAuth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const { userId } = await requireAuth();

  const [
    usersResult,
    teamsResult,
    dailyLogoutLogsResult,
    tempRegistrationsResult,
  ] = await Promise.all([
    getAllUsersWithStatus(),
    getAllTeams(),
    getAllDailyLogoutLogs(),
    getTempRegistrations(),
  ]);

  const { data: users, error: usersError } = usersResult;
  const { data: teams, error: teamsError } = teamsResult;
  const { data: dailyLogoutLogs, error: dailyLogoutLogsError } = dailyLogoutLogsResult;
  const { data: tempRegistrations, error: tempRegistrationsError } = tempRegistrationsResult;


  const errors = [usersError, teamsError, dailyLogoutLogsError, tempRegistrationsError].filter(Boolean);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">管理者ダッシュボード</h1>
        <p className="text-muted-foreground">ユーザーとシステムを管理します。</p>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>データの読み込みエラー</AlertTitle>
            <AlertDescription>
                <ul className="list-disc pl-5">
                    {errors.map((error, index) => <li key={index}>{(error as Error).message}</li>)}
                </ul>
            </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">
            <User className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">ユーザー管理</span>
          </TabsTrigger>
          <TabsTrigger value="temp_registrations">
            <FilePenLine className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">仮登録管理</span>
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">ログ</span>
          </TabsTrigger>
          <TabsTrigger value="system">
            <Power className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">システム</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab
            users={users || []}
            teams={teams || []}
            currentUser={{ id: userId } as any}
          />
        </TabsContent>
         <TabsContent value="temp_registrations">
            <TempRegistrationsTab tempRegistrations={tempRegistrations || []} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab 
            dailyLogoutLogs={dailyLogoutLogs || []}
          />
        </TabsContent>
         <TabsContent value="system">
          <SystemTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
