import { FRAME, FIELD_IN, FieldRobot, RobotId, clamp, normalizeHeading } from './fieldGeometry'
import { FieldPoint, StrategyPhase } from './annotations'

export interface Waypoint extends FieldPoint {
  id: string
  at: number
  heading: number
}
export type RobotRoutes = Record<RobotId, Waypoint[]>
export type StrategyTimeline = Record<StrategyPhase, RobotRoutes>
export type WarningKind = 'robot' | 'boundary' | 'obstacle'
export interface TimelineWarning {
  key: string
  kind: WarningKind
  robots: RobotId[]
  at: number
}
export const ROBOT_IDS: RobotId[] = ['red1', 'red2', 'blue1', 'blue2']
const emptyRoutes = (): RobotRoutes => ({ red1: [], red2: [], blue1: [], blue2: [] })
export const emptyTimeline = (): StrategyTimeline => ({ auto: emptyRoutes(), teleop: emptyRoutes() })

export const normalizeTimeline = (value: unknown): StrategyTimeline => {
  const source = value && typeof value === 'object' ? value as Record<string, any> : {}
  const result = emptyTimeline()
  for (const phase of ['auto', 'teleop'] as const) for (const id of ROBOT_IDS) {
    const route = source[phase]?.[id]
    if (!Array.isArray(route)) continue
    const valid = route.filter((point): point is Waypoint =>
      point && typeof point.id === 'string' && Number.isFinite(point.x) && Number.isFinite(point.y) &&
      Number.isFinite(point.at) && Number.isFinite(point.heading))
      .map((point) => ({ id: point.id, x: point.x, y: point.y,
        at: point.at, heading: normalizeHeading(point.heading) }))
      .sort((a, b) => a.at - b.at)
    let previous = 0
    result[phase][id] = valid.map((point) => {
      const at = clamp(Math.max(point.at, previous + 0.1), 0.1, 600)
      previous = at
      return { ...point, at }
    }).filter((point, index, list) => index === 0 || point.at > list[index - 1].at)
  }
  return result
}

export const durationForPhase = (routes: RobotRoutes): number => Math.max(15,
  ...ROBOT_IDS.map((id) => routes[id]?.[routes[id].length - 1]?.at ?? 0))

export const addWaypoint = (routes: RobotRoutes, robot: FieldRobot, point: FieldPoint,
  currentTime: number, id: string): RobotRoutes => {
  const existing = routes[robot.id] ?? []
  const last = existing[existing.length - 1]
  const at = Math.min(600, Math.max((last?.at ?? 0) + 1, Math.round(currentTime + 5)))
  if (last?.at === 600) return routes
  const heading = last?.heading ?? robot.heading
  return { ...routes, [robot.id]: [...existing, { id, x: point.x, y: point.y, at, heading }] }
}

export const changeWaypoint = (routes: RobotRoutes, robotId: RobotId, id: string,
  patch: Partial<Omit<Waypoint, 'id'>>): RobotRoutes => {
  const existing = routes[robotId] ?? []
  const index = existing.findIndex((point) => point.id === id)
  if (index < 0) return routes
  const previous = existing[index - 1]?.at ?? 0
  const following = existing[index + 1]?.at ?? 601
  const adjustedTime = Number.isFinite(patch.at) && following - previous > 0.2
    ? clamp(patch.at!, previous + 0.1, following - 0.1) : existing[index].at
  return { ...routes, [robotId]: existing.map((point) => point.id === id ? {
    ...point,
    x: Number.isFinite(patch.x) ? clamp(patch.x!, -24, FIELD_IN + 24) : point.x,
    y: Number.isFinite(patch.y) ? clamp(patch.y!, -24, FIELD_IN + 24) : point.y,
    at: adjustedTime,
    heading: Number.isFinite(patch.heading) ? normalizeHeading(patch.heading!) : point.heading
  } : point) }
}

export const reorderWaypoint = (routes: RobotRoutes, robotId: RobotId, id: string, direction: -1 | 1): RobotRoutes => {
  const existing = routes[robotId] ?? []
  const index = existing.findIndex((point) => point.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= existing.length) return routes
  const times = existing.map((point) => point.at)
  const reordered = [...existing]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  return { ...routes, [robotId]: reordered.map((point, i) => ({ ...point, at: times[i] })) }
}

