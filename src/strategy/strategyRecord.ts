import { CURRENT_EVENT_CODE } from '../data/events'
import { StrategyBoard, createStrategyBoard } from './annotations'
import { emptyTimeline } from './timeline'

export interface StrategyDetails {
  name: string
  eventCode: string
  matchNumber: string
  redTeams: [string, string]
  blueTeams: [string, string]
}

export interface StrategyRecord extends StrategyDetails {
  id: string
  board: StrategyBoard
  timeline: Record<string, unknown>
  sourceStrategyId: string | null
  revision: number
  createdAt: string
  updatedAt: string
  createdBy: string
  updatedBy: string
  objectRevisions: Record<string, number>
}

export type StrategyDraft = StrategyDetails & {
  board: StrategyBoard
  timeline: Record<string, unknown>
}

export const emptyStrategyDetails = (): StrategyDetails => ({
  name: '', eventCode: CURRENT_EVENT_CODE, matchNumber: '',
  redTeams: ['', ''], blueTeams: ['', '']
})

export const emptyStrategyDraft = (): StrategyDraft => ({
  ...emptyStrategyDetails(), board: createStrategyBoard(), timeline: emptyTimeline()
})

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sorted(item)])
  )
  return value
}

export const strategyFingerprint = (draft: StrategyDraft): string => JSON.stringify(sorted(draft))

export const normalizeStrategyDraft = (draft: StrategyDraft): StrategyDraft => ({
  name: draft.name.trim(),
  eventCode: draft.eventCode.trim().toUpperCase(),
  matchNumber: draft.matchNumber.trim(),
  redTeams: draft.redTeams.map((team) => team.trim()) as [string, string],
  blueTeams: draft.blueTeams.map((team) => team.trim()) as [string, string],
  board: draft.board,
  timeline: draft.timeline
})

export const validateStrategyDraft = (draft: StrategyDraft): string | null => {
  if (!draft.name.trim()) return 'Strategy name is required'
  if (draft.name.trim().length > 100) return 'Strategy name must be 100 characters or fewer'
  if (!draft.eventCode.trim()) return 'Event is required'
  if (draft.eventCode.trim().length > 100) return 'Event must be 100 characters or fewer'
  if (draft.matchNumber.trim().length > 40) return 'Match number must be 40 characters or fewer'
  for (const team of [...draft.redTeams, ...draft.blueTeams]) {
    if (team.trim() && !/^\d{1,6}$/.test(team.trim())) return 'Team numbers must contain 1–6 digits'
  }
  return null
}
