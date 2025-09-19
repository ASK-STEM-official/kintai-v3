import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Database } from '@/lib/types';
import KioskContainer from '@/components/kiosk/KioskContainer';

export const dynamic = 'force-dynamic';

type Announcement = Database['public']['Tables']['announcements']['Row'] | null;
type Team = Database['public']['Tables']['teams']['Row'];

export default async function KioskPage() {
  const supabase = createSupabaseServerClient();
  const { data: initialAnnouncement } = await supabase.from('announcements').select('*').eq('is_current', true).limit(1).maybeSingle();
  const { data: teamsData } = await supabase.from('teams').select('*');
  const teams = teamsData || [];

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex items-center justify-center">
      <KioskContainer initialAnnouncement={initialAnnouncement} teams={teams} />
    </div>
  );
}
