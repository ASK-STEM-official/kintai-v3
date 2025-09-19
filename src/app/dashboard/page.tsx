import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BarChart, Calendar as CalendarIcon, Clock, Percent } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import AttendanceCalendar from "./_components/AttendanceCalendar";
import ClientRelativeTime from "./_components/ClientRelativeTime";
import { calculateTotalActivityTime } from "../actions";
import AdminAttendanceCalendar from "./_components/AdminAttendanceCalendar";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: profile } = await supabase.from('users').select('*, teams(name)').eq('id', user!.id).single();
    
    const [attendancesResult, totalActivityTime] = await Promise.all([
      supabase.from('attendances').select('*').eq('user_id', user!.id).order('timestamp', { ascending: false }).limit(5),
      calculateTotalActivityTime(user!.id)
    ]);
    
    const { data: attendances } = attendancesResult;

    // 1. Correctly count distinct attendance days for the user
    const { data: distinctDates, error: distinctDatesError } = await supabase
      .from('attendances')
      .select('date')
      .eq('user_id', user!.id)
      .eq('type', 'in');

    const userAttendanceDays = distinctDates ? new Set(distinctDates.map(d => d.date)).size : 0;
    
    // 2. Get total number of active club days (days where at least one person attended)
    const { data: totalClubActivityDates, error: totalClubActivityDatesError } = await supabase
      .from('attendances')
      .select('date')
      .eq('type', 'in');
    
    const totalClubDays = totalClubActivityDates ? new Set(totalClubActivityDates.map(d => d.date)).size : 0;

    // 3. Calculate attendance rate based on the new logic
    const attendanceRate = totalClubDays > 0 ? (userAttendanceDays / totalClubDays) * 100 : 0;
    
    const isAdmin = profile?.role === 1;

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold">マイダッシュボード</h1>
                <p className="text-muted-foreground">こんにちは, {profile?.display_name}さん！</p>
            </div>
            <div className="text-right">
                <Badge variant="secondary">{profile?.teams?.name}</Badge>
                <p className="text-sm text-muted-foreground">{profile?.generation}期生</p>
            </div>
        </div>
      
        <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">総出勤日数</CardTitle>
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{userAttendanceDays}日</div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">総活動時間 (概算)</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalActivityTime.toFixed(1)} 時間</div>
                    <p className="text-xs text-muted-foreground">
                        完了したセッションの合計
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">出勤率</CardTitle>
                    <Percent className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{attendanceRate.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                        活動総日数: {totalClubDays}日
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">直近の活動</CardTitle>
                    <BarChart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{attendances && attendances.length > 0 ? (attendances[0].type === 'in' ? '活動中' : '退勤済み') : '記録なし'}</div>
                </CardContent>
            </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
            <CardTitle>最近の出退勤記録</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>種別</TableHead>
                    <TableHead>日時</TableHead>
                    <TableHead>相対時間</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {attendances && attendances.length > 0 ? attendances.map((att) => (
                        <TableRow key={att.id}>
                            <TableCell>
                                <Badge variant={att.type === 'in' ? 'default' : 'secondary'}>
                                    {att.type === 'in' ? '出勤' : '退勤'}
                                </Badge>
                            </TableCell>
                            <TableCell>{format(new Date(att.timestamp), 'yyyy/MM/dd HH:mm:ss', {locale: ja})}</TableCell>
                            <TableCell><ClientRelativeTime date={att.timestamp} /></TableCell>
                        </TableRow>
                    )) : (
                        <TableRow>
                            <TableCell colSpan={3} className="text-center">記録がありません。</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>出勤カレンダー</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? <AdminAttendanceCalendar /> : <AttendanceCalendar userId={user!.id} />}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
