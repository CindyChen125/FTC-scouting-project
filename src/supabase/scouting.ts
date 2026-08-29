import Taro from '@tarojs/taro'
import { supabase } from './config'
import { MatchScoutEntry, scoutEntryStorageKey, scoutEntryKeyPrefix } from '../types/scouting'
import { CURRENT_EVENT_CODE } from '../data/events'
import { withTimeout, isPermanentRejection } from './timeout'
import { enqueue, dequeue, pendingEntries, pendingCount } from './outbox'

const TABLE = 'scout_entries'

// Postgres columns are snake_case; the app's TypeScript shape is camelCase.
type Row = {
  event_code: string
  match_id: string
  team_number: string
  alliance: string
  scout_name: string
  scouted_by: string | null
  last_edited_by: string | null
  auto: MatchScoutEntry['auto']
  teleop: MatchScoutEntry['teleop']
  endgame: MatchScoutEntry['endgame']
  overall_notes: string
  updated_at: number
}

const toRow = (entry: MatchScoutEntry): Row => ({
  event_code: entry.eventCode ?? CURRENT_EVENT_CODE,
  match_id: entry.matchId,
  team_number: entry.teamNumber,
  alliance: entry.alliance,
  scout_name: entry.scoutName ?? '',
  scouted_by: entry.scoutedBy ?? null,
  last_edited_by: entry.lastEditedBy ?? null,
  auto: entry.auto,
  teleop: entry.teleop,
  endgame: entry.endgame,
  overall_notes: entry.overallNotes ?? '',
  updated_at: entry.updatedAt
})

const toEntry = (row: Row): MatchScoutEntry => ({
  eventCode: row.event_code,
  matchId: row.match_id,
  teamNumber: row.team_number,
  alliance: row.alliance as MatchScoutEntry['alliance'],
  scoutName: row.scout_name ?? '',
  scoutedBy: row.scouted_by,
  lastEditedBy: row.last_edited_by,
  auto: row.auto,
  teleop: row.teleop,
  endgame: row.endgame,
  overallNotes: row.overall_notes ?? '',
  updatedAt: Number(row.updated_at)
})

let channelSeq = 0

const push = (entry: MatchScoutEntry) =>
  withTimeout(
    supabase.from(TABLE).upsert(toRow(entry), { onConflict: 'event_code,match_id,team_number' })
  )

export type SubmitOutcome = 'synced' | 'queued' | 'rejected'

// Submits an entry. The caller writes the local copy; this shares it with the
// rest of the team.
//
//   synced   — it reached the server
//   queued   — no signal, saved and retried automatically (the venue case)
//   rejected — the server refused and always will, e.g. the account was
//              deleted or deactivated. Queuing that would retry forever and
//              let the UI keep claiming success for data nobody else will see.
export async function submitScoutEntry(entry: MatchScoutEntry): Promise<SubmitOutcome> {
  try {
    const { error } = await push(entry)
    if (error) throw error
    dequeue(entry)
    return 'synced'
  } catch (err) {
    if (isPermanentRejection(err)) {
      dequeue(entry)
      return 'rejected'
    }
    enqueue(entry)
    return 'queued'
  }
}

// Retries everything queued. Returns how many are still pending afterwards.
export async function flushOutbox(): Promise<number> {
  for (const entry of pendingEntries()) {
    try {
      const { error } = await push(entry)
      if (error) throw error
      dequeue(entry)
    } catch (err) {
      if (isPermanentRejection(err)) {
        // Will never succeed for this account. Drop it from the queue so one
        // dead entry can't block every later submission from syncing; the
        // local copy stays on the device and still exports.
        dequeue(entry)
        continue
      }
      // Still offline — stop and leave the rest queued for the next attempt.
      break
    }
  }
  return pendingCount()
}

export { pendingCount }

