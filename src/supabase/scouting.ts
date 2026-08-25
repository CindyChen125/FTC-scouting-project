import Taro from '@tarojs/taro'
import { supabase } from './config'
import { MatchScoutEntry, scoutEntryStorageKey } from '../types/scouting'
import { CURRENT_EVENT_CODE } from '../data/events'
import { enqueue, dequeue, pendingEntries, pendingCount } from './outbox'

const TABLE = 'scout_entries'

// Postgres columns are snake_case; the app's TypeScript shape is camelCase.
type Row = {
  event_code: string
  match_id: string
  team_number: string
  alliance: string
  scout_name: string
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
  auto: row.auto,
  teleop: row.teleop,
  endgame: row.endgame,
  overallNotes: row.overall_notes ?? '',
  updatedAt: Number(row.updated_at)
})

// An unreachable host can leave a request pending indefinitely rather than
// failing, which would hang the UI in limbo instead of telling a scout their
// data isn't syncing. Every network call gets a deadline.
const REQUEST_TIMEOUT_MS = 8000

function withTimeout<T>(work: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

const push = (entry: MatchScoutEntry) =>
  withTimeout(
    supabase.from(TABLE).upsert(toRow(entry), { onConflict: 'event_code,match_id,team_number' })
  )

// Submits an entry. The local copy is written by the caller and is what the
// UI trusts; if the network write fails (no signal at a venue) the entry is
// queued and retried automatically, so submitting offline never loses data.
export async function submitScoutEntry(entry: MatchScoutEntry) {
  try {
    const { error } = await push(entry)
    if (error) throw error
    dequeue(entry)
  } catch (err) {
    enqueue(entry)
    throw err
  }
}

// Retries everything queued. Returns how many are still pending afterwards.
export async function flushOutbox(): Promise<number> {
  for (const entry of pendingEntries()) {
    try {
      const { error } = await push(entry)
      if (error) throw error
      dequeue(entry)
    } catch {
      // Still offline — stop and leave the rest queued for the next attempt.
      break
    }
  }
  return pendingCount()
}

export { pendingCount }

// Locally submitted entries, used so the list still shows this scout's own
// work when the network is unreachable.
function localEntries(): MatchScoutEntry[] {
  const { keys } = Taro.getStorageInfoSync()
  return keys
    .filter((key) => key.startsWith('scout:'))
    .map((key) => Taro.getStorageSync(key) as MatchScoutEntry)
    .filter(Boolean)
}

// Remote rows win over local copies of the same entry (another scout may have
// edited it), except while an entry is still queued — then ours is newer.
function mergeEntries(remote: MatchScoutEntry[]): MatchScoutEntry[] {
  const byKey = new Map<string, MatchScoutEntry>()
  for (const entry of localEntries()) {
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
  onChange: (entries: MatchScoutEntry[]) => void,
  onError?: (err: Error) => void
) {
  let remote: MatchScoutEntry[] = []
  let active = true

  const emit = () => {
    if (active) onChange(mergeEntries(remote))
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
    .channel('scout_entries_changes')
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
  matchId: string,
  teamNumber: string,
  onChange: (entry: MatchScoutEntry | null) => void,
  onError?: (err: Error) => void
) {
  return subscribeScoutEntries(
    (entries) => onChange(entries.find((e) => e.matchId === matchId && e.teamNumber === teamNumber) ?? null),
    onError
  )
}

// One-time fetch used by the scout form's Edit deep-link when this device has
// no local copy — e.g. editing an entry another scout submitted.
export async function fetchScoutEntry(matchId: string, teamNumber: string): Promise<MatchScoutEntry | null> {
  const local = Taro.getStorageSync(scoutEntryStorageKey(matchId, teamNumber))
  if (local) return local as MatchScoutEntry

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select('*')
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
