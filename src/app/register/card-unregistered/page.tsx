import { redirect } from 'next/navigation';
import CardUnregisteredClient from './page-client';
import { requireAuth } from '@/lib/auth';

export default async function CardUnregisteredPage() {
  const { userId } = await requireAuth();

  return <CardUnregisteredClient userId={userId} />;
}