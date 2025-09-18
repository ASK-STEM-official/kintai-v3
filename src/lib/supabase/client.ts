'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/lib/types';
import { useMemo } from 'react';

// This is a singleton that will be created once.
let supabaseSingleton: ReturnType<typeof createBrowserClient<Database>> | null = null;

function getSupabaseBrowserClient() {
  if (supabaseSingleton) {
    return supabaseSingleton;
  }
  
  supabaseSingleton = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_KEY!
  );
  
  return supabaseSingleton;
}


export function createSupabaseBrowserClient() {
  return getSupabaseBrowserClient();
}
