import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function MemberUnregisteredPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
          <CardTitle className="text-2xl">メインシステム未登録</CardTitle>
          <CardDescription>
            ダッシュボードにアクセスするには、まずメインシステムへの登録が必要です。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            ASK STEM部員管理システムに登録されていません。
          </p>
          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href="https://askstem.org/register" target="_blank" rel="noopener noreferrer">
                メインシステムに登録する
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">ログインページに戻る</Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            登録後、再度ログインしてください。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
