
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;

console.log('[DEBUG] API_BASE_URL:', API_BASE_URL);
console.log('[DEBUG] API_TOKEN:', API_TOKEN ? '***設定済み***' : '未設定');

if (!API_BASE_URL || !API_TOKEN) {
    console.warn("Member Status API environment variables (NEXT_PUBLIC_STEM_BOT_API_URL, STEM_BOT_API_BEARER_TOKEN) are not fully set. Member Status API features will be disabled.");
}

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

type MemberStatus = {
    discord_uid: string;
    is_in_server: boolean;
    current_nickname: string | null;
    current_roles: string[];
};

/**
 * Fetches the status for a single Discord user from the server.
 * @param discordUid The Discord user ID.
 * @returns The user's status, or a default object if not found or an error occurs.
 */
export async function fetchMemberStatus(discordUid: string): Promise<{ data: MemberStatus | null, error: any }> {
    console.log('[DEBUG] fetchMemberStatus called with discordUid:', discordUid);
    console.log('[DEBUG] API_BASE_URL:', API_BASE_URL);
    console.log('[DEBUG] API_TOKEN exists:', !!API_TOKEN);
    
    if (!API_BASE_URL || !API_TOKEN) {
        console.error('[DEBUG] API not configured!');
        return { data: null, error: "API not configured." };
    }
    try {
        const url = `/api/member/status?discord_uid=${discordUid}`;
        console.log('[DEBUG] Making request to:', url);
        console.log('[DEBUG] Full URL:', `${API_BASE_URL}${url}`);
        
        const response = await api.get<MemberStatus>(url);
        console.log('[DEBUG] Response status:', response.status);
        console.log('[DEBUG] Response data:', response.data);
        
        // APIドキュメント通り、200で直接MemberStatusオブジェクトを返す
        // is_in_serverフィールドで所属状況を判定
        if (response.status === 200 && response.data.discord_uid) {
            console.log('[DEBUG] Success! is_in_server:', response.data.is_in_server);
            return { data: response.data, error: null };
        }
        
        // 想定外のレスポンス
        console.error('[DEBUG] Unexpected response format');
        return { data: null, error: "Unexpected response format"};
    } catch (error: any) {
        console.error('[DEBUG] Error caught:', error.message);
        console.error('[DEBUG] Error response:', error.response?.status, error.response?.data);
        
        // APIドキュメント上、400エラー（discord_uid不足）以外は想定外
        console.error(`Failed to fetch member status for UID ${discordUid}:`, error);
        return { data: null, error };
    }
}

    