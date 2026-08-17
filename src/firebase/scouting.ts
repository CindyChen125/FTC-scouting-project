import { collection, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore'
import { db } from './config'
import { MatchScoutEntry } from '../types/scouting'

const COLLECTION = 'scoutEntries'

const docId = (matchId: string, teamNumber: string) => `${matchId}_${teamNumber}`

// Writes a submitted entry to the shared collection. Thanks to persistentLocalCache
// (see config.ts), this resolves immediately from the local queue even with no
// signal — the actual network write happens automatically once back online.
export function submitScoutEntry(entry: MatchScoutEntry) {
  return setDoc(doc(db, COLLECTION, docId(entry.matchId, entry.teamNumber)), entry)
}

// Live-subscribes to every submitted entry across all scouts/devices. Returns
// an unsubscribe function. Fires immediately from cache, then again whenever
// this device or any other scout's submission changes.
export function subscribeScoutEntries(
  onChange: (entries: MatchScoutEntry[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'))
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => d.data() as MatchScoutEntry)),
    (err) => onError?.(err)
  )
}
