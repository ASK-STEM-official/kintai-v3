'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function CardUnregisteredClient() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            <CardTitle>カードID未登録</CardTitle>
          </div>
          <CardDescription>
            メンバー登録は完了していますが、カードIDが登録されていません。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            部室のキオスク端末でカードをタッチして登録してください。<br />
            カードの登録方法がわからない場合は部長に連絡してください。
          </p>
          <div className="pt-2 border-t">
            <Link href="/auth/signout">
              <Button variant="ghost" className="w-full">
                ログアウト
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
