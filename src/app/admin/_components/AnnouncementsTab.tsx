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
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from "@/app/actions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Database, Tables } from "@/lib/types";
import { PlusCircle, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { User } from "@supabase/supabase-js";

type AnnouncementWithUser = Tables<"announcements"> & {
  users: { display_name: string | null } | null;
};

interface AnnouncementsTabProps {
  announcements: AnnouncementWithUser[];
  currentUser: User;
}

export default function AnnouncementsTab({
  announcements,
  currentUser,
}: AnnouncementsTabProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentAnnouncement, setCurrentAnnouncement] =
    useState<AnnouncementWithUser | null>(null);

  const handleEdit = (announcement: AnnouncementWithUser) => {
    setCurrentAnnouncement(announcement);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setCurrentAnnouncement(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const data = {
      title: formData.get("title") as string,
      content: formData.get("content") as string,
      is_current: formData.get("is_current") === "on",
      author_id: currentUser.id,
    };

    let result;
    if (currentAnnouncement) {
      result = await updateAnnouncement(currentAnnouncement.id, data);
    } else {
      result = await createAnnouncement(data);
    }

    if (result.success) {
      toast({
        title: "成功",
        description: result.message,
      });
      setDialogOpen(false);
    } else {
      toast({
        variant: "destructive",
        title: "エラー",
        description: result.message,
      });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm("このお知らせを削除しますか？")) {
      const result = await deleteAnnouncement(id);
      if (result.success) {
        toast({
          title: "成功",
          description: result.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "エラー",
          description: result.message,
        });
      }
    }
  };
  
  const handleToggleCurrent = async (announcement: AnnouncementWithUser) => {
    const result = await updateAnnouncement(announcement.id, { is_current: !announcement.is_current });
     if (result.success) {
        toast({ title: "成功", description: result.message });
      } else {
        toast({ variant: "destructive", title: "エラー", description: result.message });
      }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>お知らせ管理</CardTitle>
        <CardDescription>
          Kiosk画面に表示するお知らせを作成、編集、削除します。
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
                    {currentAnnouncement ? "お知らせの編集" : "お知らせの新規作成"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label htmlFor="title">タイトル</Label>
                    <Input
                      id="title"
                      name="title"
                      defaultValue={currentAnnouncement?.title}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="content">内容</Label>
                    <Textarea
                      id="content"
                      name="content"
                      defaultValue={currentAnnouncement?.content}
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_current"
                      name="is_current"
                      defaultChecked={currentAnnouncement?.is_current}
                    />
                    <Label htmlFor="is_current">Kioskに表示する</Label>
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
              <TableHead>タイトル</TableHead>
              <TableHead>作成者</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>アクション</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {announcements.filter(a => a.is_active).map((announcement) => (
              <TableRow key={announcement.id}>
                <TableCell className="font-medium">{announcement.title}</TableCell>
                <TableCell>{announcement.users?.display_name}</TableCell>
                <TableCell>
                  {format(new Date(announcement.created_at), "yyyy/MM/dd HH:mm", {
                    locale: ja,
                  })}
                </TableCell>
                <TableCell>
                  {announcement.is_current ? (
                    <Badge>表示中</Badge>
                  ) : (
                    <Badge variant="secondary">非表示</Badge>
                  )}
                </TableCell>
                <TableCell className="space-x-2">
                  <Button variant="outline" size="icon" onClick={() => handleToggleCurrent(announcement)}>
                    {announcement.is_current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(announcement)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDelete(announcement.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
