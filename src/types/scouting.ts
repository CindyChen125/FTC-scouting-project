export type Alliance = 'red' | 'blue'

// FTC seasons are named by their starting year: 2025 = DECODE (2025-2026),
// 2026 = BIOBUZZ (2026-2027). Each event carries its season (see
// src/data/events.ts), and that is what decides which shape an entry's
// auto/teleop/endgame data has — the JSON columns don't record it themselves.
export type Season = 2025 | 2026

export const NOTE_OTHER = '其他 Other'

// Multi-select preset notes for Auto/Teleop. '其他 Other' reveals a free text
// field so scouts can describe anything not covered here.
export const NOTE_OPTIONS = [
  '机器断联 Robot disconnected',
  '机械故障 Mechanical failure',
  '防守 Played defense',
  '提前放花蜜 Early nectar in flower',
  '持有超过4个 Held more than 4',
  '卡在蜂巢 Stuck on hive',
  NOTE_OTHER
]

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

interface EntryBase {
  // Entries submitted before this field existed have no eventCode — treat
  // that as LEGACY_EVENT_CODE (see src/data/events.ts).
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
  overallNotes: string
  updatedAt: number
}

// ---- DECODE 2025-2026 — read-only history, no longer entered ----

export type DecodeParkStatus = 'none' | 'partial' | 'full'

export interface DecodeAuto {
  leftStart: boolean
  nearGoalsMade: number
  farGoalsMade: number
  noteTags: string[]
  noteText: string
}

export interface DecodeTeleop {
  nearGoalsMade: number
  farGoalsMade: number
  noteTags: string[]
  noteText: string
}

export interface DecodeEndgame {
  hasLift: boolean
  parkStatus: DecodeParkStatus
}

export interface DecodeEntry extends EntryBase {
  auto: DecodeAuto
  teleop: DecodeTeleop
  endgame: DecodeEndgame
}

// ---- BIOBUZZ 2026-2027 ----
//
// A scout watches one robot, so ball counts are that robot's own. Hive tips
// belong to the whole alliance (either robot's shots can finish one), so they
// are recorded as the alliance total the scout saw.

// noteTags holds any number of NOTE_OPTIONS values; noteText is the free text
// used only when '其他 Other' is among the selected tags.
export interface AutoData {
  leave: boolean
  // Balls this robot launched into its alliance's upward-facing cell.
  cellBalls: number
  allianceTips: number
  park: boolean
  noteTags: string[]
  noteText: string
}

export interface TeleopData {
  cellPollen: number
  cellNectar: number
  allianceTips: number
  noteTags: string[]
  noteText: string
}

export interface EndgameData {
  flowerPollen: number
  flowerNectar: number
  park: boolean
}

export interface BiobuzzEntry extends EntryBase {
  auto: AutoData
  teleop: TeleopData
  endgame: EndgameData
}

export type MatchScoutEntry = DecodeEntry | BiobuzzEntry

export const emptyAuto = (): AutoData => ({
  leave: false,
  cellBalls: 0,
  allianceTips: 0,
  park: false,
  noteTags: [],
  noteText: ''
})

export const emptyTeleop = (): TeleopData => ({
  cellPollen: 0,
  cellNectar: 0,
  allianceTips: 0,
  noteTags: [],
  noteText: ''
})

export const emptyEndgame = (): EndgameData => ({
  flowerPollen: 0,
  flowerNectar: 0,
  park: false
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
