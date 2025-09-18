import { getTempRegistration, completeRegistration, signInWithDiscord } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';
import { notFound, redirect } from 'next/navigation';
import { format } from 'date-fns';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getAllTeams } from '@/app/actions';

export const dynamic = 'force-dynamic';

async function RegisterForm({ token, teams }: { token: string, teams: any[] }) {
  const completeRegistrationWithToken = completeRegistration.bind(null, token);

  const { data: { user } } = await createSupabaseServerClient();
  
  if (!user) {
    return (
      <form action={signInWithDiscord}>
        <Button type="submit" className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white" size="lg">
          <Icons.Discord className="w-5 h-5 mr-2" />
          Discordで認証して登録する
        </Button>
      </form>
    );
  }

  return (
    <form action={completeRegistrationWithToken} className="space-y-4">
      <div>
        <Label htmlFor="displayName">表示名</Label>
        <Input id="displayName" name="displayName" placeholder="例: Yamada Taro" required />
        <p className="text-xs text-muted-foreground mt-1">他の人から見える名前です。後から変更・重複可能です。</p>
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

export default async function RegisterPage({ params }: { params: { token: string } }) {
  const { data: { session } } = await createSupabaseServerClient();
  
  const tempReg = await getTempRegistration(params.token);

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
  
  const { data: teams } = await getAllTeams();

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if(user) {
    const { data: existingProfile } = await supabase.from('users').select('id').eq('id', user.id).single();
    if (existingProfile) {
        const { data: fullProfile } = await supabase.from('users').select('*, teams(name)').eq('id', user.id).single();

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
  }


  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl"><Icons.UserPlus /> カード登録</CardTitle>
          <CardDescription>QRコードスキャンありがとうございます。情報を入力して登録を完了してください。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>注意</AlertTitle>
              <AlertDescription>
                登録には、事前にサーバー管理者からDiscordサーバー内の期生ロールを付与されている必要があります。
              </AlertDescription>
          </Alert>

          <RegisterForm token={params.token} teams={teams || []} />

        </CardContent>
      </Card>
    </div>
  );
}
