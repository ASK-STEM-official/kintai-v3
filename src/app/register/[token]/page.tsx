import { getTempRegistration, getAllTeams } from '@/app/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

async function RegisterPageImpl({ params }: { params: { token: string } }) {
    if (params.token === 'unregistered') {
        return <RegisterPageClient token={params.token} />;
    }

    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const [tempRegResult, teamsResult] = await Promise.all([
        getTempRegistration(params.token),
        getAllTeams()
    ]);
    
    const tempReg = tempRegResult;
    const { data: teams } = teamsResult;
    
    let fullProfile = null;
    if (session?.user?.user_metadata?.provider_id) {
        const { data } = await supabase.from('users').select('*, teams(name)').eq('discord_id', session.user.user_metadata.provider_id).single();
        fullProfile = data;
    }

    return (
        <RegisterPageClient 
            token={params.token}
            tempReg={tempReg}
            teams={teams || []}
            session={session}
            fullProfile={fullProfile}
        />
    );
}

export default function RegisterPage({ params }: { params: { token: string } }) {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <RegisterPageImpl params={params} />
        </Suspense>
    );
}
