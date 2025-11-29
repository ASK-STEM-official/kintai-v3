
'use client';

import { useState, useMemo, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowUpDown, Search, RefreshCw, Edit, Eye, Filter } from "lucide-react"
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { forceToggleAttendance, updateAllUserDisplayNames, updateUserCardId } from '@/app/actions';
import { Tables } from '@/lib/types';
import { User } from '@supabase/supabase-js';
import { convertGenerationToGrade } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link";

type UserWithDetails = {
    id: string;
    display_name: string;
    card_id: string | null;
    team_name: string | null;
    team_id: string | null;
    generation: number;
    is_admin: boolean;
    latest_attendance_type: string | null;
    latest_timestamp: string | null;
    deleted_at: string | null;
    student_number: string | null;
    status: number;
};

type SortKey = keyof UserWithDetails;
type SortDirection = 'asc' | 'desc';

interface UsersTabProps {
    users: UserWithDetails[];
    teams: Tables<'member', 'teams'>[];
    currentUser: User;
}

type AttendanceStatus = 'not_clocked_in' | 'clocked_in' | 'clocked_out' | 'all';
type UserStatus = 0 | 1 | 2 | null; // 0: 中学生, 1: 高校生, 2: OB/OG

const SortableHeader = ({
  children,
  sortKey,
  currentSort,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  currentSort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) => {
  const isSorted = currentSort.key === sortKey;
  return (
    <TableHead onClick={() => onSort(sortKey)} className="cursor-pointer hover:bg-muted/50">
      <div className="flex items-center gap-2">
        {children}
        {isSorted && (
          <ArrowUpDown
            className={`h-4 w-4 transition-transform ${
              currentSort.direction === 'desc' ? 'rotate-180' : ''
            }`}
          />
        )}
        {!isSorted && <ArrowUpDown className="h-4 w-4 text-muted-foreground/50" />}
      </div>
    </TableHead>
  );
};


// ユーザーの現在の出勤状態を判定する関数
const getAttendanceStatus = (latestType: string | null, latestTimestamp: string | null): AttendanceStatus => {
    if (!latestTimestamp) return 'not_clocked_in';
    
    const now = new Date();
    const latest = new Date(latestTimestamp);
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    
    // 最後の記録が今日の0:00より前の場合、まだ出勤していない
    if (latest < todayMidnight) {
        return 'not_clocked_in';
    }
    
    // 今日の記録がある場合
    if (latestType === 'in') {
        return 'clocked_in'; // 出勤中
    } else {
        return 'clocked_out'; // 退勤済み
    }
};

const getStatusLabel = (status: number): string => {
    switch (status) {
        case 0: return '中学生';
        case 1: return '高校生';
        case 2: return 'OB/OG';
        default: return '不明';
    }
};

const getAttendanceStatusLabel = (status: AttendanceStatus): string => {
    switch (status) {
        case 'not_clocked_in': return '未出勤';
        case 'clocked_in': return '出勤中';
        case 'clocked_out': return '退勤済み';
        default: return '全て';
    }
};

const getAttendanceStatusBadgeVariant = (status: AttendanceStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'not_clocked_in': return 'outline';
        case 'clocked_in': return 'default';
        case 'clocked_out': return 'secondary';
        default: return 'outline';
    }
};

