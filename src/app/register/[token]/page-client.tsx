'use client'

import { completeRegistration, signInWithDiscord } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { format } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Tables } from '@/lib/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

function RegisterForm({ token, teams }: { token: string, teams: any[] }) {
  // We need a form action that can be used in a client component.
  // The `completeRegistration` action will handle the redirect.
  return (
    <form action={completeRegistration} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <Label htmlFor="displayName">表示名</Label>
        <Input id="displayName" name="displayName" placeholder="例: 山田太郎" required />
      </div>
      <div>
        <Label htmlFor="generation">期生</Label>
        <Input id="generation" name="generation" type="number" placeholder="例: 9" required />
      </div>
      <div>
        <Label htmlFor="teamId">班</Label>
        <Select name="teamId" required>
          <SelectTrigger>
            <SelectValue placeholder="所属する班を選択してください" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" size="lg">登録を完了する</Button>
    </form>
  );
}

export default function RegisterPageClient({ token, tempReg, teams, session, fullProfile }: { 
    token: string,
    tempReg?: Tables<'temp_registrations'> | null,
    teams?: Tables<'teams'>[],
    session?: any,
    fullProfile?: (Tables<'users'> & { teams: Tables<'teams'> | null}) | null
}) {
    const searchParams = useSearchParams();
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (token === 'unregistered') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <Icons.UserPlus className="w-16 h-16 text-destructive mb-4" />
                        <CardTitle className="text-2xl">カードが未登録です</CardTitle>
                        <CardDescription>
                            ダッシュボードにアクセスするには、まずカードを登録する必要があります。
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center space-y-4">
                        <p className="text-muted-foreground">お手数ですが、Kiosk端末でQRコードをスキャンして登録を完了してください。</p>
                        <Button asChild variant="outline">
                            <Link href="/login">ログインページに戻る</Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }
  
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
  
    if (success === 'true' || (session?.user && fullProfile)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="items-center text-center">
                        <Icons.CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
                        <CardTitle className="text-2xl">登録が完了しました！</CardTitle>
                        <CardDescription>これでカードが使用可能になりました。</CardDescription>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                        <Card className='bg-muted/50'>
                           <CardContent className='p-4 space-y-2'>
                                <div className="flex justify-between items-center">
                                    <span className='font-semibold'>👤 表示ユーザー名</span>
                                    <span>{fullProfile?.display_name}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className='font-semibold'>🏷️ 班・期生</span>
                                    <span>{fullProfile?.teams?.name}・{fullProfile?.generation}期生</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className='font-semibold'>📇 カードID</span>
                                    <span className='font-mono'>{fullProfile?.card_id.slice(0,3)}...{fullProfile?.card_id.slice(-4)}</span>
                                </div>
                           </CardContent>
                        </Card>
                        <Button asChild className="w-full"><Link href="/dashboard">ダッシュボードへ</Link></Button>
                        <p className='text-center text-muted-foreground text-sm'>カードリーダーで打刻してください。</p>
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
                    <CardDescription>QRコードスキャンありがとうございます。情報を入力して登録を完了してください。</CardDescription>
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
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">カードID:</span>
                                <span className="font-mono font-medium">{tempReg.card_id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">読み取り時刻:</span>
                                <span className="font-medium">{format(new Date(tempReg.accessed_at!), 'yyyy/MM/dd HH:mm')}</span>
                            </div>
                        </CardContent>
                    </Card>
                    
                    {!session ? (
                        <form action={signInWithDiscord}>
                            <Button type="submit" className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white" size="lg">
                                <Icons.Discord className="w-5 h-5 mr-2" />
                                Discordで認証して登録する
                            </Button>
                        </form>
                    ) : (
                        <RegisterForm token={token} teams={teams || []} />
                    )}

                </CardContent>
            </Card>
        </div>
    );
}
