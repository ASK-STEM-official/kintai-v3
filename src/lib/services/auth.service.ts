'use server';

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Discordでサインイン
 */
export async function signInWithDiscord() {
    const supabase = await createSupabaseServerClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: `${origin}/auth/callback`,
            scopes: 'identify email guilds.members.read',
        },
    });

    if (error) {
        console.error('Discord sign-in error:', error);
        return redirect('/login?error=discord_signin_failed');
    }

    if (data.url) {
        return redirect(data.url);
    }
}

/**
 * サインアウト
 */
export async function signOut() {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return redirect('/login');
}
