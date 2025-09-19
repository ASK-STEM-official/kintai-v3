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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Edit, ArrowUpDown, Search } from "lucide-react"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { updateUser, logUserEdit, forceToggleAttendance } from '@/app/actions';
import { Tables } from '@/lib/types';
import { User } from '@supabase/supabase-js';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type UserWithTeamAndStatus = Tables<'users'> & {
    teams: { id: number, name: string } | null;
    status: 'in' | 'out';
};

type SortKey = keyof UserWithTeamAndStatus | 'teams.name';
type SortDirection = 'asc' | 'desc';

interface UsersTabProps {
    users: UserWithTeamAndStatus[];
    teams: Tables<'teams'>[];
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
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserWithTeamAndStatus | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'display_name', direction: 'asc' });
    const [users, setUsers] = useState(initialUsers);
    const [isToggling, startToggleTransition] = useTransition();

    const handleEdit = (user: UserWithTeamAndStatus) => {
        setEditingUser(user);
        setDialogOpen(true);
    }
    
    const handleForceToggle = (userId: string) => {
        startToggleTransition(async () => {
            const result = await forceToggleAttendance(userId);
            if (result.success) {
                toast({ title: "成功", description: result.message });
                setUsers(prevUsers => prevUsers.map(u => u.id === userId ? { ...u, status: u.status === 'in' ? 'out' : 'in' } : u));
            } else {
                toast({ variant: "destructive", title: "エラー", description: result.message });
            }
        });
    }

    const handleSort = (key: SortKey) => {
        setSort(prevSort => ({
            key,
            direction: prevSort.key === key && prevSort.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const sortedAndFilteredUsers = useMemo(() => {
        let filtered = users.filter(user =>
            user.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.card_id.toLowerCase().includes(searchTerm.toLowerCase())
        );

        filtered.sort((a, b) => {
            const key = sort.key;
            let valA: any, valB: any;

            if (key === 'teams.name') {
                valA = a.teams?.name || '';
                valB = b.teams?.name || '';
            } else {
                valA = a[key as keyof UserWithTeamAndStatus];
                valB = b[key as keyof UserWithTeamAndStatus];
            }
            
            if (typeof valA === 'string' && typeof valB === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });
        
        return filtered;
    }, [users, searchTerm, sort]);


    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!editingUser) return;
        
        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        
        const updatedData = {
            display_name: formData.get('display_name') as string,
            generation: Number(formData.get('generation')),
            team_id: Number(formData.get('team_id')),
            role: Number(formData.get('role')),
            is_active: formData.get('is_active') === 'on',
            card_id: formData.get('card_id') as string,
        };

        const result = await updateUser(editingUser.id, updatedData);

        if (result.success) {
            toast({ title: "成功", description: result.message });
            
            const changedFields = Object.keys(updatedData).filter(key => {
                const fieldKey = key as keyof typeof updatedData;
                return String(updatedData[fieldKey]) !== String(editingUser[fieldKey as keyof UserWithTeamAndStatus]);
            });

            for (const fieldName of changedFields) {
                const key = fieldName as keyof typeof updatedData;
                 await logUserEdit({
                    target_user_id: editingUser.id,
                    editor_user_id: currentUser.id,
                    field_name: key,
                    old_value: String(editingUser[key as keyof UserWithTeamAndStatus]),
                    new_value: String(updatedData[key]),
                });
            }

            setDialogOpen(false);
        } else {
            toast({ variant: "destructive", title: "エラー", description: result.message });
        }
        setIsSubmitting(false);
    }

  return (
     <Card>
            <CardHeader>
                <CardTitle>ユーザー管理</CardTitle>
                <CardDescription>
                    ユーザー情報の表示と編集、および手動での出退勤操作を行います。
                </CardDescription>
            </CardHeader>
            <CardContent>
            <div className="mb-4">
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="表示名またはカードIDで検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>
            <Table>
                <TableHeader>
                    <TableRow>
                        <SortableHeader sortKey="display_name" currentSort={sort} onSort={handleSort}>表示名</SortableHeader>
                        <SortableHeader sortKey="teams.name" currentSort={sort} onSort={handleSort}>班</SortableHeader>
                         <SortableHeader sortKey="generation" currentSort={sort} onSort={handleSort}>期生</SortableHeader>
                        <SortableHeader sortKey="role" currentSort={sort} onSort={handleSort}>役割</SortableHeader>
                        <SortableHeader sortKey="status" currentSort={sort} onSort={handleSort}>現在の状態</SortableHeader>
                        <SortableHeader sortKey="card_id" currentSort={sort} onSort={handleSort}>カードID</SortableHeader>
                        <SortableHeader sortKey="is_active" currentSort={sort} onSort={handleSort}>アカウント</SortableHeader>
                        <TableHead>アクション</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sortedAndFilteredUsers?.map(user => (
                        <TableRow key={user.id} data-state={!user.is_active ? "disabled" : ""}>
                            <TableCell className="font-medium">{user.display_name}</TableCell>
                            <TableCell>{user.teams?.name || '未所属'}</TableCell>
                            <TableCell>{user.generation}期生</TableCell>
                            <TableCell>
                                <Badge variant={user.role === 1 ? "destructive" : "outline"}>{user.role === 1 ? '管理者' : '部員'}</Badge>
                            </TableCell>
                             <TableCell>
                                <Badge variant={user.status === 'in' ? 'default' : 'secondary'}>{user.status === 'in' ? '出勤中' : '退勤'}</Badge>
                            </TableCell>
                            <TableCell className="font-mono">{user.card_id}</TableCell>
                             <TableCell>
                                <Badge variant={user.is_active ? "default" : "secondary"}>{user.is_active ? '有効' : '無効'}</Badge>
                            </TableCell>
                            <TableCell className="space-x-2 flex items-center">
                                <Button size="sm" variant="outline" onClick={() => handleForceToggle(user.id)} disabled={isToggling}>
                                    {user.status === 'in' ? '強制退勤させる' : '強制出勤させる'}
                                </Button>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button size="icon" variant="ghost" onClick={() => handleEdit(user)}>
                                                <Edit className="h-4 w-4" />
                                                <span className="sr-only">Edit user</span>
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>ユーザー情報を編集</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </CardContent>
             <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>ユーザー情報の編集</DialogTitle>
                            <DialogDescription>
                                {editingUser?.display_name} の情報を編集します。
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div>
                                <Label htmlFor="display_name">表示名</Label>
                                <Input id="display_name" name="display_name" defaultValue={editingUser?.display_name} required />
                            </div>
                            <div>
                                <Label htmlFor="generation">期生</Label>
                                <Input id="generation" name="generation" type="number" defaultValue={editingUser?.generation} required />
                            </div>
                            <div>
                                <Label htmlFor="team_id">班</Label>
                                <Select name="team_id" defaultValue={String(editingUser?.team_id)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="班を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {teams.map(team => (
                                            <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                             <div>
                                <Label htmlFor="role">役割</Label>
                                <Select name="role" defaultValue={String(editingUser?.role)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="役割を選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="0">部員</SelectItem>
                                        <SelectItem value="1">管理者</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div>
                                <Label htmlFor="card_id">カードID</Label>
                                <Input id="card_id" name="card_id" defaultValue={editingUser?.card_id} required />
                            </div>
                             <div className="flex items-center space-x-2">
                                <Switch id="is_active" name="is_active" defaultChecked={editingUser?.is_active} />
                                <Label htmlFor="is_active">アカウントを有効にする</Label>
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button variant="outline" type="button">キャンセル</Button>
                            </DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "保存中..." : "保存"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
  )
}
