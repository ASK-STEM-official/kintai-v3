"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ScanFace, Trash2 } from 'lucide-react';
import { getFaceDataForUser, deleteFaceDataForUser } from '@/app/actions';
import { formatJst } from '@/lib/utils';

// 管理者のユーザー一覧から、その人の顔データを個別に確認・削除する。
// 一覧の一括クエリは変えず、開いたときに件数を取得する（遅延ロード）。
export default function FaceDataRowButton({ userId, displayName }: { userId: string; displayName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [data, setData] = useState<{ count: number; latest: string | null; adaptive: number } | null>(null);

  const load = async () => {
    setData(null);
    setConfirming(false);
    try {
      setData(await getFaceDataForUser(userId));
    } catch {
      setData({ count: 0, latest: null, adaptive: 0 });
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await deleteFaceDataForUser(userId);
      if (res.success) {
        toast({ title: '削除しました', description: `${res.deleted}件の顔データを削除しました。` });
        setData({ count: 0, latest: null, adaptive: 0 });
        setConfirming(false);
        router.refresh();
      } else {
        toast({ variant: 'destructive', title: '削除に失敗しました', description: res.message });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ScanFace className="h-4 w-4 mr-1" />
          顔データ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>顔データの管理</DialogTitle>
          <DialogDescription>{displayName} さんの登録済み顔データ</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {data === null ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : data.count === 0 ? (
            <p className="text-sm text-muted-foreground">顔は登録されていません。</p>
          ) : (
            <div className="space-y-1">
              <p className="text-3xl font-bold">{data.count}件</p>
              <p className="text-xs text-muted-foreground">
                最終登録: {data.latest ? formatJst(new Date(data.latest), 'yyyy/MM/dd') : '-'}
                {data.adaptive > 0 ? ` ・適応学習 ${data.adaptive}件` : ''}
              </p>
              {confirming && (
                <p className="text-sm text-destructive pt-2">
                  本当に削除しますか？この操作は取り消せません。削除後は顔認証で打刻できなくなります。
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>閉じる</Button>
          {data && data.count > 0 && (
            confirming ? (
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-1" />
                {loading ? '削除中...' : '本当に削除する'}
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 className="h-4 w-4 mr-1" />
                すべて削除
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
