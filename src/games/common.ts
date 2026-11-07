import { MatchScoutEntry, NOTE_OTHER, Season, noteTagLabel } from '../types/scouting'
import { translate as t } from '../i18n'

export interface StatItem {
  label: string
  value: string
}

export interface DetailSection {
  title: string
  rows: StatItem[]
}

// Everything that depends on which game an entry was scouted in. Pages ask
// for the view of an entry's season instead of reading game fields directly,
// so old DECODE entries keep rendering after the form moved on to BIOBUZZ.
export interface GameView<E extends MatchScoutEntry = MatchScoutEntry> {
  season: Season
  name: string
  // Headline numbers on a "My Scouting Data" card.
  cardStats: (entry: E) => StatItem[]
  // Auto / Teleop / Endgame sections on the detail page.
  detailSections: (entry: E) => DetailSection[]
  // Game columns of the Excel export, in order.
  exportColumns: (entry: E) => Record<string, string | number>
}

export const yesNo = (value: boolean) => t(value ? 'Yes' : 'No')

export const formatNotes = (tags: string[], text: string) => {
  if (!tags || tags.length === 0) return '—'
  return tags.map(noteTagLabel).map((label) => (label === NOTE_OTHER && text ? `${t(label)}: ${text}` : t(label))).join(' · ')
}
