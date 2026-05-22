'use server';

import { cookies } from 'next/headers';

const STEM_URL = process.env.NEXT_PUBLIC_STEM_SYSTEM_URL;

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
  try {
    const res = await stemFetch('/api/v1/members');
    if (!res.ok) return [];
    return res.json();
  } catch {
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
