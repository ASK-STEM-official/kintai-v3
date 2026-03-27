
/**
 * Discord Bot API から表示名を取得するクライアント。
 *
 * 環境変数:
 *   STEM_BOT_API_URL          — Bot API のベース URL
 *   NEXT_PUBLIC_STEM_BOT_API_URL — フォールバック（既存互換）
 *   STEM_BOT_API_BEARER_TOKEN — Bearer トークン
 */

type MemberName = {
    uid: string;
    name: string;
    username?: string;
};

type MemberNickname = {
    discord_uid: string;
    full_nickname: string;
    name_only: string;
};

function getConfig() {
    const baseUrl = (process.env.STEM_BOT_API_URL || process.env.NEXT_PUBLIC_STEM_BOT_API_URL || '').replace(/\/$/, '');
    const token = process.env.STEM_BOT_API_BEARER_TOKEN || '';
    return { baseUrl, token, configured: !!(baseUrl && token) };
}

/**
 * 全メンバーの名前を一括取得
 */
export async function fetchAllMemberNames(): Promise<{ data: MemberName[] | null, error: any }> {
    const { baseUrl, token, configured } = getConfig();
    if (!configured) {
        console.warn('Bot API not configured (STEM_BOT_API_URL / STEM_BOT_API_BEARER_TOKEN)');
        return { data: null, error: 'API not configured.' };
    }
    try {
        const res = await fetch(`${baseUrl}/api/members`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const text = await res.text();
            console.error(`Bot API /api/members failed: ${res.status} ${text}`);
            return { data: null, error: `HTTP ${res.status}` };
        }
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
            return { data: json.data, error: null };
        }
        return { data: null, error: json.message || 'Unexpected response format' };
    } catch (error) {
        console.error('Failed to fetch all member names:', error);
        return { data: null, error };
    }
}

/**
 * 特定ユーザーのニックネームを取得
 */
export async function fetchMemberNickname(discordUid: string): Promise<{ data: string | null, error: any }> {
    const { baseUrl, token, configured } = getConfig();
    if (!configured) {
        return { data: null, error: 'API not configured.' };
    }
    try {
        const res = await fetch(`${baseUrl}/api/nickname?discord_uid=${encodeURIComponent(discordUid)}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            return { data: null, error: `HTTP ${res.status}` };
        }
        const json: MemberNickname = await res.json();
        if (json.name_only) {
            return { data: json.name_only, error: null };
        }
        return { data: null, error: 'Invalid response format' };
    } catch (error: any) {
        console.error('Failed to fetch member nickname:', error);
        return { data: null, error };
    }
}
