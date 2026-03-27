import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icons } from '@/components/icons';

export default function CheckinPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <Icons.Logo className="w-14 h-14 text-primary mb-2" />
          <CardTitle className="text-2xl">STEM研究部 出退勤</CardTitle>
          <CardDescription>
            部室のキオスク画面に表示されているQRコードをスキャンしてください。
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
