'use client';

import { useState } from 'react';
import { signInWithSTEM } from '@/app/actions-oauth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, LogOut, XCircle, Clock } from 'lucide-react';
import { Icons } from '@/components/icons';

type Status = 'success' | 'error' | 'invalid' | 'expired' | 'unauthenticated' | 'not_member';

interface Props {
  status: Status;
  token: string;
  message?: string;
  displayName?: string;
  resultType?: 'in' | 'out' | null;
}

export default function CheckinTokenClient({ status, token, message, displayName, resultType }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      const { url } = await signInWithSTEM(`/checkin/${token}`);
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  // 成功
  if (status === 'success') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            {resultType === 'in'
              ? <LogIn className="w-20 h-20 text-green-500 mb-2" />
              : <LogOut className="w-20 h-20 text-blue-500 mb-2" />
            }
            <CardTitle className="text-3xl">{displayName}</CardTitle>
            <CardDescription className="text-xl mt-2">{message}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">このページを閉じてください。</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 未認証 → ログインボタン
  if (status === 'unauthenticated') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            <Icons.Logo className="w-14 h-14 text-primary mb-2" />
            <CardTitle className="text-2xl">STEM研究部 出退勤</CardTitle>
            <CardDescription>STEMアカウントでログインして出退勤してください。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLogin} disabled={loading} className="w-full" size="lg">
              <Icons.Logo className="w-5 h-5 mr-2" />
              {loading ? 'リダイレクト中...' : 'STEMでログイン'}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 期限切れ・無効
  if (status === 'expired' || status === 'invalid') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            <Clock className="w-14 h-14 text-muted-foreground mb-2" />
            <CardTitle>QRコードの有効期限切れ</CardTitle>
            <CardDescription>キオスクに表示されている新しいQRコードを読み取ってください。</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // エラー・未登録
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <XCircle className="w-14 h-14 text-destructive mb-2" />
          <CardTitle>エラー</CardTitle>
          <CardDescription>
            {status === 'not_member'
              ? 'メンバー登録が確認できません。部長にお問い合わせください。'
              : (message || 'エラーが発生しました。')}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
