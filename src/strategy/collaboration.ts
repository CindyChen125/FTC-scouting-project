import { StrategyBoard } from './annotations'
import { StrategyTimeline, normalizeTimeline } from './timeline'

export type StrategySnapshot = { board: StrategyBoard; timeline: StrategyTimeline }
export type ObjectKind = 'robot' | 'annotation' | 'waypoint'
export interface StrategyObjectPatch {
  key: string
  kind: ObjectKind
  phase: 'auto' | 'teleop'
  robotId: string | null
  objectId: string
  value: Record<string, unknown> | null
}
export interface StrategyObjectOverride extends StrategyObjectPatch {
  strategyId: string
  revision: number
}

const objectKey = (kind: ObjectKind, phase: string, objectId: string, robotId?: string) =>
  [kind, phase, ...(robotId ? [robotId] : []), objectId].join(':')

export const objectsOf = (snapshot: StrategySnapshot): Map<string, StrategyObjectPatch> => {
  const objects = new Map<string, StrategyObjectPatch>()
  for (const phase of ['auto', 'teleop'] as const) {
    for (const robot of snapshot.board[phase].robots) {
      const patch: StrategyObjectPatch = { key: objectKey('robot', phase, robot.id), kind: 'robot',
        phase, robotId: null, objectId: robot.id, value: robot as unknown as Record<string, unknown> }
      objects.set(patch.key, patch)
    }
    for (const annotation of snapshot.board[phase].annotations) {
      const patch: StrategyObjectPatch = { key: objectKey('annotation', phase, annotation.id), kind: 'annotation',
        phase, robotId: null, objectId: annotation.id, value: annotation as unknown as Record<string, unknown> }
      objects.set(patch.key, patch)
    }
    for (const [robotId, route] of Object.entries(snapshot.timeline[phase])) for (const waypoint of route) {
      const patch: StrategyObjectPatch = { key: objectKey('waypoint', phase, waypoint.id, robotId), kind: 'waypoint',
        phase, robotId, objectId: waypoint.id, value: waypoint as unknown as Record<string, unknown> }
      objects.set(patch.key, patch)
    }
  }
  return objects
}

export const diffObjects = (before: StrategySnapshot, after: StrategySnapshot): StrategyObjectPatch[] => {
  const old = objectsOf(before)
  const next = objectsOf(after)
  const keys = new Set([...old.keys(), ...next.keys()])
  return [...keys].filter((key) => JSON.stringify(old.get(key)?.value) !== JSON.stringify(next.get(key)?.value))
    .map((key) => next.get(key) ?? { ...old.get(key)!, value: null })
}

export const applyObjectPatch = (snapshot: StrategySnapshot, patch: StrategyObjectPatch): StrategySnapshot => {
  const { phase, objectId, value } = patch
  if (patch.kind === 'robot') {
    if (!value) return snapshot
    return { ...snapshot, board: { ...snapshot.board,
      [phase]: { ...snapshot.board[phase], robots: snapshot.board[phase].robots.map((robot) =>
        robot.id === objectId ? value as unknown as typeof robot : robot) } } }
  }
  if (patch.kind === 'annotation') {
    const current = [...snapshot.board[phase].annotations]
    const index = current.findIndex((item) => item.id === objectId)
    if (index >= 0 && value) current[index] = value as unknown as typeof current[number]
    else if (index >= 0) current.splice(index, 1)
    else if (value) current.push(value as unknown as typeof current[number])
    return { ...snapshot, board: { ...snapshot.board,
      [phase]: { ...snapshot.board[phase], annotations: current } } }
  }
  const robotId = patch.robotId as keyof StrategyTimeline['auto']
  if (!robotId || !snapshot.timeline[phase][robotId]) return snapshot
  const current = snapshot.timeline[phase][robotId].filter((item) => item.id !== objectId)
  if (value) current.push(value as unknown as typeof current[number])
  current.sort((a, b) => a.at - b.at)
  return { ...snapshot, timeline: { ...snapshot.timeline,
    [phase]: { ...snapshot.timeline[phase], [robotId]: current } } }
}

export const applyObjectOverrides = (snapshot: StrategySnapshot,
  overrides: StrategyObjectOverride[]): StrategySnapshot => overrides.reduce(applyObjectPatch, snapshot)

export const mergeSnapshots = (base: StrategySnapshot, local: StrategySnapshot,
  remote: StrategySnapshot): { snapshot: StrategySnapshot; conflicts: string[] } => {
  const localChanges = diffObjects(base, local)
  const remoteChanges = new Set(diffObjects(base, remote).map((patch) => patch.key))
  const remoteObjects = objectsOf(remote)
  const conflicts: string[] = []
  let merged = remote
  for (const patch of localChanges) {
    if (remoteChanges.has(patch.key) && JSON.stringify(remoteObjects.get(patch.key)?.value ?? null) !== JSON.stringify(patch.value)) {
      conflicts.push(patch.key)
    }
    merged = applyObjectPatch(merged, patch)
  }
  return { snapshot: { ...merged, timeline: normalizeTimeline(merged.timeline) }, conflicts }
}
