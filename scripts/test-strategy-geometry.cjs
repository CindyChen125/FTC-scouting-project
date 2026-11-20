const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const filename = require('node:path').resolve(__dirname, '../src/strategy/fieldGeometry.ts')
const source = fs.readFileSync(filename, 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = module.paths
loaded._compile(compiled, filename)
const g = loaded.exports

assert.equal(g.FIELD_IN, 144)
assert.equal(g.TILE_IN * 6, g.FIELD_IN)
assert.equal(g.FRAME.width, 49.46)
assert.equal(g.FRAME.height, 38.95)
assert.equal(g.FRAME.x + g.FRAME.width / 2, 72)
assert.equal(g.FRAME.y + g.FRAME.height / 2, 72)
assert.equal(g.HIVE_CENTERS.blue.x - g.HIVE_CENTERS.red.x, 25.5)
assert.equal(g.ALLIANCE_AREA.width, 54)
assert.equal(g.ALLIANCE_AREA.height, 97)
assert.equal(g.fieldPercent(16), `${100 / 9}%`)
assert.equal(g.screenDeltaToInches(80, 720, 1), 16)
assert.equal(g.screenDeltaToInches(80, 720, 2), 8)
assert.equal(g.screenDeltaToInches(80, 360, 1), 32)
const robot = { ...g.initialRobots()[0], width: 16, length: 18, heading: 90, x: 2, y: 2 }
assert.deepEqual(g.robotHalfExtents(robot), { x: 9, y: 8 })
const clamped = g.clampRobotToField(robot)
assert.equal(clamped.x, 9)
assert.equal(clamped.y, 8)
assert.equal(g.normalizeHeading(-15), 345)
for (const start of g.initialRobots()) {
  const half = g.robotHalfExtents(start)
  assert.equal(start.alliance === 'red' ? start.x - half.x : start.x + half.x, start.alliance === 'red' ? 0 : g.FIELD_IN)
  assert(start.alliance === 'red' ? start.x + half.x <= 72 : start.x - half.x >= 72)
}
console.log('Passed: field geometry, robot footprint, zoom scaling, and boundary clamping.')
