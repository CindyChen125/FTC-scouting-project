const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020
  } }).outputText, filename)
}
const a = require(path.resolve(__dirname, '../src/strategy/annotations.ts'))
const board = a.createStrategyBoard()
assert.notEqual(board.auto.robots, board.teleop.robots, 'phase robot arrays are independent')
assert.notEqual(board.auto.annotations, board.teleop.annotations, 'phase annotations are independent')

const line = { id: 'one', kind: 'line', color: '#245fbd', points: [{ x: 20, y: 20 }, { x: 60, y: 20 }] }
const curve = { id: 'two', kind: 'curve', color: '#a93d49', points: a.curvePoints({ x: 20, y: 30 }, { x: 60, y: 30 }) }
assert(a.hitAnnotation(line, { x: 40, y: 21 }, 2))
assert(!a.hitAnnotation(line, { x: 40, y: 30 }, 2))
assert.equal(a.topAnnotationAt([line, curve], { x: 40, y: 21 }, 2).id, 'one')
assert.equal(a.sampledPoints(curve).length, 21)
assert.deepEqual(a.translated(line, 10, 5).points, [{ x: 30, y: 25 }, { x: 70, y: 25 }])
assert.deepEqual(a.translated(line, -50, 0).points, [{ x: 0, y: 20 }, { x: 40, y: 20 }], 'boundary movement preserves the line shape')
assert.deepEqual(a.withPoint(line, 1, { x: 200, y: -10 }).points[1], { x: 144, y: 0 })

const calls = []
const ctx = new Proxy({}, { get: (_, property) => (...args) => calls.push([property, ...args]) })
a.renderAnnotations(ctx, [line, curve], 'one', null, 720)
assert(calls.some(([name, x, y]) => name === 'moveTo' && x === 100 && y === 100), '20 in maps to 100 px on a 720 px field')
assert(calls.some(([name]) => name === 'quadraticCurveTo'))
assert.equal(calls[calls.length - 1][0], 'draw')
console.log('Passed: field-coordinate annotations, hit testing, editing, curves, and rendering.')
