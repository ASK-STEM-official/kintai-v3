'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types';

// This function can be marked as `async` if database sessions are enabled.
// See https://supabase.com/docs/guides/auth/server-side-rendering#making-the-client-s-session-available-throughout-the-app
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
