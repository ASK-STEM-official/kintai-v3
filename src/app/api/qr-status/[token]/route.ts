import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseAdminClient();

  const { data } = await supabase
    .schema('attendance')
    .from('temp_registrations')
    .select('accessed_at, is_used')
    .eq('qr_token', token)
    .single();

  const closed = !!(data?.accessed_at || data?.is_used);
  return NextResponse.json({ closed });
}
