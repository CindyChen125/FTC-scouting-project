import Taro from '@tarojs/taro'
import { StrategySnapshot, StrategyObjectPatch } from './collaboration'
import { StrategyDetails, StrategyDraft, StrategyRecord } from './strategyRecord'

export interface StrategyWorkspace {
  recordId: string | null
  details: StrategyDetails
  snapshot: StrategySnapshot
  savedAt: string
}

export interface PendingRoomState {
  base: StrategySnapshot
  versions: Record<string, number>
  queue: StrategyObjectPatch[]
  conflicts: string[]
}

export interface PendingScenarioSave {
  recordId: string
  baseRevision: number
  draft: StrategyDraft
  sourceStrategyId?: string | null
  savedAt: string
}

const key = (userId: string, name: string) => `strategy:v1:${userId}:${name}`
const read = <T,>(storageKey: string): T | null => {
  try { return (Taro.getStorageSync(storageKey) || null) as T | null } catch { return null }
}
const write = (storageKey: string, value: unknown) => {
  try { Taro.setStorageSync(storageKey, value); return true } catch { return false }
}

export const readCachedStrategies = (userId: string): StrategyRecord[] =>
  read<StrategyRecord[]>(key(userId, 'scenarios')) ?? []

export const cacheStrategies = (userId: string, records: StrategyRecord[]): boolean => {
  const prior = readCachedStrategies(userId)
  const pendingIds = new Set(readPendingSaves(userId).map((item) => item.recordId))
  const byId = new Map(prior.filter((record) => readPendingRoom(userId, record.id) || pendingIds.has(record.id))
    .map((record) => [record.id, record]))
  records.forEach((record) => byId.set(record.id, record))
  return write(key(userId, 'scenarios'), [...byId.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)))
}

export const cacheStrategy = (userId: string, record: StrategyRecord): boolean =>
  write(key(userId, 'scenarios'), [record, ...readCachedStrategies(userId).filter((item) => item.id !== record.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))

export const cachedStrategy = (userId: string, id: string): StrategyRecord | null =>
  readCachedStrategies(userId).find((record) => record.id === id) ?? null

export const removeCachedStrategy = (userId: string, id: string): void => {
  write(key(userId, 'scenarios'), readCachedStrategies(userId).filter((record) => record.id !== id))
}

export const readWorkspace = (userId: string): StrategyWorkspace | null =>
  read<StrategyWorkspace>(key(userId, 'workspace'))

export const saveWorkspace = (userId: string, workspace: StrategyWorkspace): boolean =>
  write(key(userId, 'workspace'), workspace)

export const readPendingRoom = (userId: string, strategyId: string): PendingRoomState | null =>
  read<PendingRoomState>(key(userId, `room:${strategyId}`))

export const savePendingRoom = (userId: string, strategyId: string, state: PendingRoomState): boolean =>
  write(key(userId, `room:${strategyId}`), state)

export const clearPendingRoom = (userId: string, strategyId: string): void => {
  try { Taro.removeStorageSync(key(userId, `room:${strategyId}`)) } catch { /* storage unavailable */ }
}

export const readPendingSaves = (userId: string): PendingScenarioSave[] =>
  read<PendingScenarioSave[]>(key(userId, 'pending-saves')) ?? []

export const queuePendingSave = (userId: string, pending: PendingScenarioSave): boolean =>
  write(key(userId, 'pending-saves'), [...readPendingSaves(userId)
    .filter((item) => item.recordId !== pending.recordId), pending])

export const clearPendingSave = (userId: string, recordId: string): void => {
  write(key(userId, 'pending-saves'), readPendingSaves(userId).filter((item) => item.recordId !== recordId))
}
