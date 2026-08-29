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

export type UserRole = 'admin' | 'scout'

export interface Profile {
  userId: string
  username: string
  displayName: string
  role: UserRole
  isActive: boolean
}

export const profileLabel = (p: Pick<Profile, 'displayName' | 'username'>) =>
  p.displayName || p.username

export interface MatchScoutEntry {
  // Entries submitted before this field existed have no eventCode — treat
  // that as CURRENT_EVENT_CODE (see src/data/events.ts) when filtering.
  eventCode?: string
  matchId: string
  teamNumber: string
  alliance: Alliance
  // Snapshot of the author's display name at submit time. Kept alongside
  // scoutedBy so exports stay readable and old entries survive an account
  // being removed.
  scoutName: string
  // Verified author, pinned server-side from the caller's token — this is the
  // trustworthy answer to "who scouted this match".
  scoutedBy?: string | null
  // Set whenever anyone edits the entry, which may not be the author.
  lastEditedBy?: string | null
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

// Local keys are namespaced by user and event. Without the event, "Q1 / Team
// 417" at KDays and at the CaoLu Cup overwrite each other; without the user,
// two scouts sharing one phone would see each other's drafts.
const localKey = (
  prefix: string,
  userId: string,
  eventCode: string,
  matchId: string,
  teamNumber: string
) => `${prefix}:${userId}:${eventCode}:${matchId}:${teamNumber}`

// Submitted entries (shown in "My Scouting Data") use the `scout:` prefix.
export const scoutEntryStorageKey = (
  userId: string,
  eventCode: string,
  matchId: string,
  teamNumber: string
) => localKey('scout', userId, eventCode, matchId, teamNumber)

// Auto-saved backups (offline-first safety net, never uploaded) use `backup:`.
export const scoutBackupKey = (
  userId: string,
  eventCode: string,
  matchId: string,
  teamNumber: string
) => localKey('backup', userId, eventCode, matchId, teamNumber)

// Matches every locally submitted entry belonging to one user.
export const scoutEntryKeyPrefix = (userId: string) => `scout:${userId}:`
