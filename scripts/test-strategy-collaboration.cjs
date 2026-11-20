const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
const { createStrategyBoard } = require(path.resolve(__dirname, '../src/strategy/annotations.ts'))
const { emptyTimeline } = require(path.resolve(__dirname, '../src/strategy/timeline.ts'))
const { applyObjectPatch, applyObjectOverrides, diffObjects, mergeSnapshots } =
  require(path.resolve(__dirname, '../src/strategy/collaboration.ts'))
const copy = (value) => structuredClone(value)
const base = { board: createStrategyBoard(), timeline: emptyTimeline() }

const local = copy(base)
local.board.auto.robots[0].x = 24
local.board.auto.annotations.push({ id: 'a1', kind: 'line', color: '#000', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })
const remote = copy(base)
remote.board.auto.robots[1].heading = 90
remote.timeline.teleop.blue1.push({ id: 'w1', x: 30, y: 40, heading: 45, at: 5 })
let merged = mergeSnapshots(base, local, remote)
assert.deepEqual(merged.conflicts, [], 'different robots and phases merge')
assert.equal(merged.snapshot.board.auto.robots[0].x, 24)
assert.equal(merged.snapshot.board.auto.robots[1].heading, 90)
assert.equal(merged.snapshot.timeline.teleop.blue1[0].id, 'w1')
assert.equal(merged.snapshot.board.auto.annotations[0].id, 'a1')

const competing = copy(base)
competing.board.auto.robots[0].x = 40
merged = mergeSnapshots(base, local, competing)
assert.deepEqual(merged.conflicts, ['robot:auto:red1'], 'same robot flags a conflict')
assert.equal(merged.snapshot.board.auto.robots[0].x, 24, 'local edit is held until a choice')

const deletion = diffObjects(local, base).find((item) => item.key === 'annotation:auto:a1')
assert.equal(deletion.value, null, 'deletion is a tombstone')
assert.equal(applyObjectPatch(local, deletion).board.auto.annotations.length, 0)
const overridden = applyObjectOverrides(base, [{ ...deletion, strategyId: 's1', revision: 2 }])
assert.equal(overridden.board.auto.annotations.length, 0)

const waypoint = diffObjects(base, remote).find((item) => item.key === 'waypoint:teleop:blue1:w1')
assert.equal(waypoint.robotId, 'blue1')
assert.equal(applyObjectPatch(base, waypoint).timeline.teleop.blue1[0].at, 5)
console.log('Passed: independent object merge, same-object conflict, tombstones, and route patches.')
