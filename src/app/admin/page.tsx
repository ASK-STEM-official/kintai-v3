
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersTab from "./_components/UsersTab";
import LogsTab from "./_components/LogsTab";
import TeamsTab from "./_components/TeamsTab";
import SystemTab from "./_components/SystemTab";
import { getAllUsersWithStatus, getAllTeams, getAllDailyLogoutLogs, getTempRegistrations } from "../actions";
import { User, History, AlertCircle, Users2, Power, FilePenLine } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import TempRegistrationsTab from "./_components/TempRegistrationsTab";

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user: currentUser } } = await supabase.auth.getUser();

  if (!currentUser) {
    // This case should be handled by layout, but as a safeguard.
    return (
       <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Authentication Error</AlertTitle>
            <AlertDescription>Could not retrieve user session.</AlertDescription>
        </Alert>
    );
  }

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
        <h1 className="text-3xl font-bold">邂｡逅・・ム繝・す繝･繝懊・繝・/h1>
        <p className="text-muted-foreground">繝ｦ繝ｼ繧ｶ繝ｼ縺ｨ繧ｷ繧ｹ繝・Β繧堤ｮ｡逅・＠縺ｾ縺吶・/p>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>繝・・繧ｿ縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ繧ｨ繝ｩ繝ｼ</AlertTitle>
            <AlertDescription>
                <ul className="list-disc pl-5">
                    {errors.map((error, index) => <li key={index}>{(error as Error).message}</li>)}
                </ul>
            </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="users">
            <User className="mr-2 h-4 w-4" />
            繝ｦ繝ｼ繧ｶ繝ｼ邂｡逅・
          </TabsTrigger>
          <TabsTrigger value="teams">
            <Users2 className="mr-2 h-4 w-4" />
            迴ｭ邂｡逅・
          </TabsTrigger>
           <TabsTrigger value="temp_registrations">
            <FilePenLine className="mr-2 h-4 w-4" />
            莉ｮ逋ｻ骭ｲ邂｡逅・
          </TabsTrigger>
          <TabsTrigger value="logs">
            <History className="mr-2 h-4 w-4" />
            繝ｭ繧ｰ
          </TabsTrigger>
           <TabsTrigger value="system">
            <Power className="mr-2 h-4 w-4" />
            繧ｷ繧ｹ繝・Β
          </TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <UsersTab 
            users={users || []} 
            teams={teams || []} 
            currentUser={currentUser}
          />
        </TabsContent>
        <TabsContent value="teams">
          <TeamsTab teams={teams || []} />
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
