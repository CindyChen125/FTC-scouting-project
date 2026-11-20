/** BIOBUZZ field coordinates in inches, origin at the scoring-side red corner.
 * X increases toward blue; Y increases toward the audience.
 * FIRST Competition Manual §9 (TU06) and Event Field Setup Guide V1.0.
 */
export const FIELD_IN = 144
export const TILE_IN = 24
export const ALLIANCE_AREA = { width: 54, height: 97, y: (FIELD_IN - 97) / 2 }
export const FRAME = { x: (FIELD_IN - 49.46) / 2, y: (FIELD_IN - 38.95) / 2, width: 49.46, height: 38.95 }
export const HIVE_CENTERS = { red: { x: 72 - 12.75, y: 72 }, blue: { x: 72 + 12.75, y: 72 } }
export const HIVE_CELL_WIDTH_IN = 20
export const HIVE_CELL_DEPTH_IN = 12
export const HIVE_CELL_CENTER_OFFSET_IN = (18.84 + HIVE_CELL_DEPTH_IN) / 2
export const FLOWERS = [
  { id: 'red-top', alliance: 'red', x: 48, y: 0 },
  { id: 'red-left', alliance: 'red', x: 0, y: 96 },
  { id: 'blue-right', alliance: 'blue', x: 144, y: 48 },
  { id: 'blue-bottom', alliance: 'blue', x: 96, y: 144 }
] as const
export const LOADING_ZONES = [
  { id: 'red', x: 0, y: 24, width: 11, height: 23 },
  { id: 'blue', x: 133, y: 97, width: 11, height: 23 }
] as const
export const GARDENS = [
  { id: 'red', x: 0, y: 142, width: 23, height: 2 },
  { id: 'blue', x: 121, y: 0, width: 23, height: 2 }
] as const

export type AllianceColor = 'red' | 'blue'
export type RobotId = 'red1' | 'red2' | 'blue1' | 'blue2'
export interface FieldRobot {
  id: RobotId
  alliance: AllianceColor
  number: string
  x: number
  y: number
  heading: number
  width: number
  length: number
  locked: boolean
}

/** Positions are editable planning defaults, not an official starting layout. */
export const initialRobots = (): FieldRobot[] => [
  { id: 'red1', alliance: 'red', number: 'R1', x: 8, y: 54, heading: 90, width: 16, length: 16, locked: false },
  { id: 'red2', alliance: 'red', number: 'R2', x: 8, y: 94, heading: 90, width: 16, length: 16, locked: false },
  { id: 'blue1', alliance: 'blue', number: 'B1', x: 136, y: 50, heading: 270, width: 16, length: 16, locked: false },
  { id: 'blue2', alliance: 'blue', number: 'B2', x: 136, y: 90, heading: 270, width: 16, length: 16, locked: false }
]

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const fieldPercent = (inches: number) => `${(inches / FIELD_IN) * 100}%`
export const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360
export const screenDeltaToInches = (pixels: number, boardPixels: number, zoom: number) =>
  pixels * FIELD_IN / (boardPixels * zoom)

/** Axis-aligned half extents of a rotated rectangular robot. */
export const robotHalfExtents = (robot: Pick<FieldRobot, 'width' | 'length' | 'heading'>) => {
  const radians = robot.heading * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  return {
    x: (robot.width * cosine + robot.length * sine) / 2,
    y: (robot.width * sine + robot.length * cosine) / 2
  }
}
export const clampRobotToField = (robot: FieldRobot): FieldRobot => {
  const half = robotHalfExtents(robot)
  return { ...robot, x: clamp(robot.x, half.x, FIELD_IN - half.x), y: clamp(robot.y, half.y, FIELD_IN - half.y) }
}
