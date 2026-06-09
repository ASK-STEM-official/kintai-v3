'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Admin Error]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mb-2" />
          <CardTitle>管理ページのエラー</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            管理ページの読み込み中にエラーが発生しました。再試行してください。
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">ID: {error.digest}</p>
          )}
          <Button onClick={reset} className="w-full">再試行</Button>
        </CardContent>
      </Card>
    </div>
  );
}
