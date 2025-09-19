import { getTeamWithMembersStatus } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, Users, Calendar, BarChart3, Clock, Lock } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ClientRelativeTime from "../../_components/ClientRelativeTime";
import { convertGenerationToGrade } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export default async function TeamStatusPage({ params }: { params: { id: string } }) {
    const teamId = Number(params.id);
    const { team, members, stats, error } = await getTeamWithMembersStatus(teamId);

    if (error === 'Access denied') {
         return (
             <Alert variant="destructive">
                <Lock className="h-4 w-4" />
                <AlertTitle>アクセスが拒否されました</AlertTitle>
                <AlertDescription>
                    この班の情報を閲覧する権限がありません。
                     <Button variant="link" asChild><Link href="/dashboard">ダッシュボードに戻る</Link></Button>
                </AlertDescription>
            </Alert>
        )
    }

    if (!team) {
        return (
             <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>エラー</AlertTitle>
                <AlertDescription>
                    指定された班が見つかりません。
                </AlertDescription>
            </Alert>
        )
    }
    
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/dashboard">
                        <ArrowLeft />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {team.name} 班統計
                    </h1>
                    <p className="text-muted-foreground">班全体の出勤状況と統計情報</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">班員数</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.totalMembers || 0}人</div>
                        <p className="text-xs text-muted-foreground">登録済み班員</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">今日の出勤</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.todayAttendees || 0}人</div>
                        <p className="text-xs text-muted-foreground">出勤率: {stats?.todayAttendanceRate.toFixed(0) || 0}%</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">平均出勤率 (対活動日)</CardTitle>
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats?.averageAttendanceRate30d.toFixed(0) || 0}%</div>
                        <p className="text-xs text-muted-foreground">過去30日間</p>
                    </CardContent>
                </Card>
            </div>
            
            <Card>
                <CardHeader>
                    <CardTitle>班員一覧</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {members.map(member => {
                        const status = member.status;
                        const timestamp = member.timestamp;
                        const initials = member.display_name.substring(0, 2).toUpperCase();

                        return (
                            <div key={member.id} className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-4">
                                     <Avatar>
                                        <AvatarFallback>{initials}</AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-semibold">{member.display_name}</p>
                                        <p className="text-sm text-muted-foreground">{convertGenerationToGrade(member.generation)}</p>
                                    </div>
                                </div>
                                {status === 'in' ? (
                                    <Badge>
                                        出勤中
                                        {timestamp && (
                                            <span className="ml-2 flex items-center gap-1">
                                                <Clock className="h-3 w-3"/>
                                                <ClientRelativeTime date={timestamp} />
                                            </span>
                                        )}
                                    </Badge>
                                ) : (
                                    <Badge variant="secondary">退勤</Badge>
                                )}
                            </div>
                        )
                    })}
                </CardContent>
            </Card>
        </div>
    )
}
