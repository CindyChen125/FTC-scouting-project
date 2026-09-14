import Taro from '@tarojs/taro'
import { supabase } from './config'
import { PitData, PitEntry, pitEntryKeyPrefix, pitEntryStorageKey } from '../types/pit'
import { withTimeout, isPermanentRejection } from './timeout'
import { createOutbox } from './outbox'
import type { SubmitOutcome } from './scouting'

// Pit profiles sync the same way match entries do (see scouting.ts): local
// copy first, shared table second, an outbox for no-signal venues, and a
// realtime subscription so every scout sees the same list.

const TABLE = 'pit_entries'

type Row = {
  event_code: string
  team_number: string
  data: PitData
  scout_name: string
  scouted_by: string | null
  last_edited_by: string | null
  updated_at: number
}

const toRow = (entry: PitEntry): Row => ({
  event_code: entry.eventCode,
  team_number: entry.teamNumber,
  data: entry.data,
  scout_name: entry.scoutName ?? '',
  scouted_by: entry.scoutedBy ?? null,
  last_edited_by: entry.lastEditedBy ?? null,
  updated_at: entry.updatedAt
})

const toEntry = (row: Row): PitEntry => ({
  eventCode: row.event_code,
  teamNumber: row.team_number,
  data: row.data,
  scoutName: row.scout_name ?? '',
  scoutedBy: row.scouted_by,
  lastEditedBy: row.last_edited_by,
  updatedAt: Number(row.updated_at)
})

const keyOf = (entry: PitEntry) => `${entry.eventCode}:${entry.teamNumber}`

const outbox = createOutbox<PitEntry>('pitOutbox', keyOf)

let channelSeq = 0

const push = (entry: PitEntry) =>
  withTimeout(supabase.from(TABLE).upsert(toRow(entry), { onConflict: 'event_code,team_number' }))

export async function submitPitEntry(entry: PitEntry): Promise<SubmitOutcome> {
  try {
    const { error } = await push(entry)
    if (error) throw error
    outbox.dequeue(entry)
    return 'synced'
  } catch (err) {
    if (isPermanentRejection(err)) {
      outbox.dequeue(entry)
      return 'rejected'
    }
    outbox.enqueue(entry)
    return 'queued'
  }
}

async function flushPitOutbox(): Promise<number> {
  for (const entry of outbox.pending()) {
    try {
      const { error } = await push(entry)
      if (error) throw error
      outbox.dequeue(entry)
    } catch (err) {
      if (isPermanentRejection(err)) {
        outbox.dequeue(entry)
        continue
      }
      break
    }
  }
  return outbox.count()
}

export const pendingPitCount = outbox.count

function localPitEntries(userId: string | null): PitEntry[] {
  if (!userId) return []
  const prefix = pitEntryKeyPrefix(userId)
  const { keys } = Taro.getStorageInfoSync()
  return keys
    .filter((key) => key.startsWith(prefix))
    .map((key) => Taro.getStorageSync(key) as PitEntry)
    .filter(Boolean)
}

// Remote rows win over local copies unless the local one is newer (still queued).
function mergeEntries(remote: PitEntry[], userId: string | null): PitEntry[] {
  const byKey = new Map<string, PitEntry>()
  for (const entry of localPitEntries(userId)) byKey.set(keyOf(entry), entry)
  for (const entry of remote) {
    const local = byKey.get(keyOf(entry))
    if (!local || entry.updatedAt >= local.updatedAt) byKey.set(keyOf(entry), entry)
  }
  return [...byKey.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function subscribePitEntries(
  userId: string | null,
  onChange: (entries: PitEntry[]) => void,
  onError?: (err: Error) => void
) {
  let remote: PitEntry[] = []
  let active = true

  const emit = () => {
    if (active) onChange(mergeEntries(remote, userId))
  }

  const load = async () => {
    try {
      const { data, error } = await withTimeout(
        supabase.from(TABLE).select('*').order('updated_at', { ascending: false })
      )
      if (!active) return
      if (error) throw error
      remote = (data as Row[]).map(toEntry)
      emit()
    } catch (err) {
      if (!active) return
      emit()
      onError?.(err as Error)
    }
  }

  flushPitOutbox().then((stillPending) => {
    if (stillPending === 0) load()
  })

  emit()
  load()

  // Unique channel name per subscription — see subscribeScoutEntries.
  const channel = supabase
    .channel(`pit_entries_${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, () => load())
    .subscribe()

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

export async function fetchPitEntry(
  userId: string | null,
  eventCode: string,
  teamNumber: string
): Promise<PitEntry | null> {
  if (userId) {
    const local = Taro.getStorageSync(pitEntryStorageKey(userId, eventCode, teamNumber))
    if (local) return local as PitEntry
  }

  try {
    const { data, error } = await withTimeout(
      supabase
        .from(TABLE)
        .select('*')
        .eq('event_code', eventCode)
        .eq('team_number', teamNumber)
        .limit(1)
    )
    if (error || !data || data.length === 0) return null
    return toEntry(data[0] as Row)
  } catch {
    return null
  }
}
