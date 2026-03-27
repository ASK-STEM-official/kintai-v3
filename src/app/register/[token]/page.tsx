
import { getTempRegistration } from '@/app/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';
import { Suspense } from 'react';
import { fetchMemberNickname } from '@/lib/name-api';

export const dynamic = 'force-dynamic';

async function RegisterPageImpl({ params }: { params: Promise<{ token: string }> }) {
    const resolvedParams = await params;
    
    if (resolvedParams.token === 'card-unregistered') {
        return <RegisterPageClient token={resolvedParams.token} />;
    }

    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const tempReg = await getTempRegistration(resolvedParams.token);
    
    let displayName: string | null = null;
    let existingCardId: string | null = null;
    
    if (session?.user?.id) {
        const { data: memberProfile } = await supabase
            .schema('member')
            .from('members')
            .select('discord_uid')
            .eq('supabase_auth_user_id', session.user.id)
            .single();
        
        if (memberProfile?.discord_uid) {
            try {
                const { data: nickname } = await fetchMemberNickname(memberProfile.discord_uid);
                if (nickname) {
                    displayName = nickname;
                }
            } catch (e) {
                console.error('Failed to fetch nickname:', e);
            }
        }
        
        const { data: attendanceUser } = await supabase
            .schema('attendance')
            .from('users')
            .select('card_id')
            .eq('supabase_auth_user_id', session.user.id)
            .single();

        if (attendanceUser) {
            existingCardId = attendanceUser.card_id;
        }
    }

    return (
        <RegisterPageClient 
            token={resolvedParams.token}
            tempReg={tempReg}
            session={session}
            displayName={displayName}
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
