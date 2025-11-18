import { getTempRegistration, getAllTeams } from '@/app/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

async function RegisterPageImpl({ params }: { params: { token: string } }) {
    if (params.token === 'unregistered') {
        return <RegisterPageClient token={params.token} />;
    }

    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const [tempRegResult, teamsResult] = await Promise.all([
        getTempRegistration(params.token),
        getAllTeams()
    ]);
    
    const tempReg = tempRegResult;
    const { data: teams } = teamsResult;
    
    let fullProfile = null;
    if (session?.user?.id) {
        const { data } = await supabase.schema('member').from('members').select(`
            *,
            attendance_user:attendance_users(card_id),
            teams:member_team_relations(teams(name))
        `).eq('id', session.user.id).single();
        // @ts-ignore
        if (data) {
             fullProfile = {
                ...data,
                // @ts-ignore
                teams: data.teams[0]?.teams,
                // @ts-ignore
                attendance_user: data.attendance_user[0]
            }
        }
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