export const removeWaypoint = (routes: RobotRoutes, robotId: RobotId, id: string): RobotRoutes => ({
  ...routes, [robotId]: (routes[robotId] ?? []).filter((point) => point.id !== id)
})

const headingBetween = (start: number, end: number, fraction: number) =>
  normalizeHeading(start + (((end - start + 540) % 360) - 180) * fraction)

export const robotAtTime = (robot: FieldRobot, waypoints: Waypoint[], time: number): FieldRobot => {
  if (!waypoints.length || time <= 0) return robot
  let previous = { x: robot.x, y: robot.y, heading: robot.heading, at: 0 }
  for (const point of waypoints) {
    if (time <= point.at) {
      const fraction = clamp((time - previous.at) / (point.at - previous.at), 0, 1)
      return { ...robot, x: previous.x + (point.x - previous.x) * fraction,
        y: previous.y + (point.y - previous.y) * fraction,
        heading: headingBetween(previous.heading, point.heading, fraction) }
    }
    previous = point
  }
  return { ...robot, x: previous.x, y: previous.y, heading: previous.heading }
}

export const robotsAtTime = (robots: FieldRobot[], routes: RobotRoutes, time: number): FieldRobot[] =>
  robots.map((robot) => robotAtTime(robot, routes[robot.id] ?? [], time))

type Corner = FieldPoint
const corners = (robot: Pick<FieldRobot, 'x' | 'y' | 'width' | 'length' | 'heading'>): Corner[] => {
  const radians = robot.heading * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({
    x: robot.x + sx * robot.width / 2 * cosine - sy * robot.length / 2 * sine,
    y: robot.y + sx * robot.width / 2 * sine + sy * robot.length / 2 * cosine
  }))
}
const frameCorners: Corner[] = [
  { x: FRAME.x, y: FRAME.y }, { x: FRAME.x + FRAME.width, y: FRAME.y },
  { x: FRAME.x + FRAME.width, y: FRAME.y + FRAME.height }, { x: FRAME.x, y: FRAME.y + FRAME.height }
]
const axes = (shape: Corner[]) => shape.map((point, index) => {
  const next = shape[(index + 1) % shape.length]
  return { x: -(next.y - point.y), y: next.x - point.x }
})
const overlap = (first: Corner[], second: Corner[]): boolean => axes(first).concat(axes(second)).every((axis) => {
  const a = first.map((point) => point.x * axis.x + point.y * axis.y)
  const b = second.map((point) => point.x * axis.x + point.y * axis.y)
  return Math.max(...a) > Math.min(...b) + 1e-7 && Math.max(...b) > Math.min(...a) + 1e-7
})

export const warningsAtTime = (robots: FieldRobot[], routes: RobotRoutes, time: number): TimelineWarning[] => {
  const poses = robotsAtTime(robots, routes, time)
  const footprints = poses.map(corners)
  const warnings: TimelineWarning[] = []
  poses.forEach((robot, index) => {
    if (footprints[index].some((point) => point.x < -1e-7 || point.y < -1e-7 ||
      point.x > FIELD_IN + 1e-7 || point.y > FIELD_IN + 1e-7)) {
      warnings.push({ key: `boundary:${robot.id}`, kind: 'boundary', robots: [robot.id], at: time })
    }
    if (overlap(footprints[index], frameCorners)) {
      warnings.push({ key: `obstacle:${robot.id}`, kind: 'obstacle', robots: [robot.id], at: time })
    }
    for (let other = index + 1; other < poses.length; other++) {
      if (overlap(footprints[index], footprints[other])) warnings.push({
        key: `robot:${robot.id}:${poses[other].id}`, kind: 'robot', robots: [robot.id, poses[other].id], at: time
      })
    }
  })
  return warnings
}

export const analyzeTimeline = (robots: FieldRobot[], routes: RobotRoutes): TimelineWarning[] => {
  const first = new Map<string, TimelineWarning>()
  const duration = durationForPhase(routes)
  const times = new Set<number>([duration])
  for (let time = 0; time < duration; time += 0.25) times.add(time)
  for (const id of ROBOT_IDS) for (const point of routes[id] ?? []) times.add(point.at)
  for (const time of [...times].sort((a, b) => a - b)) {
    for (const warning of warningsAtTime(robots, routes, time)) {
      if (!first.has(warning.key)) first.set(warning.key, warning)
    }
  }
  return [...first.values()].sort((a, b) => a.at - b.at || a.key.localeCompare(b.key))
}
