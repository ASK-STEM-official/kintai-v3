import { createSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  // OAuth cookie をクリア
  cookieStore.delete('oauth_access_token');
  cookieStore.delete('oauth_user_id');

  const supabase = await createSupabaseServerClient();

  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
  }

  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = '/login';
  redirectUrl.search = '';

  return NextResponse.redirect(redirectUrl);
}
