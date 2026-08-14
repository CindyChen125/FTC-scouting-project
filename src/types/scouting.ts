export type Alliance = 'red' | 'blue'
export type ParkStatus = 'none' | 'partial' | 'full'

export interface AutoData {
  leftStart: boolean
  routeNote: string
  nearGoalsMade: number
  farGoalsMade: number
  patternCount: number
  notes: string
}

export interface TeleopData {
  nearGoalsMade: number
  farGoalsMade: number
  patternCount: number
  totalCycles: number
  avgCycleTimeSec: number
  penaltiesDrawn: number
  penaltiesCommitted: number
  notes: string
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
  routeNote: '',
  nearGoalsMade: 0,
  farGoalsMade: 0,
  patternCount: 0,
  notes: ''
})

export const emptyTeleop = (): TeleopData => ({
  nearGoalsMade: 0,
  farGoalsMade: 0,
  patternCount: 0,
  totalCycles: 0,
  avgCycleTimeSec: 0,
  penaltiesDrawn: 0,
  penaltiesCommitted: 0,
  notes: ''
})

export const emptyEndgame = (): EndgameData => ({
  hasLift: false,
  parkStatus: 'none',
  parkTimeSec: 0,
  notes: ''
})

export const scoutEntryStorageKey = (matchId: string, teamNumber: string) =>
  `scout:${matchId}:${teamNumber}`
