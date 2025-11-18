
'use client'

import { Button } from "@/components/ui/button"
import { signInWithDiscord, signInAsAnonymousAdmin } from "@/app/actions"
import { Icons } from "@/components/icons"
import { useSearchParams } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, Moon, Sun, ShieldAlert, Link as LinkIcon, Info } from "lucide-react"
import { Suspense } from "react"
import { useTheme } from "next-themes"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { FaDiscord } from 'react-icons/fa';

function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const isNotRegistered = error === "not_registered";
    const isNotMemberError = error === "指定されたDiscordサーバーのメンバーではありません。";

    return (
        <div className="flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-sm text-center">
                <Icons.Logo className="w-16 h-16 mx-auto text-primary mb-4" />
                <h1 className="text-3xl font-bold text-foreground mt-4">STEM研究部勤怠管理システム</h1>
                
                {isNotRegistered ? (
                    <Alert className="mt-6 text-left border-orange-500/50 text-orange-700 dark:text-orange-300 [&>svg]:text-orange-700 dark:[&>svg]:text-orange-300">
                        <Info className="h-4 w-4" />
                        <AlertTitle className="text-orange-800 dark:text-orange-200">メンバー登録が必要です</AlertTitle>
                        <AlertDescription className="space-y-3">
                            <p>このシステムを利用するには、STEM研究部のメンバー登録が必要です。</p>
                            <p className="text-sm">下のボタンから部員登録サイトにアクセスして、メンバー登録を完了してください。</p>
                            <Button 
                                asChild 
                                className="w-full mt-2 bg-orange-600 hover:bg-orange-700 text-white"
                            >
                                <a href="http://member.stemask.com/" target="_blank" rel="noopener noreferrer">
                                    <LinkIcon className="w-4 h-4 mr-2" />
                                    部員登録サイトへ
                                </a>
                            </Button>
                        </AlertDescription>
                    </Alert>
                ) : isNotMemberError ? (
                     <Alert className="mt-6 text-left border-blue-500/50 text-blue-700 dark:text-blue-300 [&>svg]:text-blue-700 dark:[&>svg]:text-blue-300">
                        <Info className="h-4 w-4" />
                        <AlertTitle className="text-blue-800 dark:text-blue-200">サーバーへの参加が必要です</AlertTitle>
                        <AlertDescription>
                            <p className="mb-4">このシステムを利用するには、指定のDiscordサーバーに参加している必要があります。下のボタンからサーバーに参加後、再度ログインをお試しください。</p>
                             <p className="text-xs text-muted-foreground">※参加用リンクは管理者にお問い合わせください。</p>
                        </AlertDescription>
                    </Alert>
                ) : error && (
                    <Alert variant="destructive" className="mt-6 text-left">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Authentication Error</AlertTitle>
                        <AlertDescription>
                            {error}
                        </AlertDescription>
                    </Alert>
                )}
                
                <form action={signInWithDiscord} className="mt-8">
                    <Button type="submit" className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white" size="lg">
                        <FaDiscord className="w-5 h-5 mr-2" />
                        Discordでログイン
                    </Button>
                </form>
                 <div className="mt-6 space-y-4">
                    <Alert variant="destructive">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle>デモ用ログイン</AlertTitle>
                        <AlertDescription>
                            下のボタンは管理者権限でのデモ用ログインです。実際の運用では使用しないでください。
                        </AlertDescription>
                    </Alert>
                    <form action={signInAsAnonymousAdmin}>
                        <Button type="submit" variant="outline" className="w-full" size="lg">
                            匿名管理者としてログイン
                        </Button>
                    </form>
                 </div>
            </div>
        </div>
    )
}

function ThemeToggleLogin() {
    const { setTheme, theme } = useTheme();
    return (
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="absolute top-4 right-4"
        >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
        </Button>
    )
}


export default function LoginPage() {
    return (
        <main className="w-full h-screen flex flex-col items-center justify-center bg-background p-4 relative">
            <ThemeToggleLogin />
            <Suspense>
              <LoginContent />
            </Suspense>
        </main>
    )
}

    