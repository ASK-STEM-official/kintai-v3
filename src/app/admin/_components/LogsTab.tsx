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

type UserEditLog = {
  id: string;
  created_at: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  editor: { display_name: string | null } | null;
  target: { display_name: string | null } | null;
};

type DailyLogoutLog = {
  id: string;
  executed_at: string;
  status: string;
  affected_count: number;
};

interface LogsTabProps {
  userEditLogs: UserEditLog[];
  dailyLogoutLogs: DailyLogoutLog[];
}

const getFieldNameJp = (fieldName: string) => {
    const map: Record<string, string> = {
        display_name: '表示名',
        generation: '期生',
        team_id: '班',
        role: '役割',
        is_active: '有効/無効',
        card_id: 'カードID'
    }
    return map[fieldName] || fieldName;
}

const getRoleName = (role: string) => (role === '1' ? '管理者' : '部員');
const getIsActiveName = (isActive: string) => (isActive === 'true' ? '有効' : '無効');

const formatValue = (field: string, value: string | null) => {
    if (value === null) return 'N/A';
    if (field === 'role') return getRoleName(value);
    if (field === 'is_active') return getIsActiveName(value);
    return value;
}


export default function LogsTab({
  userEditLogs,
  dailyLogoutLogs,
}: LogsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>システムログ</CardTitle>
        <CardDescription>
          データベースの変更履歴や自動処理の実行ログを確認します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="user_edits">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="user_edits">
                <UserCog className="mr-2 h-4 w-4" />
                ユーザー編集ログ
            </TabsTrigger>
            <TabsTrigger value="auto_logout">
                <Bot className="mr-2 h-4 w-4" />
                自動ログアウトログ
            </TabsTrigger>
          </TabsList>
          <TabsContent value="user_edits">
            <Card>
                <CardContent className="pt-6">
                    <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>日時</TableHead>
                        <TableHead>編集者</TableHead>
                        <TableHead>対象ユーザー</TableHead>
                        <TableHead>変更項目</TableHead>
                        <TableHead>変更前</TableHead>
                        <TableHead>変更後</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {userEditLogs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell>
                                <div className="flex flex-col">
                                    <span className="font-medium">{format(new Date(log.created_at), "yyyy/MM/dd HH:mm", { locale: ja })}</span>
                                    <span className="text-xs text-muted-foreground"><ClientRelativeTime date={log.created_at} /></span>
                                </div>
                            </TableCell>
                            <TableCell>{log.editor?.display_name || 'N/A'}</TableCell>
                            <TableCell>{log.target?.display_name || 'N/A'}</TableCell>
                            <TableCell>{getFieldNameJp(log.field_name)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatValue(log.field_name, log.old_value)}</TableCell>
                            <TableCell className="font-mono text-xs">{formatValue(log.field_name, log.new_value)}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                </CardContent>
            </Card>
          </TabsContent>
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
