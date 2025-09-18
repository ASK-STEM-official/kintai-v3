
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Tables } from "@/lib/types";
import ClientRelativeTime from "@/app/dashboard/_components/ClientRelativeTime";
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
  } from "@/components/ui/alert-dialog";
import { deleteTempRegistration } from "@/app/actions";

interface TempRegistrationsTabProps {
  tempRegistrations: Tables<'temp_registrations'>[];
}

export default function TempRegistrationsTab({ tempRegistrations: initialTempRegistrations }: TempRegistrationsTabProps) {
  const { toast } = useToast();
  
  const getStatus = (reg: Tables<'temp_registrations'>) => {
    if (reg.is_used) {
      return { text: "使用済み", variant: "default" as const };
    }
    if (new Date(reg.expires_at) < new Date()) {
      return { text: "期限切れ", variant: "secondary" as const };
    }
    if (reg.accessed_at) {
        return { text: "アクセス済み", variant: "outline" as const };
    }
    return { text: "有効", variant: "destructive" as const };
  };

  const handleDelete = async (id: string) => {
    const result = await deleteTempRegistration(id);
    if (result.success) {
      toast({ title: "成功", description: result.message });
    } else {
      toast({ variant: "destructive", title: "エラー", description: result.message });
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>仮登録管理</CardTitle>
        <CardDescription>
          Kioskで発行されたQRコードの仮登録情報を管理します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>カードID</TableHead>
              <TableHead>作成日時</TableHead>
              <TableHead>有効期限</TableHead>
              <TableHead>ステータス</TableHead>
              <TableHead>アクション</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialTempRegistrations.map((reg) => {
              const status = getStatus(reg);
              return (
                <TableRow key={reg.id}>
                  <TableCell className="font-mono">{reg.card_id}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{format(new Date(reg.created_at), "yyyy/MM/dd HH:mm", { locale: ja })}</span>
                      <span className="text-xs text-muted-foreground"><ClientRelativeTime date={reg.created_at} /></span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{format(new Date(reg.expires_at), "HH:mm:ss", { locale: ja })}</span>
                       <span className="text-xs text-muted-foreground"><ClientRelativeTime date={reg.expires_at} /></span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.text}</Badge>
                  </TableCell>
                  <TableCell>
                     <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" size="icon" disabled={reg.is_used}><Trash2 className="h-4 w-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>本当にこの仮登録を削除しますか？</AlertDialogTitle>
                            <AlertDialogDescription>
                                この操作は元に戻せません。
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>キャンセル</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(reg.id)}>削除</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
