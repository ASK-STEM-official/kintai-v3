'use client'

import { completeRegistration, signInWithDiscord } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import type { Tables } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { FaDiscord } from 'react-icons/fa';
import { useEffect } from 'react';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "登録中..." : "登録を完了する"}
        </Button>
    );
}

function RegisterForm({ token }: { token: string }) {
  return (
    <form action={completeRegistration} className="space-y-4">
      <input type="hidden" name="token" value={token} />
       <div className='text-sm text-muted-foreground text-center'>
        ユーザー情報を確認しました。下のボタンを押して、このカードの登録を完了してください。
      </div>
      <SubmitButton />
    </form>
  );
}

type FullProfile = Tables<'member', 'members'> & {
    attendance_user: { card_id: string } | null,
    teams: { name: string } | null,
};

export default function RegisterPageClient({ token, tempReg, teams, session, fullProfile, displayName }: { 
    token: string,
    tempReg?: Tables<'attendance', 'temp_registrations'> | null,
    teams?: Tables<'member', 'teams'>[],
    session?: any,
    fullProfile?: FullProfile | null,
    displayName?: string | null
}) {
    const searchParams = useSearchParams();
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const newCardId = searchParams.get('newCardId');
    const router = useRouter();

    if (token === 'card-unregistered') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <AlertTriangle className="w-16 h-16 text-orange-500 mb-4" />
                        <CardTitle className="text-2xl">カードが未登録です</CardTitle>
                        <CardDescription>
                            出退勤の記録にはカードの登録が必要です。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <p className="text-muted-foreground">
                            旧システムからカードIDを引き継ぐか、部室のKiosk端末でカードをスキャンして登録してください。
                        </p>
                        <div className="space-y-2">
                            <Button asChild className="w-full">
                                <Link href="/dashboard">ダッシュボードで旧カードを引き継ぐ</Link>
                            </Button>
                        </div>
                        <Button asChild variant="ghost" className="w-full">
                            <Link href="/login">ログインページに戻る</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
  
    // 成功またはすでに登録済みの場合は、is_usedチェックをスキップ
    if (success === 'true' || (session?.user && fullProfile?.attendance_user)) {
        const cardId = newCardId || fullProfile?.attendance_user?.card_id || tempReg?.card_id || '';
        const discordUsername = session?.user?.user_metadata?.user_name || session?.user?.user_metadata?.full_name || '';
        const userName = displayName || '名無しさん';
        
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <Icons.CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                        <CardTitle className="text-2xl">登録が完了しました!</CardTitle>
                        <CardDescription>ダッシュボードへ移動できます</CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <Card className='bg-muted/50'>
                           <CardContent className='p-4 space-y-2'>
                                <div className="flex justify-between items-center">
                                    <span className='font-semibold'>お名前</span>
                                    <span className='font-medium'>{userName}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className='font-semibold'><FaDiscord className="inline w-4 h-4 mr-1" />Discord ユーザー名</span>
                                    <span className='font-medium'>@{discordUsername}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className='font-semibold'>カードID</span>
                                    <span className='font-mono text-sm'>{cardId.slice(0,3)}...{cardId.slice(-4)}</span>
                                </div>
                           </CardContent>
                        </Card>
                        <Button asChild className="w-full"><Link href="/dashboard">ダッシュボードへ</Link></Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
    
    // tempRegが無効な場合のエラー表示
    if (!tempReg || tempReg.is_used || new Date(tempReg.expires_at) < new Date()) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <Icons.XCircle className="w-16 h-16 text-destructive mb-4" />
                        <CardTitle className="text-2xl">登録エラー</CardTitle>
                        <CardDescription>
                            {tempReg?.is_used ? "この登録リンクは既に使用されています。" : "この登録リンクは無効か、有効期限が切れています。"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-center text-muted-foreground">お手数ですが、もう一度Kiosk端末でQRコードを生成してください。</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-2xl"><Icons.UserPlus /> カード登録</CardTitle>
                    <CardDescription>QRコードスキャンありがとうございます。Discordで認証して登録を完了してください。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>登録エラー</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <Card className="bg-muted/50">
                        <CardContent className="p-4 space-y-2 text-sm">
                            {session?.user?.user_metadata && displayName && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">お名前:</span>
                                    <span className="font-medium">{displayName}</span>
                                </div>
                            )}
                            {session?.user?.user_metadata && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground flex items-center gap-1"><FaDiscord className="w-4 h-4"/>Discord ユーザー名:</span>
                                    <span className="font-medium">{session.user.user_metadata.user_name || session.user.user_metadata.full_name}</span>
                                </div>
                            )}
                             <div className="flex justify-between">
                                <span className="text-muted-foreground">カードID:</span>
                                <span className="font-mono font-medium">{tempReg.card_id}</span>
                            </div>
                        </CardContent>
                    </Card>
                    
                    {!session ? (
                        <form action={signInWithDiscord}>
                            <input type="hidden" name="next" value={`/register/${token}`} />
                            <Button type="submit" className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white" size="lg">
                                <FaDiscord className="w-5 h-5 mr-2" />
                                Discordで認証して登録する
                            </Button>
                        </form>
                    ) : (
                        <RegisterForm token={token} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
