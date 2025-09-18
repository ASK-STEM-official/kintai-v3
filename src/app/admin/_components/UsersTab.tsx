'use client';

import { useState } from 'react';
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Edit, LogIn, LogOut } from "lucide-react"
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { updateUser, logUserEdit, forceToggleAttendance } from '@/app/actions';
import { Tables } from '@/lib/types';
import { User } from '@supabase/supabase-js';

type UserWithTeam = Tables<'users'> & { teams: { id: number, name: string } | null };

interface UsersTabProps {
    users: UserWithTeam[];
    teams: Tables<'teams'>[];
    currentUser: User;
}

export default function UsersTab({ users, teams, currentUser }: UsersTabProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserWithTeam | null>(null);

    const handleEdit = (user: UserWithTeam) => {
        setEditingUser(user);
        setDialogOpen(true);
    }
    
    const handleForceToggle = async (userId: string) => {
        const result = await forceToggleAttendance(userId);
        if (result.success) {
            toast({ title: "成功", description: result.message });
        } else {
            toast({ variant: "destructive", title: "エラー", description: result.message });
        }
    }

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
                return String(updatedData[fieldKey]) !== String(editingUser[fieldKey]);
            });

            for (const fieldName of changedFields) {
                const key = fieldName as keyof typeof updatedData;
                 await logUserEdit({
                    target_user_id: editingUser.id,
                    editor_user_id: currentUser.id,
                    field_name: key,
                    old_value: String(editingUser[key]),
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
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>表示名</TableHead>
                        <TableHead>班 / 期生</TableHead>
                        <TableHead>役割</TableHead>
                        <TableHead>カードID</TableHead>
                        <TableHead>状態</TableHead>
                        <TableHead>アクション</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users?.map(user => (
                        <TableRow key={user.id}>
                            <TableCell className="font-medium">{user.display_name}</TableCell>
                            <TableCell>{user.teams?.name} / {user.generation}期生</TableCell>
                            <TableCell>
                                <Badge variant={user.role === 1 ? "destructive" : "outline"}>{user.role === 1 ? '管理者' : '部員'}</Badge>
                            </TableCell>
                            <TableCell className="font-mono">{user.card_id}</TableCell>
                             <TableCell>
                                <Badge variant={user.is_active ? "default" : "secondary"}>{user.is_active ? '有効' : '無効'}</Badge>
                            </TableCell>
                            <TableCell className="space-x-2 flex items-center">
                                <Button title="強制出退勤" aria-haspopup="true" size="icon" variant="ghost" onClick={() => handleForceToggle(user.id)}>
                                    <LogIn className="h-4 w-4" />
                                    <span className="sr-only">Force Toggle Attendance</span>
                                </Button>
                                <Button title="編集" aria-haspopup="true" size="icon" variant="ghost" onClick={() => handleEdit(user)}>
                                    <Edit className="h-4 w-4" />
                                    <span className="sr-only">Edit user</span>
                                </Button>
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
