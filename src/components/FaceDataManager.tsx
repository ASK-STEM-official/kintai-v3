"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ScanFace, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { deleteMyFaceData, deleteFaceDataForUser } from '@/app/actions';
import { formatJst } from '@/lib/utils';

interface Props {
  count: number;
  latest: string | null;
  adaptive: number;
  /** self=本人が自分のを削除 / admin=管理者が対象ユーザーのを削除 */
  mode: 'self' | 'admin';
  /** admin モード時の対象ユーザーID */
  userId?: string;
}

export default function FaceDataManager({ count, latest, adaptive, mode, userId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = mode === 'admin' && userId
        ? await deleteFaceDataForUser(userId)
        : await deleteMyFaceData();
      if (res.success) {
        toast({ title: '削除しました', description: `${res.deleted}件の顔データを削除しました。` });
        router.refresh();
      } else {
        toast({ variant: 'destructive', title: '削除に失敗しました', description: res.message });
      }
    } catch {
      toast({ variant: 'destructive', title: 'エラー', description: '削除中にエラーが発生しました。' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <ScanFace className="h-9 w-9 text-muted-foreground shrink-0" />
        <div>
          <p className="text-2xl font-bold">{count > 0 ? `${count}件` : '未登録'}</p>
          <p className="text-xs text-muted-foreground">
            {count > 0
              ? `最終登録: ${latest ? formatJst(new Date(latest), 'yyyy/MM/dd') : '-'}${adaptive > 0 ? ` ・適応学習 ${adaptive}件` : ''}`
              : '顔認証は登録されていません'}
          </p>
        </div>
      </div>

      {count > 0 && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={loading}>
              <Trash2 className="h-4 w-4 mr-1" /> 削除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>顔データを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                {mode === 'admin' ? 'このユーザーの' : 'あなたの'}登録済み顔データ {count} 件をすべて削除します。
                <br />
                この操作は取り消せません。削除後は顔認証での打刻ができなくなり、再登録が必要です。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                削除する
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
