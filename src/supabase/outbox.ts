import Taro from '@tarojs/taro'
import { MatchScoutEntry } from '../types/scouting'
import { reportDevelopmentError } from './timeout'

// Submissions that haven't reached Supabase yet, keyed by entry identity so
// re-submitting the same entry replaces the pending copy instead of queuing a
// duplicate. supabase-js has no built-in offline queue (unlike Firestore's
// persistentLocalCache), so scouts entering data with no signal at a venue
// depend on this.
export function createOutbox<T>(storageKey: string, keyOf: (item: T) => string) {
  const read = (): Record<string, T> => {
    const stored = Taro.getStorageSync(storageKey) as Record<string, T> | undefined
    if (!stored) return {}
    if (typeof stored !== 'object' || Array.isArray(stored)) {
      throw new Error('Stored synchronization queue is unreadable')
    }
    return Object.fromEntries(Object.values(stored).map((item) => [keyOf(item), item]))
  }

  const write = (outbox: Record<string, T>) => {
    Taro.setStorageSync(storageKey, outbox)
  }

  const inspect = (): Record<string, T> => {
    try {
      return read()
    } catch (error) {
      // Counts and status rendering must not crash the app. Mutations below
      // still use strict read(), so unreadable queued data is never replaced.
      reportDevelopmentError('sync-queue:read', error)
      return {}
    }
  }

  return {
    enqueue(item: T) {
      const outbox = read()
      outbox[keyOf(item)] = item
      write(outbox)
    },
    dequeue(item: T) {
      const outbox = read()
      delete outbox[keyOf(item)]
      write(outbox)
    },
    pending: (): T[] => Object.values(inspect()),
    count: (): number => Object.keys(inspect()).length
  }
}

// The key deliberately keeps '' for entries without an eventCode: changing it
// would strand anything already queued under the old key.
export const outboxKey = (entry: MatchScoutEntry) =>
  `${entry.eventCode ?? ''}:${entry.matchId}:${entry.teamNumber}:${entry.observationKey ?? entry.scoutedBy ?? 'legacy'}`

const matchOutbox = createOutbox<MatchScoutEntry>('outbox', outboxKey)

export const enqueue = matchOutbox.enqueue
export const dequeue = matchOutbox.dequeue
export const pendingEntries = matchOutbox.pending
export const pendingCount = matchOutbox.count
