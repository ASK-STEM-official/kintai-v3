"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { forceLogoutAll } from "@/app/actions";
import { LogOut } from "lucide-react";

export default function SystemTab() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleForceLogout = async () => {
    setIsSubmitting(true);
    const result = await forceLogoutAll();
    if (result.success) {
      toast({ title: "成功", description: result.message });
    } else {
      toast({
        variant: "destructive",
        title: "エラー",
        description: result.message,
      });
    }
    setIsSubmitting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>システム操作</CardTitle>
        <CardDescription>
          システム全体に影響する操作を実行します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Card className="bg-destructive/10 border-destructive max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive text-lg flex items-center gap-2">
              <LogOut /> 全員強制ログアウト
            </CardTitle>
            <CardDescription className="text-destructive/80">
              現在「出勤」状態のすべてのユーザーを強制的に「退勤」状態にします。この操作は元に戻せません。
              主に、サーバーの再起動後や日の終わりに状態をリセットするために使用します。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isSubmitting}>
                  {isSubmitting ? "処理中..." : "全員を強制ログアウトさせる"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    本当に全員を強制ログアウトさせますか？
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    これにより、現在活動中のすべてのユーザーが退勤扱いになります。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleForceLogout}>
                    実行する
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
