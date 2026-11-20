import { supabase } from './config'
import { withTimeout } from './timeout'

export interface StrategyParticipant {
  userId: string
  sessionId: string
  displayName: string
  editingKey: string | null
  lastSeen: string
}

type PresenceRow = {
  user_id: string
  session_id: string
  display_name: string
  editing_key: string | null
  last_seen: string
}

export async function listStrategyParticipants(strategyId: string): Promise<StrategyParticipant[]> {
  const since = new Date(Date.now() - 45000).toISOString()
  const { data, error } = await withTimeout(supabase.from('strategy_presence')
    .select('user_id,session_id,display_name,editing_key,last_seen')
    .eq('strategy_id', strategyId).gte('last_seen', since))
  if (error) throw error
  return ((data ?? []) as PresenceRow[]).map((row) => ({
    userId: row.user_id, sessionId: row.session_id, displayName: row.display_name,
    editingKey: row.editing_key, lastSeen: row.last_seen
  }))
}

export async function updateStrategyPresence(strategyId: string, userId: string,
  sessionId: string, displayName: string, editingKey: string | null): Promise<void> {
  const { error } = await withTimeout(supabase.from('strategy_presence').upsert({
    strategy_id: strategyId, user_id: userId, session_id: sessionId,
    display_name: displayName.slice(0, 80), editing_key: editingKey,
    last_seen: new Date().toISOString()
  }, { onConflict: 'strategy_id,user_id,session_id' }))
  if (error) throw error
}

export async function leaveStrategyRoom(strategyId: string, userId: string, sessionId: string): Promise<void> {
  const { error } = await withTimeout(supabase.from('strategy_presence').delete()
    .eq('strategy_id', strategyId).eq('user_id', userId).eq('session_id', sessionId))
  if (error) throw error
}

let channelSequence = 0
export function subscribeStrategyRoom(strategyId: string, onObjects: () => void,
  onScenario: () => void, onPresence: () => void): () => void {
  const channel = supabase.channel(`strategy_room_${strategyId}_${++channelSequence}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'strategy_objects',
      filter: `strategy_id=eq.${strategyId}` }, onObjects)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'strategies',
      filter: `id=eq.${strategyId}` }, onScenario)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'strategy_presence',
      filter: `strategy_id=eq.${strategyId}` }, onPresence)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}
