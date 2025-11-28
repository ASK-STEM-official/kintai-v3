import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';

export default async function DiscordRequiredPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }

  const discordInviteUrl = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL || 'https://discord.gg/vujJCHkANj';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <CardTitle className="text-red-600 dark:text-red-400">Discordサーバーへの参加が必要です</CardTitle>
          </div>
          <CardDescription>
            このシステムを使用するには、STEM研究部のDiscordサーバーに参加している必要があります。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <h3 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
              参加手順
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
              <li>下のボタンからDiscordサーバーに参加</li>
              <li>参加後、このページを再読み込み</li>
              <li>自動的にダッシュボードに移動します</li>
            </ol>
          </div>

          <Button asChild className="w-full" size="lg">
            <a href={discordInviteUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Discordサーバーに参加する
            </a>
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-950 px-2 text-slate-500">
                または
              </span>
            </div>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/signout">
              ログアウト
            </Link>
          </Button>

          <p className="text-xs text-center text-slate-500 dark:text-slate-400">
            既に参加している場合は、ページを再読み込みしてください
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
