const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
const { createRoot } = require('react-dom/client')
const h = React.createElement
const rows = new Map()
let serial = 0
let replacementCount = 0
let confirm = true
const clone = (value) => JSON.parse(JSON.stringify(value))
const service = {
  listStrategies: async () => [...rows.values()].map(clone),
  getStrategy: async (id) => clone(rows.get(id)),
  createStrategy: async (draft, sourceId = null) => {
    const record = { ...clone(draft), id: `id-${++serial}`, revision: 1, sourceStrategyId: sourceId,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', createdBy: 'user-one', updatedBy: 'user-one' }
    rows.set(record.id, record)
    return clone(record)
  },
  updateStrategy: async (record, draft) => {
    const existing = rows.get(record.id)
    assert.equal(existing.revision, record.revision)
    const next = { ...existing, ...clone(draft), revision: existing.revision + 1 }
    rows.set(record.id, next)
    return clone(next)
  },
  renameStrategy: async (record, name) => service.updateStrategy(record, { ...record, name }),
  deleteStrategy: async (id) => { rows.delete(id) }
}
const components = Object.fromEntries(['View', 'Text', 'Input'].map((name) => [name, (props) => {
  const tag = name === 'Input' ? 'input' : name === 'Text' ? 'span' : 'div'
  const forwarded = Object.fromEntries(['className', 'value', 'onClick'].filter((key) => key in props).map((key) => [key, props[key]]))
  if (name === 'Input') forwarded.onInput = (event) => props.onInput?.({ detail: { value: event.target.value } })
  return h(tag, forwarded, props.children)
}]))
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === '@tarojs/components') return components
  if (request === '@tarojs/taro') return { showModal: async () => ({ confirm }) }
  if (request.endsWith('AuthContext')) return { useAuth: () => ({ userId: 'user-one' }) }
  if (request.endsWith('LanguageContext')) return { useLanguage: () => ({ t: (key) => key }) }
  if (request.endsWith('supabase/strategies')) return service
  if (request.endsWith('/data/events')) return { CURRENT_EVENT_CODE: 'BIOBUZZ-PRACTICE' }
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
const Panel = require(path.resolve(__dirname, '../src/pages/strategy/StrategyScenarioPanel.tsx')).default
const { createStrategyBoard } = require(path.resolve(__dirname, '../src/strategy/annotations.ts'))
function Harness() {
  const [board, setBoard] = React.useState(createStrategyBoard)
  const [timeline, setTimeline] = React.useState(require(path.resolve(__dirname, '../src/strategy/timeline.ts')).emptyTimeline)
  const [details, setDetails] = React.useState(require(path.resolve(__dirname, '../src/strategy/strategyRecord.ts')).emptyStrategyDetails)
  return h(Panel, { board, timeline, details, onDetailsChange: setDetails,
    onTeamChange: (alliance, index, value) => setDetails((old) => ({ ...old,
      [alliance]: old[alliance].map((number, i) => i === index ? value : number) })),
    onReplaceScenario: (nextBoard, nextTimeline) => {
    replacementCount++; setBoard(nextBoard); setTimeline(nextTimeline)
  } })
}
const act = async (work) => React.act(async () => { await work() })
const click = async (label) => {
  const element = [...document.querySelectorAll('.strategy-scenarios .strategy-action')]
    .find((node) => node.textContent === label)
  assert(element, `Missing button ${label}`)
  await act(() => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
}
const input = async (element, value) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  setter.call(element, value)
  element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
})

async function main() {
  const root = createRoot(document.getElementById('root'))
  await act(() => root.render(h(Harness)))
  const name = document.querySelector('.strategy-scenarios .strategy-control input')
  await input(name, 'Aggressive scoring')
  await click('保存 Save')
  assert.equal(rows.size, 1)
  assert.equal([...rows.values()][0].name, 'Aggressive scoring')
  await input(document.querySelector('.strategy-scenarios .strategy-control input'), 'Balanced')
  await click('保存 Save')
  assert.equal(rows.size, 1, 'Save updates the current scenario')
  assert.equal([...rows.values()][0].revision, 2)
  await click('另存为新场景 Save as new')
  assert.equal(rows.size, 2, 'Save as new creates a separate scenario')
  assert.equal([...rows.values()][1].sourceStrategyId, 'id-1')
  await click('新建 New')
  assert(replacementCount > 0)
  await click('载入 Load')
  assert(document.querySelector('.strategy-scenarios .strategy-control input').value)
  confirm = false
  await input(document.querySelector('.strategy-scenarios .strategy-control input'), 'Unsaved edit')
  const before = replacementCount
  await click('新建 New')
  assert.equal(replacementCount, before, 'cancel preserves unsaved work')
  await act(() => root.unmount())
  console.log('Passed: UI save, update, save as new, new, load, and unsaved-change guard.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
