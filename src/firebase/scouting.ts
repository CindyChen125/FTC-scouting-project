import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore'
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

// One-time fetch of a submitted entry — used by the scout form's Edit
// deep-link to fall back to the shared copy when this device has no local
// backup for it (e.g. editing an entry another scout submitted).
export async function fetchScoutEntry(matchId: string, teamNumber: string): Promise<MatchScoutEntry | null> {
  const snap = await getDoc(doc(db, COLLECTION, docId(matchId, teamNumber)))
  return snap.exists() ? (snap.data() as MatchScoutEntry) : null
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

// Live-subscribes to one submitted entry (for the read-only detail view).
// Fires with null if it doesn't exist (or gets deleted while viewing).
export function subscribeScoutEntry(
  matchId: string,
  teamNumber: string,
  onChange: (entry: MatchScoutEntry | null) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    doc(db, COLLECTION, docId(matchId, teamNumber)),
    (snap) => onChange(snap.exists() ? (snap.data() as MatchScoutEntry) : null),
    (err) => onError?.(err)
  )
}
