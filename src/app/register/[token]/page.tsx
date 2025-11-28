import { getTempRegistration, getAllTeams } from '@/app/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';
import { Suspense } from 'react';
import { fetchMemberNickname } from '@/lib/name-api';

export const dynamic = 'force-dynamic';

async function RegisterPageImpl({ params }: { params: Promise<{ token: string }> }) {
    const resolvedParams = await params;
    
    if (resolvedParams.token === 'unregistered') {
        return <RegisterPageClient token={resolvedParams.token} />;
    }

    const supabase = await createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const [tempRegResult, teamsResult] = await Promise.all([
        getTempRegistration(resolvedParams.token),
        getAllTeams()
    ]);
    
    const tempReg = tempRegResult;
    const { data: teams } = teamsResult;
    
    let fullProfile = null;
    let displayName: string | null = null;
    
    if (session?.user?.id) {
        const { data, error: profileError } = await supabase
            .schema('member')
            .from('members')
            .select(`
                *,
                teams:member_team_relations(teams(name))
            `)
            .eq('supabase_auth_user_id', session.user.id)
            .single();
        
        if (profileError) {
            console.error('Error fetching member profile:', profileError);
        }
        
        if (data) {
            // attendance.users テーブルから card_id を取得
            const { data: attendanceUser } = await supabase
                .schema('attendance')
                .from('users')
                .select('card_id')
                .eq('supabase_auth_user_id', session.user.id)
                .single();
            
            fullProfile = {
                ...data,
                // @ts-ignore
                teams: data.teams?.[0]?.teams || null,
                attendance_user: attendanceUser
            };
            
            // Discord UIDから本名を取得
            // @ts-ignore
            if (data.discord_uid) {
                try {
                    // @ts-ignore
                    const { data: nickname } = await fetchMemberNickname(data.discord_uid);
                    if (nickname) {
                        displayName = nickname;
                    }
                } catch (e) {
                    console.error('Failed to fetch nickname:', e);
                }
            }
        }
    }

    return (
        <RegisterPageClient 
            token={resolvedParams.token}
            tempReg={tempReg}
            teams={teams || []}
            session={session}
            fullProfile={fullProfile}
            displayName={displayName}
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
