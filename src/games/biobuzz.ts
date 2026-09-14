import { BiobuzzEntry } from '../types/scouting'
import { GameView, formatNotes, yesNo } from './common'

// BIOBUZZ 2026-2027. Point values from Table 10-2 of the V1 Competition Manual.
export const BIOBUZZ_POINTS = {
  leave: 3,
  autoPark: 5,
  endPark: 5,
  tip: 20
}

// Leave + both parks: the robot's share toward the SWARM RP (16 at most events).
export const movementPoints = (e: BiobuzzEntry) =>
  (e.auto.leave ? BIOBUZZ_POINTS.leave : 0) +
  (e.auto.park ? BIOBUZZ_POINTS.autoPark : 0) +
  (e.endgame.park ? BIOBUZZ_POINTS.endPark : 0)

export const hiveBalls = (e: BiobuzzEntry) =>
  e.auto.cellBalls + e.teleop.cellPollen + e.teleop.cellNectar

export const flowerBalls = (e: BiobuzzEntry) => e.endgame.flowerPollen + e.endgame.flowerNectar

export const allianceTips = (e: BiobuzzEntry) => e.auto.allianceTips + e.teleop.allianceTips

export const biobuzzView: GameView<BiobuzzEntry> = {
  season: 2026,
  name: 'BIOBUZZ 2026-2027',

  cardStats: (e) => [
    { label: 'Hive balls', value: String(hiveBalls(e)) },
    { label: 'Flower balls', value: String(flowerBalls(e)) },
    { label: 'Alliance tips', value: String(allianceTips(e)) },
    { label: 'Park', value: e.endgame.park ? 'Yes' : 'No' }
  ],

  detailSections: (e) => [
    {
      title: '自动阶段 Auto',
      rows: [
        { label: '远离 Leave', value: yesNo(e.auto.leave) },
        { label: '射入蜂房 Balls into hive', value: String(e.auto.cellBalls) },
        { label: '联盟蜂巢翻转 Alliance hive tips', value: String(e.auto.allianceTips) },
        { label: '自动停泊 Auto park', value: yesNo(e.auto.park) },
        { label: '备注 Notes', value: formatNotes(e.auto.noteTags, e.auto.noteText) }
      ]
    },
    {
      title: '手动阶段 Teleop',
      rows: [
        { label: '花粉射入蜂房 Pollen into hive', value: String(e.teleop.cellPollen) },
        { label: '花蜜射入蜂房 Nectar into hive', value: String(e.teleop.cellNectar) },
        { label: '联盟蜂巢翻转 Alliance hive tips', value: String(e.teleop.allianceTips) },
        { label: '备注 Notes', value: formatNotes(e.teleop.noteTags, e.teleop.noteText) }
      ]
    },
    {
      title: '终局阶段 Endgame',
      rows: [
        { label: '花粉放入花朵 Pollen into flowers', value: String(e.endgame.flowerPollen) },
        { label: '花蜜放入花朵 Nectar into flowers', value: String(e.endgame.flowerNectar) },
        { label: '停泊装载区 Park in loading zone', value: yesNo(e.endgame.park) }
      ]
    }
  ],

  exportColumns: (e) => ({
    'Auto: Leave': yesNo(e.auto.leave),
    'Auto: Balls Into Hive': e.auto.cellBalls,
    'Auto: Alliance Tips': e.auto.allianceTips,
    'Auto: Park': yesNo(e.auto.park),
    'Auto: Notes': formatNotes(e.auto.noteTags, e.auto.noteText),
    'Teleop: Pollen Into Hive': e.teleop.cellPollen,
    'Teleop: Nectar Into Hive': e.teleop.cellNectar,
    'Teleop: Alliance Tips': e.teleop.allianceTips,
    'Teleop: Notes': formatNotes(e.teleop.noteTags, e.teleop.noteText),
    'Endgame: Pollen Into Flowers': e.endgame.flowerPollen,
    'Endgame: Nectar Into Flowers': e.endgame.flowerNectar,
    'Endgame: Park': yesNo(e.endgame.park)
  })
}
