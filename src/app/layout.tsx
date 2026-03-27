import type { Metadata } from 'next';
import { Toaster } from "@/components/ui/toaster"
import './globals.css';
import { Inter, Source_Code_Pro } from 'next/font/google';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/ThemeProvider';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const fontMono = Source_Code_Pro({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'STEM研究部 勤怠管理システム',
  description: 'A modern attendance management system.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning className="h-full">
      <body className={cn(
        "h-full bg-background font-sans antialiased",
        fontSans.variable,
        fontMono.variable
      )}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-center py-2 px-4 text-sm font-medium">
                システム障害のため、現在ログインおよび勤怠記録が正常に動作しない場合があります。復旧作業中です。ご不便をおかけして申し訳ありません。
            </div>
            <div className="pt-9">
                {children}
            </div>
            <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
