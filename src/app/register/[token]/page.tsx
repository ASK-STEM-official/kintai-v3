
import { getTempRegistration } from '@/app/actions';
import { getOAuthUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

async function RegisterPageImpl({ params }: { params: Promise<{ token: string }> }) {
    const resolvedParams = await params;
    
    if (resolvedParams.token === 'card-unregistered') {
        return <RegisterPageClient token={resolvedParams.token} />;
    }

    const oauthUser = await getOAuthUser();
    
    const tempReg = await getTempRegistration(resolvedParams.token);
    
    let displayName: string | null = null;
    let discordUsername: string | null = null;
    let existingCardId: string | null = null;
    let discordId: string | null = null;

    if (oauthUser) {
        const adminSupabase = await createSupabaseAdminClient();

        const [memberProfileResult, attendanceUserResult] = await Promise.all([
            adminSupabase
                .schema('member')
                .from('members')
                .select('discord_uid, discord_username, display_name')
                .eq('supabase_auth_user_id', oauthUser.id)
                .single(),
            adminSupabase
                .schema('attendance')
                .from('users')
                .select('card_id')
                .eq('supabase_auth_user_id', oauthUser.id)
                .single(),
        ]);

        const memberProfile = memberProfileResult.data;
        discordId = oauthUser.discordId || memberProfile?.discord_uid || null;

        // Bot API の呼び出しは行わず、DBキャッシュを使う。
        // ニックネームはクライアント側で非同期取得して上書きする。
        displayName =
            (oauthUser.displayName !== '名無しさん' ? oauthUser.displayName : null)
            ?? memberProfile?.display_name
            ?? memberProfile?.discord_username
            ?? null;

        discordUsername = memberProfile?.discord_username ?? null;
        existingCardId = attendanceUserResult.data?.card_id ?? null;
    }

    return (
        <RegisterPageClient
            token={resolvedParams.token}
            tempReg={tempReg}
            isAuthenticated={!!oauthUser}
            displayName={displayName}
            discordUsername={discordUsername}
            existingCardId={existingCardId}
            discordId={discordId}
        />
    );
}

export default function RegisterPage({ params }: { params: Promise<{ token: string }> }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <RegisterPageImpl params={params} />
        </Suspense>
    );
}
