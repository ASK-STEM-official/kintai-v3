import { getTempRegistration, signInWithDiscord, getAllTeams } from '@/app/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import RegisterPageClient from './page-client';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({ params, searchParams }: { params: { token: string }, searchParams: { success?: string, error?: string } }) {
    
    if (params.token === 'unregistered') {
        // This is a special case, we don't need to fetch anything.
        // The client component will handle rendering the message.
        return <RegisterPageClient token={params.token} />;
    }

    const supabase = createSupabaseServerClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    const tempReg = await getTempRegistration(params.token);
    const { data: teams } = await getAllTeams();
    
    let fullProfile = null;
    if (session?.user) {
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
