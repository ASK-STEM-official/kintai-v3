'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertTriangle, Download, Search } from 'lucide-react';
import { migrateLegacyCardId, searchLegacyUsers } from '@/app/actions';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface LegacyUserData {
  cardId: string;
  firstname: string;
  lastname: string;
  github: string;
  grade: number;
  teamId: string;
  uid: string;
}

interface CardUnregisteredClientProps {
  userId: string;
}

export default function CardUnregisteredClient({ userId }: CardUnregisteredClientProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<LegacyUserData[]>([]);
  const [selectedUser, setSelectedUser] = useState<LegacyUserData | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast({
        title: 'エラー',
        description: '検索キーワードを入力してください。',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchLegacyUsers(searchTerm.trim());
      
      if (result.success && result.users) {
        setSearchResults(result.users);
        if (result.users.length === 0) {
          toast({
            title: '結果なし',
            description: '該当するユーザーが見つかりませんでした。',
          });
        }
      } else {
        toast({
          title: 'エラー',
          description: result.message || '検索に失敗しました。',
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
      setIsSearching(false);
    }
  };

  const handleSelectUser = (user: LegacyUserData) => {
    setSelectedUser(user);
    setShowConfirmDialog(true);
  };

  const handleConfirmMigration = async () => {
    if (!selectedUser) return;
    
    setIsLoading(true);
    
    try {
      // カードID引き継ぎ処理（Discord確認は省略）
      const result = await migrateLegacyCardId(userId, undefined, undefined, selectedUser.uid);
      
      setShowConfirmDialog(false);
      
      if (result.success) {
        toast({
          title: '成功',
          description: result.message,
        });
        // 成功したらダッシュボードへリダイレクト
        router.push('/dashboard');
        router.refresh();
      } else {
        toast({
          title: 'エラー',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      setShowConfirmDialog(false);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            <CardTitle>カードID未登録</CardTitle>
          </div>
          <CardDescription>
            メンバー登録は完了していますが、カードIDが登録されていません。<br />
            旧システムでカードを使用していた場合、ここから引き継ぐことができます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 検索セクション */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="search">名前で検索</Label>
              <div className="flex gap-2 mt-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="search"
                    type="text"
                    placeholder="名前を入力..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    disabled={isLoading || isSearching}
                    className="pl-9"
                  />
                </div>
                <Button 
                  onClick={handleSearch} 
                  disabled={isLoading || isSearching}
                  variant="secondary"
                >
                  {isSearching ? '検索中...' : '検索'}
                </Button>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                姓または名の一部を入力して検索してください
              </p>
            </div>

            {/* 検索結果 */}
            {searchResults.length > 0 && (
              <div className="space-y-3">
                <Label>検索結果 ({searchResults.length}件)</Label>
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {searchResults.map((user) => (
                    <Card 
                      key={user.uid}
                      className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => !isLoading && handleSelectUser(user)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full flex items-center justify-center bg-blue-500 text-white font-semibold shrink-0">
                            <span className="text-sm">
                              {user.lastname[0]}{user.firstname[0]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-lg">
                              {user.lastname} {user.firstname}
                            </div>
                            <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-3">
                              <span>{user.grade}期生</span>
                              <span>•</span>
                              <span>班: {user.teamId}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            disabled={isLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectUser(user);
                            }}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            選択
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 区切り線 */}
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

          {/* 新規カード登録の案内 */}
          <div className="text-center space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              旧システムを使用していない場合は、<br />
              部室のキオスク端末でカードをタッチして登録してください。
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ※ 旧システムでカードを使用していた場合は、上記の検索から引き継いでください
            </p>
          </div>

          {/* ログアウトボタン */}
          <div className="pt-4 border-t">
            <Link href="/auth/signout">
              <Button variant="ghost" className="w-full">
                ログアウト
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 確認ダイアログ */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>カードID引き継ぎの確認</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>以下のユーザーのカードIDを引き継ぎますか?</p>
                {selectedUser && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full flex items-center justify-center bg-blue-500 text-white font-semibold shrink-0">
                          <span className="text-sm">
                            {selectedUser.lastname[0]}{selectedUser.firstname[0]}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                            {selectedUser.lastname} {selectedUser.firstname}
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            {selectedUser.grade}期生 • 班: {selectedUser.teamId}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  この操作は取り消せません。間違いがないか確認してください。
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMigration} disabled={isLoading}>
              {isLoading ? '処理中...' : '引き継ぐ'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
