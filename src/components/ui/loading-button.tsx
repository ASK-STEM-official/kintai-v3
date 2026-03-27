'use client';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { forwardRef } from 'react';

/**
 * フォーム送信中に自動で disabled + スピナー表示するボタン。
 * <form action={serverAction}> の子として使う。
 */
export function FormButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} {...props}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
}

/**
 * 汎用ローディングボタン。loading prop で制御。
 */
export const LoadingButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { loading?: boolean }
>(function LoadingButton({ loading, disabled, children, ...props }, ref) {
  return (
    <Button ref={ref} disabled={loading || disabled} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {children}
    </Button>
  );
});
