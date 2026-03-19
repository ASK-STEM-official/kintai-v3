import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { subDays } from "date-fns";
import AttendanceCalendar from "./components/AttendanceCalendar";
import ClientRelativeTime from "./components/ClientRelativeTime";
import CardMigrationAlert from "./components/CardMigrationAlert";
import { calculateTotalActivityTime } from "../actions";
import { convertGenerationToGrade, formatJst } from "@/lib/utils";
import { redirect } from "next/navigation";
import { toZonedTime } from "date-fns-tz";
import { requireAuth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

const timeZone = 'Asia/Tokyo';

export default async function DashboardPage() {
    const { userId, supabase } = await requireAuth();

    // プロフィールと勤怠ユーザーを並列取得
    const [profileResult, attendanceUserResult] = await Promise.all([
      supabase
        .schema('member')
        .from('members')
        .select(`
            discord_uid,
            generation,
            is_admin,
            joined_at,
            discord_username,
            member_team_relations(teams(name))
        `)
        .eq('supabase_auth_user_id', userId)
        .single(),
      supabase
        .schema('attendance')
        .from('users')
        .select('card_id')
        .eq('supabase_auth_user_id', userId)
        .single(),
    ]);

    const { data: profile, error: profileError } = profileResult;

    if (profileError || !profile) {
        console.error('Profile fetch error:', profileError);
        redirect('/register/member-unregistered');
    }

    const hasCardId = attendanceUserResult.data?.card_id && attendanceUserResult.data.card_id.trim() !== '';

    // discord_usernameをDBから取得（Discord API不要）
    const displayName = profile.discord_username || '名無しさん';

    const today = toZonedTime(new Date(), timeZone);
    const thirtyDaysAgo = formatJst(subDays(today, 30), 'yyyy-MM-dd');
    const userCreatedAtDate = formatJst(new Date(profile!.joined_at), 'yyyy-MM-dd');

    // 出勤データの取得を全て並列化
    const [attendancesResult, totalActivityTimeInHours, distinctDatesResult, totalClubActivityDatesResult] = await Promise.all([
      supabase.schema('attendance').from('attendances').select('*').eq('user_id', userId).order('timestamp', { ascending: false }).limit(5),
      calculateTotalActivityTime(userId, 30),
      supabase
        .schema('attendance')
        .from('attendances')
        .select('date')
        .eq('user_id', userId)
        .eq('type', 'in')
        .gte('date', thirtyDaysAgo),
      supabase
        .schema('attendance')
        .from('attendances')
        .select('date')
        .eq('type', 'in')
        .gte('date', thirtyDaysAgo)
        .gte('date', userCreatedAtDate),
    ]);

    const { data: attendances } = attendancesResult;
    const { data: distinctDates } = distinctDatesResult;
    const { data: totalClubActivityDates } = totalClubActivityDatesResult;

    const userAttendanceDays = distinctDates ? new Set(distinctDates.map(d => d.date)).size : 0;
    const totalClubDays = totalClubActivityDates ? new Set(totalClubActivityDates.map(d => d.date)).size : 0;

    const attendanceRate = totalClubDays > 0 ? (userAttendanceDays / totalClubDays) * 100 : 0;

    const teamName = profile?.member_team_relations?.[0]?.teams?.name;

  return (
    <div className="space-y-6">
        {!hasCardId && (
            <CardMigrationAlert />
        )}
        
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-3xl font-bold">マイダッシュボード</h1>
                <p className="text-muted-foreground">こんにちは, {displayName}さん！</p>
            </div>
            <div className="text-right">
                {teamName && <Badge variant="secondary">{teamName}</Badge>}
                <p className="text-sm text-muted-foreground">{profile?.generation ? convertGenerationToGrade(profile.generation) : ''}</p>
            </div>
        </div>
      
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">出勤日数</CardTitle>
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{userAttendanceDays}日</div>
                     <p className="text-xs text-muted-foreground">
                        過去30日間
                    </p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">活動時間 (概算)</CardTitle>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{totalActivityTimeInHours.toFixed(1)} 時間</div>
                    <p className="text-xs text-muted-foreground">
                        過去30日間
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
                        活動日数(登録後): {totalClubDays}日
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
      <div className="grid gap-6">
        <div className="grid gap-6">
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
                                    <TableCell>{formatJst(new Date(att.timestamp), 'yyyy/MM/dd HH:mm:ss')}</TableCell>
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
                    <AttendanceCalendar userId={userId} />
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
