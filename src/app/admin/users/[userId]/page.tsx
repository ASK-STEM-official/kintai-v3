import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, subDays } from "date-fns";
import { ja } from "date-fns/locale";
import { redirect } from "next/navigation";
import { fetchMemberNickname } from "@/lib/name-api";
import { calculateTotalActivityTime } from "@/app/actions";
import { convertGenerationToGrade } from "@/lib/utils";
import { Calendar as CalendarIcon, Clock, Percent, BarChart } from "lucide-react";
import dynamicImport from "next/dynamic";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const AttendanceCalendar = dynamicImport(() => import("@/app/dashboard/components/AttendanceCalendar"), {
  ssr: false,
});

export const dynamic = 'force-dynamic';

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
    const resolvedParams = await params;
    const supabase = await createSupabaseServerClient();
    
    // 現在のユーザーが管理者かチェック
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
        redirect('/login');
    }
    
    const { data: currentProfile } = await supabase
        .schema('member')
        .from('members')
        .select('is_admin')
        .eq('supabase_auth_user_id', currentUser.id)
        .single();
    
    if (!currentProfile?.is_admin) {
        redirect('/dashboard');
    }
    
    // 対象ユーザーの情報を取得
    const { data: profile, error: profileError } = await supabase
        .schema('member')
        .from('members')
        .select(`
            discord_uid,
            generation,
            joined_at,
            member_team_relations(teams(name))
        `)
        .eq('supabase_auth_user_id', resolvedParams.userId)
        .single();
    
    if (profileError || !profile) {
        redirect('/admin');
    }

    // Discord UIDから本名を取得
    let displayName = '名無しさん';
    try {
      if (profile.discord_uid) {
          const { data: nickname } = await fetchMemberNickname(profile.discord_uid);
          if (nickname) {
              displayName = nickname;
          }
      }
    } catch (e) {
      console.error('Failed to fetch nickname:', e);
    }

    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const userCreatedAtDate = format(new Date(profile.joined_at), 'yyyy-MM-dd');

    const [attendancesResult, totalActivityTime] = await Promise.all([
      supabase.schema('attendance').from('attendances').select('*').eq('user_id', resolvedParams.userId).order('timestamp', { ascending: false }).limit(10),
      calculateTotalActivityTime(resolvedParams.userId, 30)
    ]);
    
    const { data: attendances } = attendancesResult;

    const { data: distinctDates } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('date')
      .eq('user_id', resolvedParams.userId)
      .eq('type', 'in')
      .gte('date', thirtyDaysAgo);

    const userAttendanceDays = distinctDates ? new Set(distinctDates.map(d => d.date)).size : 0;
    
    const { data: totalClubActivityDates } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('date')
      .eq('type', 'in')
      .gte('date', thirtyDaysAgo)
      .gte('date', userCreatedAtDate); 
    
    const totalClubDays = totalClubActivityDates ? new Set(totalClubActivityDates.map(d => d.date)).size : 0;

    const attendanceRate = totalClubDays > 0 ? (userAttendanceDays / totalClubDays) * 100 : 0;
    
    const teamName = profile?.member_team_relations?.[0]?.teams?.name;

  return (
    <div className="space-y-6">
        <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" asChild>
                <Link href="/admin">
                    <ArrowLeft className="h-4 w-4" />
                </Link>
            </Button>
            <div className="flex-1">
                <h1 className="text-3xl font-bold">{displayName}さんの出席詳細</h1>
                <p className="text-muted-foreground">
                    {teamName && <Badge variant="secondary" className="mr-2">{teamName}</Badge>}
                    {profile?.generation && convertGenerationToGrade(profile.generation)}
                </p>
            </div>
        </div>
      
        <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
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
                    <div className="text-2xl font-bold">{totalActivityTime.toFixed(1)} 時間</div>
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
                            <TableHead>カードID</TableHead>
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
                                    <TableCell className="font-mono text-sm">{att.card_id}</TableCell>
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
                    <AttendanceCalendar userId={resolvedParams.userId} />
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
