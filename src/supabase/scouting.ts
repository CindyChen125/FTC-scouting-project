import Taro from '@tarojs/taro'
import { supabase } from './config'
import { MatchScoutEntry, scoutEntryStorageKey, scoutBackupKey, scoutEntryKeyPrefix } from '../types/scouting'
import { entryEventCode } from '../data/events'
import { withTimeout, classifySyncFailure, reportDevelopmentError, storageFailure, SyncFailure } from './timeout'
import { enqueue, dequeue, outboxKey, pendingEntries, pendingCount } from './outbox'

const TABLE = 'scout_entries'

// Postgres columns are snake_case; the app's TypeScript shape is camelCase.
type Row = {
  observation_key: string
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
  observation_key: entry.observationKey ?? entry.scoutedBy ?? 'legacy',
  event_code: entryEventCode(entry),
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
  observationKey: row.observation_key,
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
}) as MatchScoutEntry

const identityKey = (identity: { eventCode?: string; matchId: string; teamNumber: string; observationKey?: string; scoutedBy?: string | null }) =>
  `${identity.eventCode ?? ''}:${identity.matchId}:${identity.teamNumber}:${identity.observationKey ?? identity.scoutedBy ?? 'legacy'}`

// An edit reopened from a locally moved row can itself be moved again before
// the first correction syncs. Follow queued moves back to the server's actual
// row, so a chain A→B→C is retried as one update A→C.
function originalQueuedTarget(entry: MatchScoutEntry, queued: MatchScoutEntry[]): MatchScoutEntry {
  if (!entry.editTarget) return entry
  let target = entry.editTarget
  const seen = new Set<string>()
  while (!seen.has(identityKey(target))) {
    seen.add(identityKey(target))
    const previous = queued.find((candidate) => candidate.pendingSyncOperation === 'update' &&
      candidate.editTarget && identityKey(candidate) === identityKey(target) &&
      identityKey(candidate.editTarget) !== identityKey(target))
    if (!previous?.editTarget) break
    target = previous.editTarget
  }
  return identityKey(target) === identityKey(entry.editTarget) ? entry : { ...entry, editTarget: target }
}

let channelSeq = 0

const push = (entry: MatchScoutEntry) =>
  withTimeout(
    supabase.from(TABLE).upsert(toRow(entry), { onConflict: 'event_code,match_id,team_number,observation_key' })
  )

type SubmitOperation = 'upsert' | 'update'

class EditTargetMissingError extends Error {
  code = 'EDIT_TARGET_MISSING'

  constructor() {
    super('The selected scouting observation no longer exists')
    this.name = 'EditTargetMissingError'
  }
}

const updateExisting = async (entry: MatchScoutEntry) => {
  const row = toRow(entry)
  const target = entry.editTarget ?? {
    eventCode: row.event_code, matchId: row.match_id,
    teamNumber: row.team_number, observationKey: row.observation_key
  }
  const { data, error } = await withTimeout(
    supabase.from(TABLE)
      .update(row)
      .eq('event_code', target.eventCode)
      .eq('match_id', target.matchId)
      .eq('team_number', target.teamNumber)
      .eq('observation_key', target.observationKey)
      .select('event_code')
  )
  if (error) throw error
  if (data?.length) return

  // RLS can hide an update by returning zero rows. Distinguish that from a
  // genuinely deleted edit target so the scout gets the right recovery path.
  const { data: existing, error: lookupError } = await withTimeout(
    supabase.from(TABLE).select('event_code')
      .eq('event_code', target.eventCode)
      .eq('match_id', target.matchId)
      .eq('team_number', target.teamNumber)
      .eq('observation_key', target.observationKey)
      .maybeSingle()
  )
  if (!lookupError && existing) {
    const permissionError = new Error('Permission denied while updating this scouting observation') as Error & { code: string }
    permissionError.code = '42501'
    throw permissionError
  }
  throw new EditTargetMissingError()
}

const withoutPendingOperation = (entry: MatchScoutEntry): MatchScoutEntry => {
  const cleanEntry = { ...entry }
  delete cleanEntry.pendingSyncOperation
  return cleanEntry
}

export interface SubmitOutcome {
  status: 'synced' | 'queued' | 'error'
  failure?: SyncFailure
  editTargetMissing?: boolean
  editConflict?: boolean
}

export interface FlushOutcome {
  pending: number
  failure?: SyncFailure
}

