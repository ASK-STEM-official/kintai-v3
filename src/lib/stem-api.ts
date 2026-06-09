'use server';

import { cookies } from 'next/headers';

const STEM_URL = (() => {
  const raw = process.env.NEXT_PUBLIC_STEM_SYSTEM_URL ?? process.env.NEXT_PUBLIC_STEM_OAUTH_BASE_URL;
  if (!raw) return undefined;
  try { return new URL(raw).origin; } catch { return raw; }
})();

export type StemMember = {
  id: string;
  display_name: string;
  discord_uid: string;
  discord_username: string | null;
  generation: number;
  status: number;
  is_admin: boolean;
  avatar_url: string | null;
  joined_at: string;
  deleted_at: string | null;
  student_number?: string | null;
  teams: { id: string; name: string }[];
};

export type StemTeam = {
  id: string;
  name: string;
  members: { id: string; generation: number; status: number; display_name: string | null }[];
};

async function stemFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get('oauth_access_token')?.value;
  if (!token) throw new Error('No OAuth token');

  return fetch(`${STEM_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
}

export async function getMe(): Promise<StemMember | null> {
  try {
    const res = await stemFetch('/api/v1/me');
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function getMembers(): Promise<StemMember[]> {
  if (!STEM_URL) {
    console.error('[stem-api] NEXT_PUBLIC_STEM_SYSTEM_URL / NEXT_PUBLIC_STEM_OAUTH_BASE_URL is not set');
    return [];
  }
  try {
    const res = await stemFetch('/api/v1/members');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[stem-api] getMembers: ${res.status} ${res.statusText} — ${body}`);
      return [];
    }
    return res.json();
  } catch (e) {
    console.error('[stem-api] getMembers error:', e);
    return [];
  }
}

export async function getTeams(): Promise<StemTeam[]> {
  try {
    const res = await stemFetch('/api/v1/teams');
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
