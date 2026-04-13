
import { getTempRegistration } from '@/app/actions';
import { getOAuthUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';
import { Suspense } from 'react';
import { fetchMemberNickname } from '@/lib/name-api';

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
    
    if (oauthUser) {
        displayName = oauthUser.displayName;
        
        const adminSupabase = await createSupabaseAdminClient();

        if (oauthUser.discordId) {
            discordUsername = oauthUser.discordId;
            try {
                const { data: nickname } = await fetchMemberNickname(oauthUser.discordId);
                if (nickname) {
                    displayName = nickname;
                }
            } catch (e) {
                console.error('Failed to fetch nickname:', e);
            }
        }
        
        const { data: attendanceUser } = await adminSupabase
            .schema('attendance')
            .from('users')
            .select('card_id')
            .eq('supabase_auth_user_id', oauthUser.id)
            .single();

        if (attendanceUser) {
            existingCardId = attendanceUser.card_id;
        }
    }

    return (
        <RegisterPageClient 
            token={resolvedParams.token}
            tempReg={tempReg}
            isAuthenticated={!!oauthUser}
            displayName={displayName}
            discordUsername={discordUsername}
            existingCardId={existingCardId}
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
