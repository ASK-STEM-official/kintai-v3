'use client';

import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Download } from 'lucide-react';
import { migrateLegacyCardId } from '@/app/actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface CardMigrationAlertProps {
  userId: string;
  firstname?: string;
  lastname?: string;
}

export default function CardMigrationAlert({ userId, firstname: initialFirstname, lastname: initialLastname }: CardMigrationAlertProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(!initialFirstname || !initialLastname);
  const [firstname, setFirstname] = useState(initialFirstname || '');
  const [lastname, setLastname] = useState(initialLastname || '');
  const router = useRouter();
  const { toast } = useToast();

  const handleMigration = async () => {
    if (!firstname.trim() || !lastname.trim()) {
      toast({
        title: 'エラー',
        description: '姓と名を入力してください。',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await migrateLegacyCardId(userId, firstname.trim(), lastname.trim());
      
      if (result.success) {
        toast({
          title: '成功',
          description: result.message,
        });
        router.refresh();
      } else {
        toast({
          title: 'エラー',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'エラー',
        description: '予期しないエラーが発生しました。',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>カードが未登録です</AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p>
          出退勤の記録にはカードの登録が必要です。
        </p>
        
        {showForm ? (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lastname" className="text-xs">姓（ローマ字）</Label>
                <Input
                  id="lastname"
                  placeholder="例: numata"
                  value={lastname}
                  onChange={(e) => setLastname(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="firstname" className="text-xs">名（ローマ字）</Label>
                <Input
                  id="firstname"
                  placeholder="例: hikaru"
                  value={firstname}
                  onChange={(e) => setFirstname(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
            <Button
              onClick={handleMigration}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              {isLoading ? '引き継ぎ中...' : '旧システムからカードを引き継ぐ'}
            </Button>
            <p className="text-xs text-muted-foreground">
              ※旧システムに登録されていた名前（ローマ字小文字）を入力してください
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={handleMigration}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              <Download className="mr-2 h-4 w-4" />
              {isLoading ? '引き継ぎ中...' : '旧システムからカードを引き継ぐ'}
            </Button>
            <p className="text-xs text-muted-foreground">
              ※旧システムに登録されていた名前({lastname} {firstname})でカードIDを検索します
            </p>
            <Button
              onClick={() => setShowForm(true)}
              variant="ghost"
              size="sm"
              className="text-xs"
            >
              名前が違う場合はこちら
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
