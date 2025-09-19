'use client'

import { Button } from "@/components/ui/button"
import { signInWithDiscord } from "@/app/actions"
import { Icons } from "@/components/icons"
import { useSearchParams } from "next/navigation"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, Moon, Sun } from "lucide-react"
import { Suspense } from "react"
import { useTheme } from "next-themes"

function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    return (
        <div className="flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-sm text-center">
                <Icons.Logo className="w-16 h-16 mx-auto text-primary mb-4" />
                <h1 className="text-3xl font-bold text-foreground mt-4">STEM研究部勤怠管理システム</h1>
                
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
