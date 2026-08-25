import Taro from '@tarojs/taro'
import { MatchScoutEntry } from '../types/scouting'

const OUTBOX_KEY = 'outbox'

// Submissions that haven't reached Supabase yet, keyed by entry identity so
// re-submitting the same match+team replaces the pending copy instead of
// queuing a duplicate. supabase-js has no built-in offline queue (unlike
// Firestore's persistentLocalCache), so scouts entering data with no signal
// at a venue depend on this.
type Outbox = Record<string, MatchScoutEntry>

export const outboxKey = (entry: MatchScoutEntry) =>
  `${entry.eventCode ?? ''}:${entry.matchId}:${entry.teamNumber}`

const readOutbox = (): Outbox => {
  try {
    return (Taro.getStorageSync(OUTBOX_KEY) as Outbox) || {}
  } catch {
    return {}
  }
}

const writeOutbox = (outbox: Outbox) => {
  Taro.setStorageSync(OUTBOX_KEY, outbox)
}

export function enqueue(entry: MatchScoutEntry) {
  const outbox = readOutbox()
  outbox[outboxKey(entry)] = entry
  writeOutbox(outbox)
}

export function dequeue(entry: MatchScoutEntry) {
  const outbox = readOutbox()
  delete outbox[outboxKey(entry)]
  writeOutbox(outbox)
}

export function pendingEntries(): MatchScoutEntry[] {
  return Object.values(readOutbox())
}

export function pendingCount(): number {
  return Object.keys(readOutbox()).length
}
