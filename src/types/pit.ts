// Pit scouting: what a team's robot can do, asked in the pits before or
// between matches. One profile per team per event (robots change between
// events). BIOBUZZ 2026-2027 questions.

export type Drivetrain = 'mecanum' | 'tank' | 'swerve' | 'other'
export type BallCapability = 'pollen' | 'nectar' | 'both' | 'none'
export type AutoAction = 'leave' | 'preload' | 'tip' | 'park'
export type PitRole = 'hive' | 'flowers' | 'defense' | 'flexible'

// '' / null = not answered yet, which is different from answering "none".
export interface PitData {
  drivetrain: Drivetrain | ''
  hiveBalls: BallCapability | ''
  flowerBalls: BallCapability | ''
  // Can the robot reject the opponent's nectar (it may not control it, G408)?
  colorSort: boolean | null
  autoActions: AutoAction[]
  role: PitRole | ''
  notes: string
}

export interface PitEntry {
  eventCode: string
  teamNumber: string
  data: PitData
  scoutName: string
  scoutedBy?: string | null
  lastEditedBy?: string | null
  updatedAt: number
}

export const emptyPitData = (): PitData => ({
  drivetrain: '',
  hiveBalls: '',
  flowerBalls: '',
  colorSort: null,
  autoActions: [],
  role: '',
  notes: ''
})

export const DRIVETRAIN_OPTIONS: { value: Drivetrain; label: string }[] = [
  { value: 'mecanum', label: '麦轮 Mecanum' },
  { value: 'tank', label: '坦克 Tank' },
  { value: 'swerve', label: '舵轮 Swerve' },
  { value: 'other', label: '其他 Other' }
]

export const BALL_OPTIONS: { value: BallCapability; label: string }[] = [
  { value: 'pollen', label: '花粉 Pollen' },
  { value: 'nectar', label: '花蜜 Nectar' },
  { value: 'both', label: '都可以 Both' },
  { value: 'none', label: '不能 None' }
]

export const AUTO_OPTIONS: { value: AutoAction; label: string }[] = [
  { value: 'leave', label: '远离 Leave' },
  { value: 'preload', label: '射预载 Shoots preload' },
  { value: 'tip', label: '翻转蜂巢 Gets a tip' },
  { value: 'park', label: '停泊 Parks' }
]

export const ROLE_OPTIONS: { value: PitRole; label: string }[] = [
  { value: 'hive', label: '蜂巢 Hive' },
  { value: 'flowers', label: '花朵 Flowers' },
  { value: 'defense', label: '防守 Defense' },
  { value: 'flexible', label: '灵活 Flexible' }
]

export const optionLabel = <T extends string>(options: { value: T; label: string }[], value: T | '') =>
  options.find((o) => o.value === value)?.label ?? '—'

export const formatPitAuto = (actions: AutoAction[]) =>
  actions.length === 0 ? '—' : actions.map((a) => optionLabel(AUTO_OPTIONS, a)).join('、')

export const formatColorSort = (value: boolean | null) =>
  value === null ? '—' : value ? '能 Yes' : '不能 No'

// Same namespacing as match entries: per user (shared phones) and per event.
export const pitEntryStorageKey = (userId: string, eventCode: string, teamNumber: string) =>
  `pit:${userId}:${eventCode}:${teamNumber}`

export const pitBackupKey = (userId: string, eventCode: string, teamNumber: string) =>
  `pitBackup:${userId}:${eventCode}:${teamNumber}`

export const pitEntryKeyPrefix = (userId: string) => `pit:${userId}:`
