
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Bot, UserCog } from "lucide-react";
import ClientRelativeTime from "@/app/dashboard/_components/ClientRelativeTime";

type DailyLogoutLog = {
  id: string;
  executed_at: string;
  status: string;
  affected_count: number;
};

interface LogsTabProps {
  dailyLogoutLogs: DailyLogoutLog[];
}

export default function LogsTab({
  dailyLogoutLogs,
}: LogsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>システムログ</CardTitle>
        <CardDescription>
          自動処理の実行ログを確認します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="auto_logout">
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="auto_logout">
                <Bot className="mr-2 h-4 w-4" />
                自動ログアウトログ
            </TabsTrigger>
          </TabsList>
          <TabsContent value="auto_logout">
             <Card>
                <CardContent className="pt-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>実行日時</TableHead>
                                <TableHead>ステータス</TableHead>
                                <TableHead>影響ユーザー数</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dailyLogoutLogs.map(log => (
                                <TableRow key={log.id}>
                                     <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{format(new Date(log.executed_at), "yyyy/MM/dd HH:mm", { locale: ja })}</span>
                                            <span className="text-xs text-muted-foreground"><ClientRelativeTime date={log.executed_at} /></span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={log.status === 'success' ? 'default' : 'destructive'}>{log.status}</Badge>
                                    </TableCell>
                                    <TableCell>{log.affected_count}人</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