// This scout's own submitted entries, kept so the list still shows their work
// when the network is unreachable. Scoped to one user so a shared phone never
// mixes two people's data.
function localEntries(userId: string | null): MatchScoutEntry[] {
  if (!userId) return []
  const prefix = scoutEntryKeyPrefix(userId)
  const { keys } = Taro.getStorageInfoSync()
  return keys
    .filter((key) => key.startsWith(prefix))
    .map((key) => Taro.getStorageSync(key) as MatchScoutEntry)
    .filter(Boolean)
}

// Remote rows win over local copies of the same entry (another scout may have
// edited it), except while an entry is still queued — then ours is newer.
function mergeEntries(remote: MatchScoutEntry[], userId: string | null): MatchScoutEntry[] {
  const byKey = new Map<string, MatchScoutEntry>()
  for (const entry of localEntries(userId)) {
    byKey.set(`${entry.eventCode ?? ''}:${entry.matchId}:${entry.teamNumber}`, entry)
  }
  for (const entry of remote) {
    const key = `${entry.eventCode ?? ''}:${entry.matchId}:${entry.teamNumber}`
    const local = byKey.get(key)
    if (!local || entry.updatedAt >= local.updatedAt) byKey.set(key, entry)
  }
  return [...byKey.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

// Live-subscribes to every submitted entry across all scouts/devices. Returns
// an unsubscribe function. Emits immediately from local storage, then again
// after the initial fetch and on every realtime change.
export function subscribeScoutEntries(
  userId: string | null,
  onChange: (entries: MatchScoutEntry[]) => void,
  onError?: (err: Error) => void
) {
  let remote: MatchScoutEntry[] = []
  let active = true

  const emit = () => {
    if (active) onChange(mergeEntries(remote, userId))
  }

  const load = async () => {
    try {
      // supabase-js rejects on network failure rather than resolving with an
      // error, so both paths have to be handled or an offline device would
      // silently show no sync warning at all.
      const { data, error } = await withTimeout(
        supabase.from(TABLE).select('*').order('updated_at', { ascending: false })
      )
      if (!active) return
      if (error) throw error
      remote = (data as Row[]).map(toEntry)
      emit()
    } catch (err) {
      if (!active) return
      // Show whatever is stored locally rather than an empty list.
      emit()
      onError?.(err as Error)
    }
  }

  // Anything queued from an earlier offline session goes out now.
  flushOutbox().then((stillPending) => {
    if (stillPending === 0) load()
  })

  emit()
  load()

  const channel = supabase
    // Unique per subscription. Taro keeps the previous page mounted when you
    // navigate, so the list and a detail view are subscribed at the same time
    // — reusing one channel name made the second caller throw ("cannot add
    // postgres_changes callbacks after subscribe()") and blanked the page.
    .channel(`scout_entries_${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => load())
    .subscribe()

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

// Live-subscribes to one submitted entry (for the read-only detail view).
// Emits null if it doesn't exist anywhere.
export function subscribeScoutEntry(
  userId: string | null,
  matchId: string,
  teamNumber: string,
  onChange: (entry: MatchScoutEntry | null) => void,
  onError?: (err: Error) => void
) {
  return subscribeScoutEntries(
    userId,
    (entries) => onChange(entries.find((e) => e.matchId === matchId && e.teamNumber === teamNumber) ?? null),
    onError
  )
}

// One-time fetch used by the scout form's Edit deep-link when this device has
// no local copy — e.g. editing an entry another scout submitted.
export async function fetchScoutEntry(
  userId: string | null,
  eventCode: string,
  matchId: string,
  teamNumber: string
): Promise<MatchScoutEntry | null> {
  if (userId) {
    const local = Taro.getStorageSync(scoutEntryStorageKey(userId, eventCode, matchId, teamNumber))
    if (local) return local as MatchScoutEntry
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select('*')
        .eq('event_code', eventCode)
        .eq('match_id', matchId)
        .eq('team_number', teamNumber)
        .order('updated_at', { ascending: false })
        .limit(1)
    )
    if (error || !data || data.length === 0) return null
    return toEntry(data[0] as Row)
  } catch {
    // Offline with no local copy — the form just opens blank.
    return null
  }
}