export default function UsersTab({ users: initialUsers, teams, currentUser }: UsersTabProps) {
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'display_name', direction: 'asc' });
    const [isToggling, startToggleTransition] = useTransition();
    const [isUpdatingNames, startUpdatingNamesTransition] = useTransition();
    const [isUpdatingCardId, startUpdatingCardIdTransition] = useTransition();
    const [editingUser, setEditingUser] = useState<{ id: string; currentCardId: string } | null>(null);
    const [newCardId, setNewCardId] = useState('');
    
    // フィルター状態
    const [filterStatus, setFilterStatus] = useState<UserStatus | 'all'>('all'); // 中学生/高校生/OB/OG
    const [filterAttendance, setFilterAttendance] = useState<AttendanceStatus>('all'); // 出勤状態
    const [filterHasCardId, setFilterHasCardId] = useState<boolean | 'all'>('all'); // カードID有無
    const [showFilters, setShowFilters] = useState(false);

    const handleForceToggle = (userId: string) => {
        startToggleTransition(async () => {
            const result = await forceToggleAttendance(userId);
            if (result.success) {
                toast({ title: "成功", description: result.message });
            } else {
                toast({ variant: "destructive", title: "エラー", description: result.message });
            }
        });
    }

    const handleUpdateAllNames = () => {
        startUpdatingNamesTransition(async () => {
            const result = await updateAllUserDisplayNames();
            toast({
                title: result.success ? "成功" : "エラー",
                description: result.message,
                variant: result.success ? "default" : "destructive",
            });
        });
    };

    const handleUpdateCardId = (userId: string) => {
        startUpdatingCardIdTransition(async () => {
            const result = await updateUserCardId(userId, newCardId);
            toast({
                title: result.success ? "成功" : "エラー",
                description: result.message,
                variant: result.success ? "default" : "destructive",
            });
            if (result.success) {
                setEditingUser(null);
                setNewCardId('');
            }
        });
    };

    const handleSort = (key: SortKey) => {
        setSort(prevSort => ({
            key,
            direction: prevSort.key === key && prevSort.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const sortedAndFilteredUsers = useMemo(() => {
        let filtered = initialUsers.filter(user => {
            // テキスト検索
            const matchesSearch = user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (user.card_id && user.card_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (user.student_number && user.student_number.toLowerCase().includes(searchTerm.toLowerCase()));
            
            if (!matchesSearch) return false;
            
            // ステータスフィルター (中学生/高校生/OB/OG)
            if (filterStatus !== 'all' && user.status !== filterStatus) return false;
            
            // 出勤状態フィルター
            if (filterAttendance !== 'all') {
                const attendanceStatus = getAttendanceStatus(user.latest_attendance_type, user.latest_timestamp);
                if (attendanceStatus !== filterAttendance) return false;
            }
            
            // カードID有無フィルター
            if (filterHasCardId !== 'all') {
                const hasCardId = !!user.card_id;
                if (hasCardId !== filterHasCardId) return false;
            }
            
            return true;
        });

        filtered.sort((a, b) => {
            const key = sort.key;
            let valA: any = a[key as keyof UserWithDetails];
            let valB: any = b[key as keyof UserWithDetails];
            
            if (typeof valA === 'string' && typeof valB === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return filtered;
    }, [initialUsers, searchTerm, sort, filterStatus, filterAttendance, filterHasCardId]);

  return (
     <Card>
            <CardHeader>
                <CardTitle>ユーザー管理</CardTitle>
                <CardDescription>
                    ユーザー情報の表示と、手動での出退勤操作を行います。({sortedAndFilteredUsers.length}名表示中 / 全{initialUsers.length}名)
                </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="mb-4 space-y-4">
                <div className="flex items-center gap-4">
                    <div className="relative flex-grow">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="表示名、カードID、学籍番号で検索..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
                        <Filter className="mr-2 h-4 w-4" />
                        {showFilters ? 'フィルターを隠す' : 'フィルター'}
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline">
                                <RefreshCw className={`mr-2 h-4 w-4 ${isUpdatingNames ? 'animate-spin' : ''}`} />
                                表示名を更新
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>全ユーザーの表示名を更新しますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                                Discordサーバーのニックネーム（本名）をAPI経由で取得し、このシステムの全ユーザーの表示名を上書きします。この操作は時間がかかる場合があります。
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction onClick={handleUpdateAllNames} disabled={isUpdatingNames}>
                                {isUpdatingNames ? '更新中...' : '実行する'}
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
                
                {showFilters && (
                    <Card className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>ステータス</Label>
                                <Select value={filterStatus === 'all' ? 'all' : String(filterStatus)} onValueChange={(val) => setFilterStatus(val === 'all' ? 'all' : Number(val) as UserStatus)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全て</SelectItem>
                                        <SelectItem value="0">中学生</SelectItem>
                                        <SelectItem value="1">高校生</SelectItem>
                                        <SelectItem value="2">OB/OG</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>出勤状態</Label>
                                <Select value={filterAttendance} onValueChange={(val) => setFilterAttendance(val as AttendanceStatus)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全て</SelectItem>
                                        <SelectItem value="not_clocked_in">未出勤</SelectItem>
                                        <SelectItem value="clocked_in">出勤中</SelectItem>
                                        <SelectItem value="clocked_out">退勤済み</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>カードID</Label>
                                <Select value={filterHasCardId === 'all' ? 'all' : String(filterHasCardId)} onValueChange={(val) => setFilterHasCardId(val === 'all' ? 'all' : val === 'true')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">全て</SelectItem>
                                        <SelectItem value="true">登録済み</SelectItem>
                                        <SelectItem value="false">未登録</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" size="sm" onClick={() => {
                                setFilterStatus('all');
                                setFilterAttendance('all');
                                setFilterHasCardId('all');
                            }}>
                                フィルターをクリア
                            </Button>
                        </div>
                    </Card>
                )}
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHeader sortKey="display_name" currentSort={sort} onSort={handleSort}>表示名</SortableHeader>
                        <SortableHeader sortKey="generation" currentSort={sort} onSort={handleSort}>学年/期生</SortableHeader>
                        <SortableHeader sortKey="status" currentSort={sort} onSort={handleSort}>ステータス</SortableHeader>
                        <SortableHeader sortKey="latest_attendance_type" currentSort={sort} onSort={handleSort}>出勤状態</SortableHeader>
                        <SortableHeader sortKey="card_id" currentSort={sort} onSort={handleSort}>カードID</SortableHeader>
                        <TableHead>アクション</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredUsers?.map(user => {
                        const attendanceStatus = getAttendanceStatus(user.latest_attendance_type, user.latest_timestamp);
                        return (
                        <TableRow key={user.id} className={isToggling ? 'opacity-50' : ''}>
                            <TableCell className="font-medium">{user.display_name}</TableCell>
                            <TableCell>{convertGenerationToGrade(user.generation)}</TableCell>
                            <TableCell>
                                <Badge variant="outline">{getStatusLabel(user.status)}</Badge>
                            </TableCell>
                            <TableCell>
                                <Badge variant={getAttendanceStatusBadgeVariant(attendanceStatus)}>
                                    {getAttendanceStatusLabel(attendanceStatus)}
                                </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{user.card_id || <span className="text-muted-foreground">未登録</span>}</TableCell>
                            <TableCell className="space-x-2">
                                <div className="flex items-center gap-2">
                                    <Button size="sm" variant="outline" asChild>
                                        <Link href={`/admin/users/${user.id}`}>
                                            <Eye className="h-4 w-4 mr-1" />
                                            詳細
                                        </Link>
                                    </Button>
                                    <Dialog open={editingUser?.id === user.id} onOpenChange={(open) => {
                                        if (!open) {
                                            setEditingUser(null);
                                            setNewCardId('');
                                        }
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" variant="outline" onClick={() => {
                                                setEditingUser({ id: user.id, currentCardId: user.card_id || '' });
                                                setNewCardId(user.card_id || '');
                                            }}>
                                                <Edit className="h-4 w-4 mr-1" />
                                                カードID
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>カードIDを変更</DialogTitle>
                                                <DialogDescription>
                                                    {user.display_name} さんのカードIDを変更します
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid gap-2">
                                                    <Label htmlFor="cardId">新しいカードID</Label>
                                                    <Input
                                                        id="cardId"
                                                        value={newCardId}
                                                        onChange={(e) => setNewCardId(e.target.value)}
                                                        placeholder="カードIDを入力"
                                                        className="font-mono"
                                                    />
                                                    <p className="text-sm text-muted-foreground">
                                                        現在: <code className="font-mono">{user.card_id || '未設定'}</code>
                                                    </p>
                                                </div>
                                            </div>
                                            <DialogFooter>
                                                <Button variant="outline" onClick={() => {
                                                    setEditingUser(null);
                                                    setNewCardId('');
                                                }}>
                                                    キャンセル
                                                </Button>
                                                <Button onClick={() => handleUpdateCardId(user.id)} disabled={isUpdatingCardId || !newCardId}>
                                                    {isUpdatingCardId ? '更新中...' : '更新'}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                    <Button size="sm" variant={attendanceStatus === 'clocked_in' ? 'destructive' : 'default'} onClick={() => handleForceToggle(user.id)} disabled={isToggling}>
                                        {attendanceStatus === 'clocked_in' ? '強制退勤' : '強制出勤'}
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
  )
}

    
