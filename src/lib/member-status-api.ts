
/**
 * Discord Bot API からメンバーステータスを取得するクライアント。
 */

type MemberStatus = {
    discord_uid: string;
    is_in_server: boolean;
    current_nickname: string | null;
    current_roles: string[];
};

function getConfig() {
    const baseUrl = (process.env.STEM_BOT_API_URL || process.env.NEXT_PUBLIC_STEM_BOT_API_URL || '').replace(/\/$/, '');
    const token = process.env.STEM_BOT_API_BEARER_TOKEN || '';
    return { baseUrl, token, configured: !!(baseUrl && token) };
}

export async function fetchMemberStatus(discordUid: string): Promise<{ data: MemberStatus | null, error: any }> {
    const { baseUrl, token, configured } = getConfig();
    if (!configured) {
        return { data: null, error: 'API not configured.' };
    }
    try {
        const res = await fetch(
            `${baseUrl}/api/member/status?discord_uid=${encodeURIComponent(discordUid)}`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(10000),
            }
        );
        if (!res.ok) {
            return { data: null, error: `HTTP ${res.status}` };
        }
        const json: MemberStatus = await res.json();
        if (json.discord_uid) {
            return { data: json, error: null };
        }
        return { data: null, error: 'Unexpected response format' };
    } catch (error: any) {
        console.error(`Failed to fetch member status for UID ${discordUid}:`, error.message);
        return { data: null, error };
    }
}
