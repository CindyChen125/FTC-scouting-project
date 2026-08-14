export type Alliance = 'red' | 'blue'
export type ParkStatus = 'none' | 'partial' | 'full'

// Preset notes for the Auto/Teleop notes dropdown. '其他 Other' reveals a free
// text field so scouts can describe anything not covered here.
export const NOTE_OPTIONS = [
  '无 None',
  '机器断联 Robot disconnected',
  '开对面闸门 Opened opponent gate',
  '机械故障 Mechanical failure',
  '被重点防守 Heavily defended',
  '防守对方 Played defense',
  '趴窝无法移动 Immobilized',
  '判罚 Penalty',
  '其他 Other'
]
export const NOTE_OTHER = '其他 Other'

// noteTag holds a NOTE_OPTIONS value; noteText is the free text used only when
// noteTag is '其他 Other'.
export interface AutoData {
  leftStart: boolean
  nearGoalsMade: number
  farGoalsMade: number
  noteTag: string
  noteText: string
}

export interface TeleopData {
  nearGoalsMade: number
  farGoalsMade: number
  totalCycles: number
  avgCycleTimeSec: number
  penaltiesDrawn: number
  penaltiesCommitted: number
  noteTag: string
  noteText: string
}

export interface EndgameData {
  hasLift: boolean
  parkStatus: ParkStatus
  parkTimeSec: number
  notes: string
}

export interface MatchScoutEntry {
  matchId: string
  teamNumber: string
  alliance: Alliance
  scoutName: string
  auto: AutoData
  teleop: TeleopData
  endgame: EndgameData
  updatedAt: number
}

export const emptyAuto = (): AutoData => ({
  leftStart: false,
  nearGoalsMade: 0,
  farGoalsMade: 0,
  noteTag: '',
  noteText: ''
})

export const emptyTeleop = (): TeleopData => ({
  nearGoalsMade: 0,
  farGoalsMade: 0,
  totalCycles: 0,
  avgCycleTimeSec: 0,
  penaltiesDrawn: 0,
  penaltiesCommitted: 0,
  noteTag: '',
  noteText: ''
})

export const emptyEndgame = (): EndgameData => ({
  hasLift: false,
  parkStatus: 'none',
  parkTimeSec: 0,
  notes: ''
})

export const scoutEntryStorageKey = (matchId: string, teamNumber: string) =>
  `scout:${matchId}:${teamNumber}`
