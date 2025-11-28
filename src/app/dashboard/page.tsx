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
import { format, subDays } from "date-fns";
import { ja } from "date-fns/locale";
import AttendanceCalendar from "./_components/AttendanceCalendar";
import ClientRelativeTime from "./_components/ClientRelativeTime";
import CardMigrationAlert from "./_components/CardMigrationAlert";
import { calculateTotalActivityTime } from "../actions";
import { convertGenerationToGrade } from "@/lib/utils";
import { redirect } from "next/navigation";
import { fetchMemberNickname } from "@/lib/name-api";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile, error: profileError } = await supabase
        .schema('member')
        .from('members')
        .select(`
            discord_uid,
            generation,
            is_admin,
            joined_at,
            member_team_relations(teams(name))
        `)
        .eq('supabase_auth_user_id', user!.id)
        .single();
    
    if (profileError || !profile) {
        console.error('Profile fetch error:', profileError);
        console.error('User ID:', user.id);
        redirect('/register/member-unregistered');
    }

    // カードID情報を取得
    const { data: attendanceUser } = await supabase
        .schema('attendance')
        .from('users')
        .select('card_id')
        .eq('supabase_auth_user_id', user!.id)
        .single();

    const hasCardId = attendanceUser?.card_id && attendanceUser.card_id.trim() !== '';


    // Discord UIDから本名を取得
    let displayName = '名無しさん';
    let firstname = '';
    let lastname = '';
    try {
      if (profile.discord_uid) {
          const { data: nickname } = await fetchMemberNickname(profile.discord_uid);
          if (nickname) {
              displayName = nickname;
              // 名前を分割（姓名の区切りは空白と仮定）
              const nameParts = nickname.split(/\s+/);
              if (nameParts.length >= 2) {
                  lastname = nameParts[0].toLowerCase();
                  firstname = nameParts[1].toLowerCase();
              }
          }
      }
    } catch (e) {
      console.error('Failed to fetch nickname:', e);
    }

    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const userCreatedAtDate = format(new Date(profile!.joined_at), 'yyyy-MM-dd');

    const [attendancesResult, totalActivityTime] = await Promise.all([
      supabase.schema('attendance').from('attendances').select('*').eq('user_id', user!.id).order('timestamp', { ascending: false }).limit(5),
      calculateTotalActivityTime(user!.id, 30)
    ]);
    
    const { data: attendances } = attendancesResult;

    const { data: distinctDates } = await supabase
      .schema('attendance')
      .from('attendances')
      .select('date')
      .eq('user_id', user!.id)
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
        {!hasCardId && (
            <CardMigrationAlert
                userId={user!.id}
                firstname={firstname}
                lastname={lastname}
            />
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
                    <AttendanceCalendar userId={user!.id} />
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
}
