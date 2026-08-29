import * as XLSX from 'xlsx'
import { MatchScoutEntry } from '../types/scouting'
import { formatNotes, parkStatusLabel } from './scoutFormat'

// Exports whatever entries are passed in (already filtered by event/search
// by the caller) to a downloaded .xlsx file — one row per scouted team+match.
export function exportEntriesToExcel(
  entries: MatchScoutEntry[],
  eventName: string,
  // user id -> display name, so a renamed scout exports under their current name
  names: Record<string, string> = {}
) {
  const rows = entries.map((e) => ({
    'Match ID': e.matchId,
    'Team #': e.teamNumber,
    'Alliance': e.alliance,
    'Scout': (e.scoutedBy && names[e.scoutedBy]) || e.scoutName || '',
    'Edited By':
      e.lastEditedBy && e.lastEditedBy !== e.scoutedBy ? names[e.lastEditedBy] || '' : '',
    'Updated': new Date(e.updatedAt).toLocaleString(),
    'Auto: Left Starting Line': e.auto.leftStart ? 'Yes' : 'No',
    'Auto: Near Scored': e.auto.nearGoalsMade,
    'Auto: Far Scored': e.auto.farGoalsMade,
    'Auto: Notes': formatNotes(e.auto.noteTags, e.auto.noteText),
    'Teleop: Near Scored': e.teleop.nearGoalsMade,
    'Teleop: Far Scored': e.teleop.farGoalsMade,
    'Teleop: Notes': formatNotes(e.teleop.noteTags, e.teleop.noteText),
    'Endgame: Has Lift': e.endgame.hasLift ? 'Yes' : 'No',
    'Endgame: Park Status': parkStatusLabel(e.endgame.parkStatus),
    'Overall Notes': e.overallNotes || ''
  }))

  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = [
    { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 20 },
    { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 34 },
    { wch: 14 }, { wch: 14 }, { wch: 34 },
    { wch: 16 }, { wch: 18 },
    { wch: 34 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Scouting Data')

  const safeEventName = eventName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  const dateStamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `scouting_${safeEventName}_${dateStamp}.xlsx`)
}
