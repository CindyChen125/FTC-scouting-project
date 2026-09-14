import { MatchScoutEntry, Season } from '../types/scouting'
import { findEvent, entryEventCode } from '../data/events'
import { GameView } from './common'
import { decodeView } from './decode'
import { biobuzzView } from './biobuzz'

export type { GameView, StatItem, DetailSection } from './common'

const VIEWS: Record<Season, GameView> = {
  2025: decodeView as GameView,
  2026: biobuzzView as GameView
}

export const gameForSeason = (season: Season): GameView => VIEWS[season]

export const gameForEntry = (entry: MatchScoutEntry): GameView =>
  gameForSeason(findEvent(entryEventCode(entry)).season)
