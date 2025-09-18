'use client'

import { Button } from "@/components/ui/button"
import { signInWithDiscord } from "@/app/actions"
import { Icons } from "@/components/icons"
import { useSearchParams } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

export default function LoginPage() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    return (
        <main className="w-full h-screen flex flex-col items-center justify-center bg-background p-4">
            <div className="w-full max-w-sm text-center">
                <Icons.Logo className="w-16 h-16 mx-auto text-primary mb-4" />
                <h1 className="text-3xl font-bold text-foreground">AttendanceZen</h1>
                <p className="text-muted-foreground mt-2">STEM研究部 勤怠管理システム</p>
                
                {error && (
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
                        <Icons.Discord className="w-5 h-5 mr-2" />
                        Discordでログイン
                    </Button>
                </form>

                <p className="text-xs text-muted-foreground mt-4">
                    アクセスするには管理者から招待されたDiscordアカウントが必要です。
                </p>
            </div>
        </main>
    )
}
