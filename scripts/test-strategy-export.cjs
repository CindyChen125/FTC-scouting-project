const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
const labels = []
let lines = 0
const ctx = new Proxy({}, { get: (_, key) => key === 'fillText' ? (label) => labels.push(label) :
  key === 'lineTo' ? () => { lines++ } : () => {} })
global.document = { createElement: () => ({ getContext: () => ctx }) }
const { createStrategyBoard } = require(path.resolve(__dirname, '../src/strategy/annotations.ts'))
const { emptyTimeline } = require(path.resolve(__dirname, '../src/strategy/timeline.ts'))
const { renderStrategyImage } = require(path.resolve(__dirname, '../src/strategy/exportImage.ts'))
const board = createStrategyBoard()
board.auto.robots.forEach((robot, i) => { robot.number = String(100 + i) })
board.auto.annotations.push({ id: 'note', kind: 'text', color: '#000', points: [{ x: 20, y: 20 }], text: 'Cross field' })
const timeline = emptyTimeline()
timeline.auto.red1.push({ id: 'w1', x: 40, y: 50, at: 5, heading: 90 })
const canvas = renderStrategyImage({ board, timeline, phase: 'auto',
  details: { name: 'Q5 plan', eventCode: 'BIOBUZZ', matchNumber: 'Q5', redTeams: ['100', '101'], blueTeams: ['102', '103'] } })
assert.equal(canvas.width, 1200)
assert.equal(canvas.height, 1200)
for (const number of ['100', '101', '102', '103']) assert(labels.includes(number), `robot ${number} is labeled`)
assert(labels.includes('Cross field'), 'annotation text is drawn')
assert(labels.some((label) => String(label).includes('Q5 plan')), 'strategy title is drawn')
assert(lines > 10, 'field, route, and shapes have visible paths')
console.log('Passed: PNG canvas includes field paths, four team labels, annotation, and scenario labels.')
