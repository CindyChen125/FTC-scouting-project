import { NOTE_OTHER } from '../types/scouting'

export const parkStatusLabel = (status: string) =>
  status === 'partial' ? '半停 Partial' : status === 'full' ? '全停 Full' : '未停靠 None'

export const formatNotes = (tags: string[], text: string) => {
  if (!tags || tags.length === 0) return '—'
  return tags.map((t) => (t === NOTE_OTHER && text ? `${t}: ${text}` : t)).join('、')
}
