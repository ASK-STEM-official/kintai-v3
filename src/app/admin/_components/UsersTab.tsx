
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
import { ArrowUpDown, Search, RefreshCw, Edit, Eye } from "lucide-react"
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


export default function UsersTab({ users: initialUsers, teams, currentUser }: UsersTabProps) {
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'display_name', direction: 'asc' });
    const [isToggling, startToggleTransition] = useTransition();
    const [isUpdatingNames, startUpdatingNamesTransition] = useTransition();
    const [isUpdatingCardId, startUpdatingCardIdTransition] = useTransition();
    const [editingUser, setEditingUser] = useState<{ id: string; currentCardId: string } | null>(null);
    const [newCardId, setNewCardId] = useState('');

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
        let filtered = initialUsers.filter(user =>
            user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (user.card_id && user.card_id.toLowerCase().includes(searchTerm.toLowerCase()))
        );

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
    }, [initialUsers, searchTerm, sort]);

  return (
     <Card>
            <CardHeader>
                <CardTitle>ユーザー管理</CardTitle>
                <CardDescription>
                    ユーザー情報の表示と、手動での出退勤操作を行います。ユーザー情報の編集は中央管理システムで行ってください。
                </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="mb-4 flex items-center gap-4">
                 <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="表示名またはカードIDで検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHeader sortKey="display_name" currentSort={sort} onSort={handleSort}>表示名</SortableHeader>
                        <SortableHeader sortKey="team_name" currentSort={sort} onSort={handleSort}>班</SortableHeader>
                        <SortableHeader sortKey="generation" currentSort={sort} onSort={handleSort}>学年/期生</SortableHeader>
                        <SortableHeader sortKey="is_admin" currentSort={sort} onSort={handleSort}>役割</SortableHeader>
                        <SortableHeader sortKey="latest_attendance_type" currentSort={sort} onSort={handleSort}>現在の状態</SortableHeader>
                        <SortableHeader sortKey="card_id" currentSort={sort} onSort={handleSort}>カードID</SortableHeader>
                        <SortableHeader sortKey="deleted_at" currentSort={sort} onSort={handleSort}>アカウント</SortableHeader>
                        <TableHead>アクション</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredUsers?.map(user => (
                        <TableRow key={user.id} data-state={user.deleted_at ? "disabled" : ""} className={isToggling ? 'opacity-50' : ''}>
                            <TableCell className="font-medium">{user.display_name}</TableCell>
                            <TableCell>{user.team_name || '未所属'}</TableCell>
                            <TableCell>{convertGenerationToGrade(user.generation)}</TableCell>
                            <TableCell>
                                <Badge variant={user.is_admin ? "destructive" : "outline"}>{user.is_admin ? '管理者' : '部員'}</Badge>
                            </TableCell>
                             <TableCell>
                                <Badge variant={user.latest_attendance_type === 'in' ? 'default' : 'secondary'}>{user.latest_attendance_type === 'in' ? '出勤中' : '退勤'}</Badge>
                            </TableCell>
                            <TableCell className="font-mono">{user.card_id}</TableCell>
                             <TableCell>
                                <Badge variant={!user.deleted_at ? "default" : "secondary"}>{!user.deleted_at ? '有効' : '無効'}</Badge>
                            </TableCell>
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
                                    <Button size="sm" variant={user.latest_attendance_type === 'in' ? 'destructive' : 'default'} onClick={() => handleForceToggle(user.id)} disabled={isToggling}>
                                        {user.latest_attendance_type === 'in' ? '強制退勤' : '強制出勤'}
                                    </Button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </CardContent>
        </Card>
  )
}

    