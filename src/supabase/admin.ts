import { supabase, SUPABASE_URL } from './config'
import { Profile, UserRole } from '../types/scouting'

const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/admin-users`

// Creating accounts, setting someone else's password and deleting accounts
// need the service_role key, which can't ship in the browser — they go through
// the admin-users Edge Function, which re-checks that the caller is an admin.
async function callAdminFunction(action: string, args: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Not signed in')

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, ...args })
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`)
  return body
}

export const createScout = (args: {
  username: string
  displayName: string
  password: string
  role: UserRole
}) => callAdminFunction('createUser', args)

export const resetScoutPassword = (userId: string, password: string) =>
  callAdminFunction('resetPassword', { userId, password })

export const deleteScout = (userId: string) => callAdminFunction('deleteUser', { userId })

// Everything below is ordinary table access — RLS and the profiles trigger
// decide what the caller is actually allowed to change.

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, display_name, role, is_active')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name ?? '',
    role: (row.role as UserRole) ?? 'scout',
    isActive: !!row.is_active
  }))
}

async function updateProfile(userId: string, patch: Record<string, unknown>) {
  const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId)
  if (error) throw error
}

export const setProfileActive = (userId: string, isActive: boolean) =>
  updateProfile(userId, { is_active: isActive })

export const setProfileRole = (userId: string, role: UserRole) =>
  updateProfile(userId, { role })

export const setProfileDisplayName = (userId: string, displayName: string) =>
  updateProfile(userId, { display_name: displayName })

// How many entries each scout has authored, for the admin member list.
export async function fetchScoutCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('scout_entries').select('scouted_by')
  if (error) throw error
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = (row as { scouted_by: string | null }).scouted_by
    if (id) counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}
