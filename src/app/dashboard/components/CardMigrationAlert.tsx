'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

export default function CardMigrationAlert() {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>カードが未登録です</AlertTitle>
      <AlertDescription className="mt-2">
        出退勤の記録にはカードの登録が必要です。部長に連絡してカードを登録してもらってください。
      </AlertDescription>
    </Alert>
  );
}
