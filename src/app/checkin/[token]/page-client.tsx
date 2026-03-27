'use client';

import { useState } from 'react';
import { recordAttendanceWithToken } from '@/app/actions';
import { signInWithSTEM } from '@/app/actions-oauth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, LogOut, XCircle, Clock } from 'lucide-react';
import { Icons } from '@/components/icons';

type TokenStatus = 'ready' | 'unauthenticated' | 'invalid' | 'expired' | 'used' | 'not_member';
type PageState = 'idle' | 'loading' | 'success' | 'error';

interface Props {
  status: TokenStatus;
  token: string;
  displayName: string | null;
  currentStatus: 'in' | 'out' | null;
}

export default function CheckinTokenClient({ status, token, displayName, currentStatus }: Props) {
  const [pageState, setPageState] = useState<PageState>('idle');
  const [resultMessage, setResultMessage] = useState('');
  const [resultType, setResultType] = useState<'in' | 'out' | null>(null);

  async function handleLogin() {
    setPageState('loading');
    try {
      const { url } = await signInWithSTEM(`/checkin/${token}`);
      window.location.href = url;
    } catch {
      setPageState('idle');
    }
  }

  async function handleCheckin() {
    setPageState('loading');
    const result = await recordAttendanceWithToken(token);
    if (result.success) {
      setResultType(result.type);
      setResultMessage(result.message);
      setPageState('success');
    } else {
      setResultMessage(result.message);
      setPageState('error');
    }
  }

  // トークンエラー系
  if (status === 'invalid' || status === 'expired' || status === 'used') {
    const message = {
      invalid: 'このQRコードは無効です。',
      expired: 'QRコードの有効期限が切れています。',
      used: 'このQRコードは既に使用済みです。',
    }[status];
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            <Clock className="w-14 h-14 text-muted-foreground mb-2" />
            <CardTitle>QRコードが無効です</CardTitle>
            <CardDescription>{message}<br />キオスクの新しいQRコードを読み取ってください。</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // メンバー未登録
  if (status === 'not_member') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            <XCircle className="w-14 h-14 text-destructive mb-2" />
            <CardTitle>メンバー未登録</CardTitle>
            <CardDescription>部員登録が確認できません。部長にお問い合わせください。</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // 未認証
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
            <Button
              onClick={handleLogin}
              disabled={pageState === 'loading'}
              className="w-full"
              size="lg"
            >
              <Icons.Logo className="w-5 h-5 mr-2" />
              {pageState === 'loading' ? 'リダイレクト中...' : 'STEMでログイン'}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 成功
  if (pageState === 'success') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            {resultType === 'in'
              ? <LogIn className="w-16 h-16 text-green-500 mb-2" />
              : <LogOut className="w-16 h-16 text-blue-500 mb-2" />
            }
            <CardTitle className="text-3xl">{displayName}</CardTitle>
            <CardDescription className="text-xl mt-2">{resultMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">このページを閉じてください。</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // エラー（打刻失敗）
  if (pageState === 'error') {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader className="items-center">
            <XCircle className="w-16 h-16 text-destructive mb-2" />
            <CardTitle>エラー</CardTitle>
            <CardDescription>{resultMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">キオスクの新しいQRコードを読み取ってください。</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  // 認証済み・出退勤ボタン（statusが 'ready' の場合のみここに到達）
  const nextAction = currentStatus === 'in' ? 'out' : 'in';
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          {nextAction === 'in'
            ? <LogIn className="w-16 h-16 text-green-500 mb-4" />
            : <LogOut className="w-16 h-16 text-blue-500 mb-4" />
          }
          <CardTitle className="text-2xl">{displayName}</CardTitle>
          <CardDescription>
            現在: {currentStatus === 'in' ? '活動中' : '退勤中'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleCheckin}
            disabled={pageState === 'loading'}
            className="w-full"
            size="lg"
          >
            {pageState === 'loading'
              ? '処理中...'
              : nextAction === 'in' ? '出勤する' : '退勤する'
            }
          </Button>
          <p className="text-xs text-muted-foreground">
            このQRコードは1回のみ使用できます
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
