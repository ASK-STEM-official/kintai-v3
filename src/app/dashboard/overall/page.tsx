import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Users, Calendar as CalendarIcon, Clock, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";
import { getOverallStats } from "@/app/actions";
import OverallAttendanceCalendar from "@/app/dashboard/components/OverallAttendanceCalendar";

export const dynamic = 'force-dynamic';

export default async function OverallDashboardPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile, error: profileError } = await supabase
        .schema('member')
        .from('members')
        .select('is_admin')
        .eq('supabase_auth_user_id', user!.id)
        .single();
    
    if (profileError || !profile) {
        console.error('Profile fetch error:', profileError);
        console.error('User ID:', user.id);
        redirect('/register/member-unregistered');
    }

    // 全体統計を取得
    const stats = await getOverallStats(30);

    // 出席率の計算
    const attendanceRate = stats.totalMembers > 0 
        ? (stats.todayActiveUsers / stats.totalMembers) * 100 
        : 0;

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold">全体ダッシュボード</h1>
                <p className="text-muted-foreground">部活全体の勤怠統計</p>
            </div>
        </div>
      
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">今日の出席人数</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.todayActiveUsers}人</div>
                     <p className="text-xs text-muted-foreground">
                        現在活動中のメンバー
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">総部員数</CardTitle>
                    <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalMembers}人</div>
                    <p className="text-xs text-muted-foreground">
                        登録済みメンバー
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">活動日数</CardTitle>
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.activeDaysCount}日</div>
                    <p className="text-xs text-muted-foreground">
                        過去30日間
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">総活動時間</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalActivityHours}時間</div>
                    <p className="text-xs text-muted-foreground">
                        過去30日間（全員合計）
                    </p>
                </CardContent>
            </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">本日の出席率</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{attendanceRate.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                        {stats.todayActiveUsers} / {stats.totalMembers} 人が出席
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">1日平均活動時間</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">
                        {stats.activeDaysCount > 0 
                            ? (stats.totalActivityHours / stats.activeDaysCount).toFixed(1) 
                            : '0.0'}時間
                    </div>
                    <p className="text-xs text-muted-foreground">
                        過去30日間の平均
                    </p>
                </CardContent>
            </Card>
      </div>

      <div className="grid gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>出席カレンダー</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        日付をクリックすると、その日の班別・学年別の出席人数が表示されます
                    </p>
                </CardHeader>
                <CardContent>
                    <OverallAttendanceCalendar />
                </CardContent>
            </Card>
      </div>
    </div>
  );
}