// Submits an entry. The caller writes the local copy; this shares it with the
// rest of the team.
//
//   synced — it reached the server
//   queued — no signal; saved and retried automatically (the venue case)
//   error  — the server responded with a schema, permission or data problem;
//            the local/outbox copy is deliberately retained for later retry.
export async function submitScoutEntry(entry: MatchScoutEntry, operation: SubmitOperation = 'upsert'): Promise<SubmitOutcome> {
  const queuedBefore = operation === 'update' ? pendingEntries() : []
  const saveEntry = operation === 'update' ? originalQueuedTarget(entry, queuedBefore) : entry
  const originalQueueKey = outboxKey({ ...saveEntry, pendingSyncOperation: 'update' })
  const staleMoves = queuedBefore.filter((candidate) => candidate.pendingSyncOperation === 'update' &&
    outboxKey(candidate) !== originalQueueKey &&
    outboxKey(originalQueuedTarget(candidate, queuedBefore)) === originalQueueKey)
  try {
    if (operation === 'update') await updateExisting(saveEntry)
    else {
      const { error } = await push(saveEntry)
      if (error) throw error
    }
  } catch (err) {
    reportDevelopmentError('match-scout:sync', err)
    if (err instanceof EditTargetMissingError) {
      return {
        status: 'error',
        editTargetMissing: true,
        failure: { kind: 'missing', message: err.message }
      }
    }
    if (operation === 'update' && (err as { code?: string })?.code === '23505') {
      return { status: 'error', editConflict: true, failure: classifySyncFailure(err) }
    }
    try {
      enqueue({ ...saveEntry, pendingSyncOperation: operation })
      for (const stale of staleMoves) dequeue(stale)
    } catch (queueError) {
      reportDevelopmentError('match-scout:queue', queueError)
      return {
        status: 'error',
        failure: storageFailure(queueError, 'Could not add the local copy to the retry queue')
      }
    }
    const failure = classifySyncFailure(err)
    return { status: failure.kind === 'network' ? 'queued' : 'error', failure }
  }

  // The server write is already confirmed at this point. A local cleanup
  // problem must not turn that success into a false sync failure; leaving the
  // item queued is safe because the upsert is idempotent.
  try {
    dequeue({ ...saveEntry, pendingSyncOperation: operation })
    for (const stale of staleMoves) dequeue(stale)
  } catch (cleanupError) {
    reportDevelopmentError('match-scout:queue-cleanup', cleanupError)
  }
  return { status: 'synced' }
}

