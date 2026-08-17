export type Alliance = 'red' | 'blue'
export type ParkStatus = 'none' | 'partial' | 'full'

// Multi-select preset notes for Auto/Teleop. '其他 Other' reveals a free text
// field so scouts can describe anything not covered here.
export const NOTE_OPTIONS = [
  '机器断联 Robot disconnected',
  '开对面闸门 Opened opponent gate',
  '机械故障 Mechanical failure',
  '其他 Other'
]
export const NOTE_OTHER = '其他 Other'

// noteTags holds any number of NOTE_OPTIONS values; noteText is the free text
// used only when '其他 Other' is among the selected tags.
export interface AutoData {
  leftStart: boolean
  nearGoalsMade: number
  farGoalsMade: number
  noteTags: string[]
  noteText: string
}

export interface TeleopData {
  nearGoalsMade: number
  farGoalsMade: number
  noteTags: string[]
  noteText: string
}

export interface EndgameData {
  hasLift: boolean
  parkStatus: ParkStatus
}

export interface MatchScoutEntry {
  // Entries submitted before this field existed have no eventCode — treat
  // that as CURRENT_EVENT_CODE (see src/data/events.ts) when filtering.
  eventCode?: string
  matchId: string
  teamNumber: string
  alliance: Alliance
  scoutName: string
  auto: AutoData
  teleop: TeleopData
  endgame: EndgameData
  overallNotes: string
  updatedAt: number
}

export const emptyAuto = (): AutoData => ({
  leftStart: false,
  nearGoalsMade: 0,
  farGoalsMade: 0,
  noteTags: [],
  noteText: ''
})

export const emptyTeleop = (): TeleopData => ({
  nearGoalsMade: 0,
  farGoalsMade: 0,
  noteTags: [],
  noteText: ''
})

export const emptyEndgame = (): EndgameData => ({
  hasLift: false,
  parkStatus: 'none'
})

// Submitted entries (shown in "My Scouting Data") use the `scout:` prefix.
export const scoutEntryStorageKey = (matchId: string, teamNumber: string) =>
  `scout:${matchId}:${teamNumber}`

// Auto-saved backups (offline-first safety net, never shown/uploaded) use `backup:`.
export const scoutBackupKey = (matchId: string, teamNumber: string) =>
  `backup:${matchId}:${teamNumber}`
