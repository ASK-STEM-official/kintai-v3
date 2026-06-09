'use client';

import { useState } from 'react';
import { signInWithSTEM } from '@/app/actions-oauth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScanFace, XCircle, Clock, ShieldAlert } from 'lucide-react';
import { Icons } from '@/components/icons';

type Status = 'success' | 'error' | 'invalid' | 'expired' | 'unauthenticated' | 'not_member' | 'already_used';

interface Props {
  status: Status;
  token: string;
  message?: string;
  displayName?: string;
}

export default function RegisterFaceClient({ status, token, message, displayName }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      const { url } = await signInWithSTEM(`/register-face/${token}`);
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  // 本人確認OK → キオスクのカメラへ誘導
  if (status === 'success') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardHeader className="items-center py-10 px-8">
            <ScanFace className="w-28 h-28 text-green-500 mb-4" />
            <CardTitle className="text-3xl font-bold mt-2">{displayName} さん</CardTitle>
            <CardDescription className="text-xl mt-4 font-medium text-foreground">
              本人確認できました
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-10">
            <p className="text-foreground text-lg font-medium">キオスクのカメラを見てください</p>
            <p className="text-muted-foreground text-sm mt-2">顔の登録が終わると画面に「登録完了」と表示されます。</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 未認証 → ログインボタン
  if (status === 'unauthenticated') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardHeader className="items-center py-10 px-8">
            <Icons.Logo className="w-20 h-20 text-primary mb-4" />
            <CardTitle className="text-3xl font-bold">顔登録（本人確認）</CardTitle>
            <CardDescription className="text-lg mt-3">STEMアカウントでログインして本人確認してください。</CardDescription>
          </CardHeader>
          <CardContent className="pb-10 px-8">
            <Button onClick={handleLogin} disabled={loading} className="w-full h-14 text-lg" size="lg">
              <Icons.Logo className="w-6 h-6 mr-2" />
              {loading ? 'リダイレクト中...' : 'STEMでログイン'}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 使用済み
  if (status === 'already_used') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardHeader className="items-center py-10 px-8">
            <ShieldAlert className="w-24 h-24 text-amber-500 mb-4" />
            <CardTitle className="text-3xl font-bold">使用済みのQRコード</CardTitle>
            <CardDescription className="text-lg mt-3">この顔登録は完了済みです。<br />再登録する場合はキオスクで新しいQRコードを表示してください。</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // 期限切れ・無効
  if (status === 'expired' || status === 'invalid') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardHeader className="items-center py-10 px-8">
            <Clock className="w-24 h-24 text-muted-foreground mb-4" />
            <CardTitle className="text-3xl font-bold">QRコードの有効期限切れ</CardTitle>
            <CardDescription className="text-lg mt-3">キオスクに表示されている新しいQRコードを読み取ってください。</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // エラー・未登録
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background p-6">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader className="items-center py-10 px-8">
          <XCircle className="w-24 h-24 text-destructive mb-4" />
          <CardTitle className="text-3xl font-bold">エラー</CardTitle>
          <CardDescription className="text-lg mt-3">
            {status === 'not_member'
              ? 'メンバー登録が確認できません。部長にお問い合わせください。'
              : (message || 'エラーが発生しました。')}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