// Retries everything queued. Returns how many are still pending afterwards.
export async function flushOutbox(): Promise<FlushOutcome> {
  let failure: SyncFailure | undefined
  const queued = pendingEntries()
  const latestByTarget = new Map<string, MatchScoutEntry>()
  for (const raw of queued) {
    const normalized = raw.pendingSyncOperation === 'update' ? originalQueuedTarget(raw, queued) : raw
    const key = outboxKey(normalized)
    const previous = latestByTarget.get(key)
    if (!previous || normalized.updatedAt >= previous.updatedAt) latestByTarget.set(key, normalized)
  }
  for (const [key, queuedEntry] of latestByTarget) {
    try {
      const operation = queuedEntry.pendingSyncOperation ?? 'upsert'
      const entry = withoutPendingOperation(queuedEntry)
      if (operation === 'update') await updateExisting(entry)
      else {
        const { error } = await push(entry)
        if (error) throw error
      }
      for (const raw of queued) {
        const normalized = raw.pendingSyncOperation === 'update' ? originalQueuedTarget(raw, queued) : raw
        if (outboxKey(normalized) === key) dequeue(raw)
      }
    } catch (err) {
      // Schema, permission and validation failures are not "offline", but the
      // entry must still remain retryable after an admin fixes the cause.
      reportDevelopmentError('match-scout:flush', err)
      failure = classifySyncFailure(err)
      break
    }
  }
  return { pending: pendingCount(), failure }
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
  const keyOf = (entry: MatchScoutEntry) => identityKey({ ...entry, eventCode: entryEventCode(entry) })
  const queued = pendingEntries().filter((entry) => Boolean(userId) &&
    (entry.scoutedBy === userId || entry.lastEditedBy === userId))
  const latestByTarget = new Map<string, MatchScoutEntry>()
  const pendingMoves = new Set<string>()
  for (const raw of queued) {
    const entry = raw.pendingSyncOperation === 'update' ? originalQueuedTarget(raw, queued) : raw
    const targetKey = entry.pendingSyncOperation === 'update' && entry.editTarget
      ? identityKey(entry.editTarget) : keyOf(entry)
    const previous = latestByTarget.get(targetKey)
    if (!previous || entry.updatedAt >= previous.updatedAt) latestByTarget.set(targetKey, entry)
    if (entry.pendingSyncOperation === 'update' && entry.editTarget && targetKey !== keyOf(entry)) {
      pendingMoves.add(targetKey)
      pendingMoves.add(keyOf(entry))
    }
  }
  for (const entry of latestByTarget.values()) pendingMoves.delete(keyOf(entry))
  for (const entry of localEntries(userId)) {
    if (pendingMoves.has(keyOf(entry))) continue
    byKey.set(keyOf(entry), entry)
  }
  for (const entry of remote) {
    const key = keyOf(entry)
    if (pendingMoves.has(key)) continue
    const local = byKey.get(key)
    if (!local || entry.updatedAt >= local.updatedAt) byKey.set(key, entry)
  }
  // A correction in the retry queue remains the newest view of that
  // observation. Keep its original server target for the Edit action.
  for (const entry of latestByTarget.values()) byKey.set(keyOf(entry), entry)
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
  flushOutbox().then(({ pending }) => {
    if (pending === 0) load()
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
// Emits null if it doesn't exist anywhere. The event matters: every event has
// a "Q1", so match + team alone can pick up another event's entry.
export function subscribeScoutEntry(
  userId: string | null,
  eventCode: string,
  matchId: string,
  teamNumber: string,
  onChange: (entry: MatchScoutEntry | null) => void,
  onError?: (err: Error) => void,
  observationKey?: string
) {
  return subscribeScoutEntries(
    userId,
    (entries) =>
      onChange(
        entries.find(
          (e) =>
            entryEventCode(e) === eventCode && e.matchId === matchId && e.teamNumber === teamNumber &&
            (!observationKey || (e.observationKey ?? e.scoutedBy ?? 'legacy') === observationKey)
        ) ?? null
      ),
    onError
  )
}

// One-time fetch used by the scout form's Edit deep-link when this device has
// no local copy — e.g. editing an entry another scout submitted.
export async function fetchScoutEntry(
  userId: string | null,
  eventCode: string,
  matchId: string,
  teamNumber: string,
  observationKey = userId ?? 'legacy'
): Promise<MatchScoutEntry | null> {
  const queued = pendingEntries()
  // The latest backup may be under an intermediate match/team identity from
  // an older build. Search this user's backups, then match their resolved
  // original target instead of losing the latest unsynced correction.
  const backups = userId
    ? Taro.getStorageInfoSync().keys
      .filter((key) => key.startsWith(`backup:${userId}:`))
      .map((key) => Taro.getStorageSync(key) as MatchScoutEntry)
      .filter(Boolean)
    : []
  const local = userId
    ? [
      ...queued.filter((candidate) => candidate.pendingSyncOperation === 'update'),
      ...backups,
      Taro.getStorageSync(scoutBackupKey(userId, eventCode, matchId, teamNumber, observationKey)),
      Taro.getStorageSync(scoutEntryStorageKey(userId, eventCode, matchId, teamNumber, observationKey)),
      // Read through pre-identity local records without ever applying them to
      // a different observation.
      Taro.getStorageSync(scoutBackupKey(userId, eventCode, matchId, teamNumber)),
      Taro.getStorageSync(scoutEntryStorageKey(userId, eventCode, matchId, teamNumber))
    ]
      .filter((candidate): candidate is MatchScoutEntry => Boolean(candidate))
      .filter((candidate) => {
        const target = originalQueuedTarget(candidate, queued).editTarget
        const currentMatches = entryEventCode(candidate) === eventCode && candidate.matchId === matchId &&
          candidate.teamNumber === teamNumber &&
          (candidate.observationKey ?? candidate.scoutedBy ?? 'legacy') === observationKey
        return currentMatches || Boolean(target && target.eventCode === eventCode &&
          target.matchId === matchId && target.teamNumber === teamNumber &&
          target.observationKey === observationKey)
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    : undefined
  const resolvedLocal = local ? originalQueuedTarget(local, queued) : undefined

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select('*')
        .eq('event_code', eventCode)
        .eq('match_id', matchId)
        .eq('team_number', teamNumber)
        .eq('observation_key', observationKey)
        .order('updated_at', { ascending: false })
        .limit(1)
    )
    if (error || !data || data.length === 0) return resolvedLocal ?? null
    const remote = toEntry(data[0] as Row)
    return resolvedLocal && resolvedLocal.updatedAt > remote.updatedAt ? resolvedLocal : remote
  } catch {
    // Offline edits can resume only from a cache with the exact same identity.
    return resolvedLocal ?? null
  }
}
