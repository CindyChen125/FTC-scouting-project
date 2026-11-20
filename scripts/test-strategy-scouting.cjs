const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request.endsWith('/data/events')) return {
    CURRENT_SEASON: 2026,
    findEvent: (code) => ({ code, season: 2026 }),
    entryEventCode: (entry) => entry.eventCode
  }
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    resolveJsonModule: true
  } }).outputText, filename)
}
const { buildEventScoutingInsights } = require(path.resolve(__dirname, '../src/strategy/scoutingInsights.ts'))
const { biobuzzRows, computeRankings, BIOBUZZ_MODEL } = require(path.resolve(__dirname, '../src/utils/ranking.ts'))
const { emptyAuto, emptyTeleop, emptyEndgame, NOTE_OPTIONS } = require(path.resolve(__dirname, '../src/types/scouting.ts'))

const entry = (teamNumber, matchId, updatedAt, autoBalls, pollen, nectar, flowers, eventCode = 'EVENT-A') => ({
  eventCode, teamNumber, matchId, updatedAt, alliance: 'red', scoutName: 'Scout', overallNotes: '',
  auto: { ...emptyAuto(), cellBalls: autoBalls },
  teleop: { ...emptyTeleop(), cellPollen: pollen, cellNectar: nectar },
  endgame: { ...emptyEndgame(), flowerPollen: flowers }
})
const older = entry('123', 'Q1', 100, 1, 1, 0, 0)
const corrected = entry('123', 'Q1', 200, 3, 2, 1, 1)
corrected.auto.noteTags = [NOTE_OPTIONS[2]]
corrected.teleop.noteTags = [NOTE_OPTIONS[1]]
corrected.overallNotes = 'Strong close-range scoring'
const second = entry('123', 'Q2', 300, 5, 4, 2, 3)
second.auto.leave = true
second.endgame.park = true
const other = entry('456', 'Q1', 250, 1, 0, 0, 0)
const wrongEvent = entry('123', 'Q3', 400, 99, 99, 99, 99, 'EVENT-B')
const pit = (eventCode, teamNumber, updatedAt, role) => ({ eventCode, teamNumber, updatedAt,
  data: { drivetrain: 'mecanum', hiveBalls: 'both', flowerBalls: 'pollen', colorSort: true,
    autoActions: ['leave'], role, notes: 'Pit note' }, scoutName: 'Scout' })
const result = buildEventScoutingInsights('EVENT-A', [older, corrected, second, other, wrongEvent],
  [pit('EVENT-B', '123', 300, 'defense'), pit('EVENT-A', '123', 200, 'hive')])
const team = result.teams.get('123')
assert(team)
assert.equal(team.observations.length, 2, 'latest observation per match is used')
assert.equal(team.autoBalls, 4, 'other event and older correction are excluded')
assert.equal(team.telePollen, 3)
assert.equal(team.teleNectar, 1.5)
assert.equal(team.autoLeaveRate, 0.5)
assert.equal(team.endParkRate, 0.5)
assert.equal(team.pit.data.role, 'hive', 'pit profile is filtered by event')
assert.deepEqual(team.reportedStrengths, ['defense'])
assert.deepEqual(team.reportedIssues, ['mechanical-failure'])
assert(team.notes.includes('Strong close-range scoring'))
assert(team.consistencySpread !== null)
assert.equal(result.teams.get('456').consistencySpread, null, 'one match does not claim consistency')
assert.equal(result.teams.has('999'), false, 'unknown team has no invented data')
const direct = computeRankings(biobuzzRows([corrected, second, other]), BIOBUZZ_MODEL)
assert.equal(team.ranking.compositeScore, direct.find((ranked) => ranked.row.number === '123').compositeScore,
  'sandbox uses the Current Data ranking calculation')
const withOpr = buildEventScoutingInsights('EVENT-A', [corrected, second, other], [], new Map([['123', 42]]))
assert(withOpr.model.factors.some((factor) => factor.key === 'officialOpr'))
console.log('Passed: event and team identity, latest observations, pit details, stats, notes, and ranking parity.')
