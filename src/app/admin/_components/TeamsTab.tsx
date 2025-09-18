"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTeam, updateTeam, deleteTeam } from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/lib/types";
import { PlusCircle, Edit, Trash2 } from "lucide-react";
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

interface TeamsTabProps {
  teams: Tables<"teams">[];
}

export default function TeamsTab({ teams: initialTeams }: TeamsTabProps) {
  const { toast } = useToast();
  const [teams, setTeams] = useState(initialTeams);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentTeam, setCurrentTeam] = useState<Tables<"teams"> | null>(null);

  const handleEdit = (team: Tables<"teams">) => {
    setCurrentTeam(team);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setCurrentTeam(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name") as string;

    if (!name) {
        toast({ variant: "destructive", title: "エラー", description: "班名を入力してください。" });
        setIsSubmitting(false);
        return;
    }

    let result;
    if (currentTeam) {
      result = await updateTeam(currentTeam.id, name);
    } else {
      result = await createTeam(name);
    }

    if (result.success) {
      toast({ title: "成功", description: result.message });
      setDialogOpen(false);
    } else {
      toast({ variant: "destructive", title: "エラー", description: result.message });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    const result = await deleteTeam(id);
    if (result.success) {
      toast({ title: "成功", description: result.message });
    } else {
      toast({ variant: "destructive", title: "エラー", description: result.message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>班の管理</CardTitle>
        <CardDescription>
          班の作成、編集、削除を行います。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-right mb-4">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNew}>
                <PlusCircle className="mr-2 h-4 w-4" />
                新規作成
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {currentTeam ? "班の編集" : "班の新規作成"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="name">班名</Label>
                    <Input
                      id="name"
                      name="name"
                      defaultValue={currentTeam?.name}
                      required
                    />
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
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>班名</TableHead>
              <TableHead>アクション</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialTeams.map((team) => (
              <TableRow key={team.id}>
                <TableCell>{team.id}</TableCell>
                <TableCell className="font-medium">{team.name}</TableCell>
                <TableCell className="space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(team)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                   <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" size="icon"><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>本当にこの班を削除しますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                                この操作は元に戻せません。ユーザーが所属している班は削除できません。
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(team.id)}>削除</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
