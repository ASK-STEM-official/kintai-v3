import { getTeamWithMembersStatus } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, LogIn, LogOut, Users2 } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function TeamStatusPage({ params }: { params: { id: string } }) {
    const teamId = Number(params.id);
    const { team, members } = await getTeamWithMembersStatus(teamId);

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

    const membersIn = members.filter(m => m.latest_attendance[0]?.type === 'in');
    const membersOut = members.filter(m => m.latest_attendance[0]?.type !== 'in');
    
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Users2 />
                    {team.name}
                </h1>
                <p className="text-muted-foreground">班のメンバーのリアルタイム出退勤状況</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-500">
                            <LogIn /> 在室メンバー ({membersIn.length}人)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {membersIn.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>名前</TableHead>
                                        <TableHead>期生</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {membersIn.map(member => (
                                        <TableRow key={member.id}>
                                            <TableCell>{member.display_name}</TableCell>
                                            <TableCell>{member.generation}期生</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-muted-foreground">現在、在室中のメンバーはいません。</p>
                        )}
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-gray-500">
                            <LogOut /> 退室メンバー ({membersOut.length}人)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                         {membersOut.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>名前</TableHead>
                                        <TableHead>期生</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {membersOut.map(member => (
                                        <TableRow key={member.id}>
                                            <TableCell>{member.display_name}</TableCell>
                                            <TableCell>{member.generation}期生</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-muted-foreground">現在、退室中のメンバーはいません。</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
