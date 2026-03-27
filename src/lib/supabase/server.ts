
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/lib/types'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
      cookieOptions: {
        // Cookieのサイズ制限を回避するため、セッションを分割
        maxAge: 60 * 60 * 24 * 7, // 7日間
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }
  )
}

export async function createSupabaseAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase URL or Service Role Key is not set. Please check your .env.local file.');
    }

    const cookieStore = await cookies();

    // stem-system と同じ createServerClient ベースで作成
    // auth.admin.listUsers() 等が正しく動作するために必要
    return createServerClient<Database>(
        supabaseUrl,
        supabaseServiceKey,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        );
                    } catch {
                        // Server Component からの呼び出し時は無視
                    }
                },
            },
        }
    );
}
