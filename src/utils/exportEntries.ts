import * as XLSX from 'xlsx'
import { MatchScoutEntry } from '../types/scouting'
import { gameForEntry } from '../games'

const fileStem = (eventName: string) => {
  const safeEventName = eventName.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  return `${safeEventName}_${new Date().toISOString().slice(0, 10)}`
}

// Writes rows to a downloaded .xlsx, sizing each column to its header or
// longest value, within reason.
function writeWorkbook(rows: Record<string, string | number>[], sheetName: string, fileName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  worksheet['!cols'] = headers.map((h) => ({
    wch: Math.min(40, Math.max(8, h.length + 2, ...rows.map((r) => String(r[h] ?? '').length + 2)))
  }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

// Exports whatever entries are passed in (already filtered by event/search
// by the caller) to a downloaded .xlsx file — one row per scouted team+match.
// Callers pass one event at a time, so every row has the same game columns.
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
    ...gameForEntry(e).exportColumns(e),
    'Overall Notes': e.overallNotes || ''
  }))

  writeWorkbook(rows, 'Scouting Data', `scouting_${fileStem(eventName)}`)
}

