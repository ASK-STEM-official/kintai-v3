
import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_STEM_BOT_API_URL;
const API_TOKEN = process.env.STEM_BOT_API_BEARER_TOKEN;

if (!API_BASE_URL || !API_TOKEN) {
    console.warn("Name API environment variables (NEXT_PUBLIC_STEM_BOT_API_URL, STEM_BOT_API_BEARER_TOKEN) are not fully set. Name API features will be disabled.");
}

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
    }
});

type MemberName = {
    uid: string;
    name: string;
};

type MemberNickname = {
    discord_uid: string;
    full_nickname: string;
    name_only: string;
};

/**
 * Fetches a list of all members and their real names from the Discord server.
 * @returns An array of objects with `uid` and `name`, or null if an error occurs.
 */
export async function fetchAllMemberNames(): Promise<{ data: MemberName[] | null, error: any }> {
    if (!API_BASE_URL || !API_TOKEN) {
        return { data: null, error: "API not configured." };
    }
    try {
        const response = await api.get('/api/members');
        if (response.data.success && Array.isArray(response.data.data)) {
            return { data: response.data.data, error: null };
        }
        return { data: null, error: response.data.message || "Failed to fetch members." };
    } catch (error) {
        console.error('Failed to fetch all member names:', error);
        return { data: null, error };
    }
}

/**
 * Fetches the real name (nickname) for a specific Discord user.
 * @param discordUid The Discord user ID
 * @returns The member's real name, or null if an error occurs or API is not configured.
 */
export async function fetchMemberNickname(discordUid: string): Promise<{ data: string | null, error: any }> {
    if (!API_BASE_URL || !API_TOKEN) {
        return { data: null, error: "API not configured." };
    }
    try {
        const response = await api.get<MemberNickname>('/api/nickname', {
            params: { discord_uid: discordUid },
            timeout: 10000
        });
        
        if (response.data && response.data.name_only) {
            return { data: response.data.name_only, error: null };
        }
        return { data: null, error: "Invalid response format" };
    } catch (error: any) {
        console.error('Failed to fetch member nickname:', error);
        if (error.code === 'ECONNABORTED') {
            return { data: null, error: 'TIMEOUT' };
        }
        if (error.response?.status === 502 || error.response?.status === 503) {
            return { data: null, error: 'SERVER_ERROR' };
        }
        return { data: null, error };
    }
}

    