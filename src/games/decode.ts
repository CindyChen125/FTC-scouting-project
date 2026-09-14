import { DecodeEntry } from '../types/scouting'
import { GameView, formatNotes, yesNo } from './common'

// DECODE 2025-2026. Entries are view-only now; this keeps them readable.

const parkStatusLabel = (status: string) =>
  status === 'partial' ? '半停 Partial' : status === 'full' ? '全停 Full' : '未停靠 None'

export const decodeView: GameView<DecodeEntry> = {
  season: 2025,
  name: 'DECODE 2025-2026',

  cardStats: (e) => [
    { label: 'Auto goals', value: String(e.auto.nearGoalsMade + e.auto.farGoalsMade) },
    { label: 'Teleop goals', value: String(e.teleop.nearGoalsMade + e.teleop.farGoalsMade) },
    { label: 'Endgame', value: e.endgame.parkStatus }
  ],

  detailSections: (e) => [
    {
      title: '自动阶段 Auto',
      rows: [
        { label: '是否离开起始线 Left starting line', value: yesNo(e.auto.leftStart) },
        { label: '近点 Near scored', value: String(e.auto.nearGoalsMade) },
        { label: '远点 Far scored', value: String(e.auto.farGoalsMade) },
        { label: '备注 Notes', value: formatNotes(e.auto.noteTags, e.auto.noteText) }
      ]
    },
    {
      title: '手动阶段 Teleop',
      rows: [
        { label: '近点 Near scored', value: String(e.teleop.nearGoalsMade) },
        { label: '远点 Far scored', value: String(e.teleop.farGoalsMade) },
        { label: '备注 Notes', value: formatNotes(e.teleop.noteTags, e.teleop.noteText) }
      ]
    },
    {
      title: '终局阶段 Endgame',
      rows: [
        { label: '是否有抬升机构 Has lift mechanism', value: yesNo(e.endgame.hasLift) },
        { label: '停靠 Park status', value: parkStatusLabel(e.endgame.parkStatus) }
      ]
    }
  ],

  exportColumns: (e) => ({
    'Auto: Left Starting Line': yesNo(e.auto.leftStart),
    'Auto: Near Scored': e.auto.nearGoalsMade,
    'Auto: Far Scored': e.auto.farGoalsMade,
    'Auto: Notes': formatNotes(e.auto.noteTags, e.auto.noteText),
    'Teleop: Near Scored': e.teleop.nearGoalsMade,
    'Teleop: Far Scored': e.teleop.farGoalsMade,
    'Teleop: Notes': formatNotes(e.teleop.noteTags, e.teleop.noteText),
    'Endgame: Has Lift': yesNo(e.endgame.hasLift),
    'Endgame: Park Status': parkStatusLabel(e.endgame.parkStatus)
  })
}
