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
const components = Object.fromEntries(['View', 'Text', 'Input', 'Canvas', 'Slider'].map((name) => [name, (props) => {
  const tag = name === 'Input' || name === 'Slider' ? 'input' : name === 'Text' ? 'span' : name === 'Canvas' ? 'canvas' : 'div'
  const allowed = ['id', 'className', 'style', 'value', 'type', 'onClick', 'onMouseDown', 'onMouseMove', 'onMouseUp', 'onMouseLeave', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onWheel']
  const forwarded = Object.fromEntries(allowed.filter((key) => key in props).map((key) => [key, props[key]]))
  if (name === 'Input') forwarded.onInput = (event) => props.onInput?.({ detail: { value: event.target.value } })
  if (name === 'Slider') { forwarded.type = 'range'; forwarded.onChange = (event) => props.onChange?.({ detail: { value: Number(event.target.value) } }) }
  return h(tag, forwarded, props.children)
}]))
const taro = {
  createSelectorQuery: () => ({ select: () => ({ boundingClientRect: (cb) => { cb({ width: 600, height: 600 }); return { exec: () => {} } } }) }),
  createCanvasContext: () => new Proxy({}, { get: () => () => {} }),
  showModal: async () => ({ confirm: true })
}
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (request === '@tarojs/taro') return taro
  if (request === '@tarojs/components') return components
  if (request.endsWith('LanguageContext')) return { useLanguage: () => ({ t: (key, values = {}) => key.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`)) }) }
  if (request.endsWith('AuthContext')) return { useAuth: () => ({ userId: null }) }
  if (request.endsWith('/strategy/useStrategyRoom')) return { useStrategyRoom: () => ({
    status: 'idle', error: '', pending: 0, participants: [], conflicts: [],
    queueChanges: () => {}, setEditing: () => {}, resolveMine: () => {}, resolveTheirs: () => {}
  }) }
  if (request.endsWith('supabase/strategies')) return { listStrategies: async () => [] }
  if (request.endsWith('/data/events')) return { CURRENT_EVENT_CODE: 'BIOBUZZ-PRACTICE', CURRENT_SEASON: 2026,
    findEvent: (code) => ({ code, season: 2026 }), entryEventCode: (entry) => entry.eventCode }
  if (request.endsWith('/data/ftcScout')) return { readImportedEvents: () => [], syncImportedEvents: async () => [] }
  if (request.endsWith('supabase/scouting')) return { subscribeScoutEntries: () => () => {} }
  if (request.endsWith('supabase/pit')) return { subscribePitEntries: () => () => {} }
  if (request.endsWith('AppHeader')) return { __esModule: true, default: () => h('div') }
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
require.extensions['.scss'] = () => {}
const Strategy = require(path.resolve(__dirname, '../src/pages/strategy/index.tsx')).default
const act = async (fn) => React.act(async () => { await fn() })
const root = createRoot(document.getElementById('root'))
const mouse = (element, type, x, y) => element.dispatchEvent(new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }))
const robot = () => document.querySelector('.strategy-robot-red')
const center = () => document.querySelector('.strategy-coordinate').textContent

async function main() {
  await act(() => root.render(h(Strategy)))
  const field = document.querySelector('#strategy-viewport')
  assert(robot() && field)
  assert(center().includes('8.0, 54.0'))
  await act(() => { mouse(robot(), 'mousedown', 100, 100); mouse(field, 'mousemove', 140, 100); mouse(field, 'mouseup', 140, 100) })
  assert(center().includes('18.0, 54.0'), '40px drag at 576px field width moves 10 inches')
  const turns = [...document.querySelectorAll('.strategy-turn-row .strategy-action')]
  await act(() => turns[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(document.querySelectorAll('.strategy-control input')[3].value, '105')
  await act(() => document.querySelector('.strategy-lock').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const before = center()
  await act(() => { mouse(robot(), 'mousedown', 100, 100); mouse(field, 'mousemove', 200, 100); mouse(field, 'mouseup', 200, 100) })
  assert.equal(center(), before, 'locked robot cannot move')

  const tabs = [...document.querySelectorAll('.strategy-phase-tab')]
  await act(() => tabs[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert(center().includes('8.0, 54.0'), 'TeleOp starts with independent robot positions')
  await act(() => tabs[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(center(), before, 'Autonomous robot position is preserved after switching phases')

  await act(() => document.querySelectorAll('.strategy-tool')[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await act(() => { mouse(field, 'mousedown', 300, 300); mouse(field, 'mousemove', 340, 300); mouse(field, 'mouseup', 340, 300) })
  assert(document.querySelector('.strategy-annotation-editor'), 'drawing creates a selectable field annotation')
  await act(() => document.querySelectorAll('.strategy-toolbar .strategy-action')[4].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(document.querySelector('.strategy-annotation-editor'), null, 'Undo removes the drawing')
  await act(() => document.querySelectorAll('.strategy-toolbar .strategy-action')[5].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await act(() => document.querySelectorAll('.strategy-tool')[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await act(() => mouse(field, 'mousedown', 320, 300))
  assert(document.querySelector('.strategy-annotation-editor'), 'Redo restores a selectable drawing')
  await act(() => tabs[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(document.querySelector('.strategy-annotation-editor'), null, 'TeleOp has separate annotations')
  await act(() => tabs[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await act(() => mouse(field, 'mousedown', 320, 300))
  assert(document.querySelector('.strategy-annotation-editor'), 'Autonomous annotation survives phase switching')

  await act(() => document.querySelectorAll('.strategy-tool')[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await act(() => mouse(field, 'mousedown', 350, 300))
  assert.equal(document.querySelectorAll('.strategy-waypoint').length, 1, 'Waypoint tool adds a route point')
  assert(document.querySelector('.strategy-waypoint-row'), 'Waypoint has timing and heading controls')
  await act(() => { mouse(document.querySelector('.strategy-waypoint'), 'mousedown', 350, 300); mouse(field, 'mousemove', 370, 300); mouse(field, 'mouseup', 370, 300) })
  assert(document.querySelector('.strategy-waypoint-label').textContent.includes('89.5'), 'drag moves waypoint in field units')
  await act(() => document.querySelectorAll('.strategy-toolbar .strategy-action')[4].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert(document.querySelector('.strategy-waypoint-label').textContent.includes('84.5'), 'Undo restores previous waypoint position')
  await act(() => document.querySelectorAll('.strategy-toolbar .strategy-action')[5].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert(document.querySelector('.strategy-waypoint-label').textContent.includes('89.5'), 'Redo reapplies waypoint drag')
  await act(() => tabs[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(document.querySelectorAll('.strategy-waypoint').length, 0, 'TeleOp route stays separate')
  await act(() => tabs[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert.equal(document.querySelectorAll('.strategy-waypoint').length, 1, 'Auto route survives phase switching')
  const playback = () => [...document.querySelectorAll('.strategy-timeline-controls .strategy-action')]
  await act(() => playback()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 100)) })
  assert(Number.parseFloat(document.querySelector('.strategy-timeline-time').textContent) > 0, 'Play advances the timeline')
  await act(() => playback()[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  const pausedAt = document.querySelector('.strategy-timeline-time').textContent
  await new Promise((resolve) => setTimeout(resolve, 70))
  assert.equal(document.querySelector('.strategy-timeline-time').textContent, pausedAt, 'Pause stops playback')
  await act(() => playback()[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert(document.querySelector('.strategy-timeline-time').textContent.startsWith('0.0'), 'Restart resets the clock')
  await act(() => {
    const team = document.querySelector('.strategy-panel .strategy-control input')
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(team, '123')
    team.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  assert.equal(document.querySelectorAll('.strategy-scenario-meta input')[2].value, '123', 'robot team number updates scenario metadata')
  assert(document.querySelector('.strategy-scout-team-title').textContent.includes('#123'), 'selected team drives scouting lookup')
  await act(() => tabs[1].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  assert(document.querySelector('.strategy-robot-tab-red').textContent.includes('123'), 'team identity carries across phases')

  await act(() => root.unmount())
  dom.window.close()
  console.log('Passed: robot drag, phase isolation, drawing, timeline controls, and shared team identity.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
