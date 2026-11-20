import { useEffect, useRef, useState } from 'react'
import { StrategyRecord } from './strategyRecord'
import { StrategyObjectPatch, StrategySnapshot, applyObjectPatch, diffObjects, mergeSnapshots } from './collaboration'
import { applyStrategyObjectPatch, getStrategy } from '../supabase/strategies'
import { StrategyParticipant, leaveStrategyRoom, listStrategyParticipants,
  subscribeStrategyRoom, updateStrategyPresence } from '../supabase/strategyRoom'
import { safeErrorMessage } from '../supabase/timeout'
import { cacheStrategy, clearPendingRoom, readPendingRoom, savePendingRoom } from './offlineStrategy'

export type RoomStatus = 'idle' | 'connecting' | 'live' | 'syncing' | 'offline' | 'conflict' | 'error'
type ApplyRemote = (snapshot: StrategySnapshot, remote: StrategyRecord, previous: StrategyRecord | null) => void

const newSessionId = () => globalThis.crypto?.randomUUID?.() ??
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (part) => {
    const value = Math.floor(Math.random() * 16)
    return (part === 'x' ? value : (value & 3) | 8).toString(16)
  })

export function useStrategyRoom(record: StrategyRecord | null, userId: string | null,
  displayName: string, getLocal: () => StrategySnapshot, applyRemote: ApplyRemote,
  onRecord: (record: StrategyRecord) => void) {
  const [status, setStatus] = useState<RoomStatus>('idle')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)
  const [participants, setParticipants] = useState<StrategyParticipant[]>([])
  const [conflicts, setConflicts] = useState<string[]>([])
  const conflictsRef = useRef<string[]>([])
  const setConflictKeys = (keys: string[]) => { conflictsRef.current = keys; setConflicts(keys) }
  const sessionId = useRef(newSessionId())
  const recordRef = useRef(record)
  const baseRef = useRef<StrategySnapshot | null>(null)
  const versionsRef = useRef<Record<string, number>>({})
  const queueRef = useRef<StrategyObjectPatch[]>([])
  const flushingRef = useRef(false)
  const refreshSequenceRef = useRef(0)
  const editingRef = useRef<string | null>(null)
  const displayNameRef = useRef(displayName)
  const callbacks = useRef({ getLocal, applyRemote, onRecord })
  recordRef.current = record
  displayNameRef.current = displayName
  callbacks.current = { getLocal, applyRemote, onRecord }

  const persist = (id: string) => {
    if (!userId) return
    if (!queueRef.current.length && !conflictsRef.current.length) { clearPendingRoom(userId, id); return }
    if (baseRef.current && !savePendingRoom(userId, id, {
      base: baseRef.current, versions: versionsRef.current,
      queue: queueRef.current, conflicts: conflictsRef.current
    })) setError('Local storage failed; keep this page open until edits sync.')
  }

  const refreshParticipants = async (id: string) => {
    try { setParticipants(await listStrategyParticipants(id)) }
    catch (problem) { setError(safeErrorMessage(problem)) }
  }

  const refresh = async (id: string) => {
    if (flushingRef.current || recordRef.current?.id !== id) return
    const sequence = ++refreshSequenceRef.current
    try {
      const remote = await getStrategy(id)
      if (recordRef.current?.id !== id || sequence !== refreshSequenceRef.current || flushingRef.current) return
      if (userId) cacheStrategy(userId, remote)
      const previous = recordRef.current
      const base = baseRef.current ?? { board: previous.board, timeline: previous.timeline as StrategySnapshot['timeline'] }
      const merged = mergeSnapshots(base, callbacks.current.getLocal(),
        { board: remote.board, timeline: remote.timeline as StrategySnapshot['timeline'] })
      baseRef.current = { board: remote.board, timeline: remote.timeline as StrategySnapshot['timeline'] }
      versionsRef.current = remote.objectRevisions
      if (merged.conflicts.length) {
        const localPatches = diffObjects(base, callbacks.current.getLocal())
        for (const key of merged.conflicts) {
          const patch = localPatches.find((item) => item.key === key)
          if (patch && !queueRef.current.some((item) => item.key === key)) queueRef.current.push(patch)
        }
        setPending(queueRef.current.length)
        setConflictKeys(merged.conflicts)
        setStatus('conflict')
      } else if (conflictsRef.current.length) setStatus('conflict')
      else if (queueRef.current.length) setStatus('syncing')
      else { setConflictKeys([]); setStatus('live') }
      setError('')
      persist(id)
      if (JSON.stringify(merged.snapshot) !== JSON.stringify(callbacks.current.getLocal()) ||
        remote.revision !== previous.revision) callbacks.current.applyRemote(merged.snapshot, remote, previous)
      if (JSON.stringify(remote.objectRevisions) !== JSON.stringify(previous.objectRevisions) ||
        remote.revision !== previous.revision) callbacks.current.onRecord(remote)
    } catch (problem) {
      if (sequence === refreshSequenceRef.current && recordRef.current?.id === id) {
        setStatus('offline'); setError(safeErrorMessage(problem))
      }
    }
  }

  const flush = async () => {
    const id = recordRef.current?.id
    if (!id || flushingRef.current || conflictsRef.current.length) return
    flushingRef.current = true
    refreshSequenceRef.current++
    setStatus('syncing')
    try {
      while (queueRef.current.length && recordRef.current?.id === id) {
        const patch = queueRef.current[0]
        try {
          const saved = await applyStrategyObjectPatch(id, patch, versionsRef.current[patch.key] ?? 0)
          versionsRef.current = { ...versionsRef.current, [patch.key]: saved.revision }
          if (baseRef.current) baseRef.current = applyObjectPatch(baseRef.current, patch)
          queueRef.current.shift()
          setPending(queueRef.current.length)
          persist(id)
        } catch (problem) {
          const code = (problem as { code?: string })?.code
          if (code === '40001' || code === '23505') {
            const remote = await getStrategy(id)
            if (recordRef.current?.id !== id) return
            const base = baseRef.current ?? { board: recordRef.current.board,
              timeline: recordRef.current.timeline as StrategySnapshot['timeline'] }
            const merged = mergeSnapshots(base, callbacks.current.getLocal(),
              { board: remote.board, timeline: remote.timeline as StrategySnapshot['timeline'] })
            baseRef.current = { board: remote.board, timeline: remote.timeline as StrategySnapshot['timeline'] }
            versionsRef.current = remote.objectRevisions
            callbacks.current.applyRemote(merged.snapshot, remote, recordRef.current)
            callbacks.current.onRecord(remote)
            setConflictKeys(merged.conflicts.length ? merged.conflicts : [patch.key])
            setStatus('conflict')
            persist(id)
          } else {
            setStatus(code === '42501' ? 'error' : 'offline')
            setError(safeErrorMessage(problem))
          }
          return
        }
      }
      setStatus('live')
    } finally {
      flushingRef.current = false
      if (recordRef.current?.id === id && !queueRef.current.length) refresh(id)
    }
  }

  const queueChanges = (before: StrategySnapshot, after: StrategySnapshot) => {
    if (!recordRef.current?.id || recordRef.current.id.startsWith('local-')) return
    const changes = diffObjects(before, after)
    for (const patch of changes) {
      const index = queueRef.current.findIndex((item, position) =>
        item.key === patch.key && !(flushingRef.current && position === 0))
      if (index >= 0) queueRef.current[index] = patch
      else queueRef.current.push(patch)
    }
    setPending(queueRef.current.length)
    persist(recordRef.current.id)
    if (changes.length) flush()
  }

  const setEditing = (key: string | null) => {
    if (editingRef.current === key) return
    editingRef.current = key
    const id = recordRef.current?.id
    if (id && userId && !id.startsWith('local-')) updateStrategyPresence(id, userId, sessionId.current, displayNameRef.current, key).catch(() => {})
  }

  const resolveMine = () => {
    setConflictKeys([])
    if (recordRef.current) persist(recordRef.current.id)
    setStatus('syncing'); flush()
  }
  const resolveTheirs = () => {
    const id = recordRef.current?.id
    if (!id || !baseRef.current) return
    queueRef.current = queueRef.current.filter((patch) => !conflictsRef.current.includes(patch.key))
    setPending(queueRef.current.length)
    setConflictKeys([])
    persist(id)
    const resolved = queueRef.current.reduce(applyObjectPatch, baseRef.current)
    callbacks.current.applyRemote(resolved, recordRef.current!, recordRef.current)
    setStatus(queueRef.current.length ? 'syncing' : 'live')
    if (queueRef.current.length) flush()
  }

  useEffect(() => {
    const id = record?.id
    if (!id || !userId || id.startsWith('local-')) { setStatus('idle'); setParticipants([]); return }
    const saved = readPendingRoom(userId, id)
    baseRef.current = saved?.base ?? { board: record.board, timeline: record.timeline as StrategySnapshot['timeline'] }
    versionsRef.current = saved?.versions ?? record.objectRevisions ?? {}
    queueRef.current = saved?.queue ?? []
    setPending(queueRef.current.length)
    setConflictKeys(saved?.conflicts ?? [])
    setStatus(saved?.conflicts?.length ? 'conflict' : 'connecting')
    const updatePresence = () => updateStrategyPresence(id, userId, sessionId.current,
      displayNameRef.current, editingRef.current).catch((problem) => setError(safeErrorMessage(problem)))
    updatePresence()
    refreshParticipants(id)
    refresh(id).then(() => flush())
    const unsubscribe = subscribeStrategyRoom(id, () => refresh(id), () => refresh(id), () => refreshParticipants(id))
    const timer = setInterval(() => { updatePresence(); refreshParticipants(id); refresh(id); flush() }, 10000)
    const reconnect = () => { refresh(id).then(() => flush()); refreshParticipants(id) }
    if (typeof window !== 'undefined') window.addEventListener('online', reconnect)
    return () => {
      clearInterval(timer)
      if (typeof window !== 'undefined') window.removeEventListener('online', reconnect)
      unsubscribe()
      leaveStrategyRoom(id, userId, sessionId.current).catch(() => {})
    }
  }, [record?.id, userId])

  return { status, error, pending, participants, conflicts, queueChanges, setEditing, resolveMine, resolveTheirs }
}
