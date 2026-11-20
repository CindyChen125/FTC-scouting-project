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
const entries = [
  { eventCode: 'EVENT-A', teamNumber: '123', matchId: 'Q1', updatedAt: 1, overallNotes: 'Good hive accuracy',
    auto: { leave: true, cellBalls: 4, allianceTips: 0, park: false, noteTags: [], noteText: '' },
    teleop: { cellPollen: 3, cellNectar: 1, allianceTips: 0, noteTags: [], noteText: '' },
    endgame: { flowerPollen: 2, flowerNectar: 0, park: true } },
  { eventCode: 'EVENT-A', teamNumber: '456', matchId: 'Q1', updatedAt: 1, overallNotes: '',
    auto: { leave: false, cellBalls: 1, allianceTips: 0, park: false, noteTags: [], noteText: '' },
    teleop: { cellPollen: 0, cellNectar: 0, allianceTips: 0, noteTags: [], noteText: '' },
    endgame: { flowerPollen: 0, flowerNectar: 0, park: false } }
]
const components = Object.fromEntries(['View', 'Text'].map((name) => [name, (props) => h(name === 'View' ? 'div' : 'span',
  { className: props.className, style: props.style, onClick: props.onClick }, props.children)]))
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === '@tarojs/components') return components
  if (request === '@tarojs/taro') return { getStorageSync: () => ({}) }
  if (request.endsWith('AuthContext')) return { useAuth: () => ({ userId: 'user-one' }) }
  if (request.endsWith('LanguageContext')) return { useLanguage: () => ({ t: (key) => key, language: 'en' }) }
  if (request.endsWith('/data/events')) return { CURRENT_SEASON: 2026,
    findEvent: (code) => ({ code, season: 2026 }), entryEventCode: (entry) => entry.eventCode }
  if (request.endsWith('/data/ftcScout')) return { readImportedEvents: () => [], syncImportedEvents: async () => [] }
  if (request.endsWith('supabase/scouting')) return { subscribeScoutEntries: (_userId, callback) => { callback(entries); return () => {} } }
  if (request.endsWith('supabase/pit')) return { subscribePitEntries: (_userId, callback) => { callback([]); return () => {} } }
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
const Panel = require(path.resolve(__dirname, '../src/pages/strategy/StrategyScoutingPanel.tsx')).default
const { initialRobots } = require(path.resolve(__dirname, '../src/strategy/fieldGeometry.ts'))
const details = { name: 'Plan', eventCode: 'EVENT-A', matchNumber: 'Q2', redTeams: ['123', '456'], blueTeams: ['999', ''] }
async function main() {
  const root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(h(Panel, { details, robots: initialRobots(), selectedId: 'red1' })))
  assert(document.querySelector('.strategy-scout-team-title').textContent.includes('#123'))
  assert(document.querySelector('.strategy-scout-selected').textContent.includes('4.0'), 'selected team stats are shown')
  assert(document.querySelector('.strategy-scout-selected').textContent.includes('Good hive accuracy'), 'notes are shown')
  assert(document.querySelector('.strategy-scout-table').textContent.includes('#456'), 'planned-team comparison includes second robot')
  await React.act(async () => root.render(h(Panel, { details, robots: initialRobots(), selectedId: 'blue1' })))
  assert(document.querySelector('.strategy-scout-selected').textContent.includes('No scouting data available'), 'missing team data is explicit')
  await React.act(async () => root.unmount())
  console.log('Passed: selected-team stats, notes, comparison, and explicit no-data state.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
