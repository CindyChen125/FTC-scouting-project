// Runs against real React components with in-memory storage and fake services.
// No requests, accounts, or database writes are made.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="test"></div></body></html>', { url: 'http://localhost' })
Object.assign(global, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true })
const { createRoot } = require('react-dom/client')
const { act } = React
const h = React.createElement
const storage = new Map()
const user = { userId: 'test-user', username: 'Scout', displayName: 'Red', role: 'admin', isActive: true }
let route = {}
let entries = []
let pits = []
let exportedRows
const taro = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, value),
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  removeStorageSync: (key) => storage.delete(key),
  setNavigationBarTitle: async () => {},
  showToast: async () => {},
  showModal: async () => ({ confirm: false }),
  useLoad: (fn) => React.useEffect(() => { fn(route) }, [])
}
const components = Object.fromEntries(['View', 'Text', 'Button', 'Input', 'Textarea', 'Image', 'Picker'].map((name) => [name,
  React.forwardRef(function MockComponent(props, ref) {
    const { children, className, onClick, value, placeholder, disabled } = props
    if (name === 'Picker') return h('div', { className }, h('select', {
      value: value ?? 0,
      onChange: (e) => props.onChange?.({ detail: { value: e.target.value } })
    }, props.range.map((label, index) => h('option', { key: index, value: index }, label))), children)
    if (name === 'Input' || name === 'Textarea') return h(name === 'Input' ? 'input' : 'textarea', {
      ref, className, value, placeholder, onChange: () => {},
      onInput: (e) => props.onInput?.({ detail: { value: e.target.value } })
    })
    return h(name === 'Button' ? 'button' : name === 'Text' ? 'span' : 'div', { ref, className, onClick, disabled }, children)
  })
]))
const mocks = {
  '@tarojs/taro': taro,
  '@tarojs/components': components,
  'AuthContext': { useAuth: () => ({ userId: user.userId, profile: user, isAdmin: true, loading: false, signIn: async () => {} }) },
  'ThemeContext': { useTheme: () => ({ theme: 'light', fontScalePercent: 100 }), FONT_SCALE_MIN: 80, FONT_SCALE_MAX: 140, FONT_SCALE_STEP: 5 },
  'ftcScout': { readImportedEvents: () => [], syncImportedEvents: async () => [], STATIONS: ['Red 1', 'Red 2', 'Blue 1', 'Blue 2'] },
  'scouting': {
    fetchScoutEntry: async () => null,
    subscribeScoutEntries: (_, done) => { done(entries); return () => {} },
    subscribeScoutEntry: (_, __, ___, ____, done) => { done(entries[0]); return () => {} },
    pendingCount: () => 0
  },
  'pit': { fetchPitEntry: async () => null, subscribePitEntries: (_, done) => { done(pits); return () => {} } },
  'admin': { fetchProfiles: async () => [user], fetchScoutCounts: async () => ({ [user.userId]: 2 }) },
  'photos': { robotPhotoUrl: async () => '' },
  'xlsx': { utils: {
    json_to_sheet: (rows) => { exportedRows = rows; return {} },
    book_new: () => ({}),
    book_append_sheet: (_, __, name) => assert(!/[\/?*\[\]:]/.test(name))
  }, writeFile: () => {} }
}
const originalLoad = Module._load
Module._load = function (request, parent, ...args) {
  if (mocks[request]) return mocks[request]
  const name = path.basename(request)
  if (/AuthContext|ThemeContext|ftcScout$|supabase\/(scouting|pit|admin|photos)$/.test(request) && mocks[name]) return mocks[name]
  return originalLoad.call(this, request, parent, ...args)
}
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true
  } }).outputText, filename)
}
require.extensions['.scss'] = () => {}
const { translate: t, setCurrentLanguage } = require('../src/i18n')
const { LanguageProvider } = require('../src/i18n/LanguageContext')
const { NOTE_OPTIONS, noteTagId, emptyAuto, emptyTeleop, emptyEndgame } = require('../src/types/scouting')
const { formatNotes } = require('../src/games/common')
const { exportEntriesToExcel, exportPitToExcel } = require('../src/utils/exportEntries')
const { biobuzzRows } = require('../src/utils/ranking')
const messages = require('../src/i18n/messages.json')
const mountPoint = document.getElementById('test')
let root
const flush = async (fn) => act(async () => { await fn(); await new Promise(setImmediate) })
const mount = async (Component) => {
  if (root) await flush(() => root.unmount())
  root = createRoot(mountPoint)
  await flush(() => root.render(h(LanguageProvider, null, h(Component))))
}
const changeLanguage = async (index) => {
  const picker = mountPoint.querySelectorAll('.language-picker button')[index]
  assert(picker, 'Every screen exposes a language picker')
  await flush(() => picker.click())
}
const rawNote = 'Red / 花粉 {team} $&'
const entry = {
  eventCode: 'BIOBUZZ-PRACTICE', matchId: 'Q12', teamNumber: '417', alliance: 'red',
  scoutName: 'Red', scoutedBy: user.userId, observationKey: user.userId,
  auto: { ...emptyAuto(), cellBalls: 4, noteTags: ['other', 'mechanical-failure'], noteText: rawNote },
  teleop: emptyTeleop(), endgame: emptyEndgame(), overallNotes: rawNote, updatedAt: 1700000000000
}
const pit = { eventCode: entry.eventCode, teamNumber: '417', scoutName: 'Red', scoutedBy: user.userId,
  data: { drivetrain: 'mecanum', hiveBalls: 'both', flowerBalls: 'pollen', colorSort: true, autoActions: ['leave'], role: 'hive', notes: rawNote }, updatedAt: entry.updatedAt }

async function main() {
  // Catch future hard-coded interface text and missing dictionary entries.
  for (const file of fs.readdirSync(path.join(__dirname, '../src'), { recursive: true }).filter((name) => /\.tsx?$/.test(name))) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8')
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const visit = (node) => {
      if (ts.isJsxText(node)) {
        const text = node.text.trim()
        assert(!/[a-zA-Z\p{Script=Han}]/u.test(text) || ['Q', 'BIOBUZZ 2026-2027'].includes(text), `Untranslated JSX in ${file}: ${text}`)
      }
      if (ts.isCallExpression(node) && ['t', 'tr'].includes(node.expression.getText(tree)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        assert(messages[node.arguments[0].text], `Unknown message in ${file}: ${node.arguments[0].text}`)
      }
      if (ts.isJsxAttribute(node) && node.name.text === 'className') {
        assert(!/\bt\(/.test(node.getText(tree)), `CSS identifiers must not be translated in ${file}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
  }
  for (const [key, message] of Object.entries(messages)) {
    assert(message.en && message.zh, `Missing translation: ${key}`)
    assert(!/\p{Script=Han}/u.test(message.en), `Chinese leaked into English message: ${key}`)
    const placeholders = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    assert.deepEqual(placeholders(message.en), placeholders(message.zh), `Placeholder mismatch: ${key}`)
  }
  for (const language of ['en', 'zh', 'both']) {
    setCurrentLanguage(language)
    const before = JSON.stringify(entry)
    assert(formatNotes(entry.auto.noteTags, rawNote).includes(rawNote))
    assert.equal(t('teamNumber', { number: rawNote }).includes(rawNote), true)
    assert.deepEqual(NOTE_OPTIONS.map(noteTagId), ['disconnected', 'mechanical-failure', 'defense', 'early-nectar', 'over-control-limit', 'stuck-on-hive', 'other'])
    exportEntriesToExcel([entry], 'Example')
    assert.equal(exportedRows[0][t('Scout')], 'Red')
    assert.equal(exportedRows[0][t('Overall Notes')], rawNote)
    exportPitToExcel([pit], 'Example')
    assert.equal(exportedRows[0][t('Notes')], rawNote)
    assert.equal(biobuzzRows([entry])[0].raw.reliability, 0)
    assert.equal(JSON.stringify(entry), before, 'Translation must not mutate stored data')
  }
  entries = [entry, { ...entry, teamNumber: '418' }]
  pits = [pit]
  route = { eventCode: entry.eventCode, matchId: entry.matchId, teamNumber: entry.teamNumber, station: 'Red 1' }
  storage.set('scoutLanguage', 'English')
  await mount(require('../src/pages/index/index').default)
  assert(mountPoint.textContent.includes('Start Scouting'))
  assert.equal(document.documentElement.lang, 'en')
  for (const page of ['index', 'scout', 'pit', 'data', 'entry', 'settings', 'admin']) {
    await mount(require(`../src/pages/${page}/index`).default)
    let draft
    const draftKey = `backup:${user.userId}:${entry.eventCode}:${entry.matchId}:${entry.teamNumber}`
    if (page === 'scout') {
      await flush(() => mountPoint.querySelector('.counter-btn.plus').click())
      await flush(() => mountPoint.querySelector('.chip').click())
      draft = JSON.stringify(storage.get(draftKey))
      assert.equal(storage.get(draftKey).auto.cellBalls, 1)
      assert.deepEqual(storage.get(draftKey).auto.noteTags, ['disconnected'])
    }
    for (const [index, language] of ['en', 'zh', 'both'].entries()) {
      await changeLanguage(index)
      assert.equal(storage.get('settings:language'), language)
      assert.equal(document.documentElement.lang, language === 'en' ? 'en' : 'zh-CN')
      if (page === 'scout' || page === 'pit') {
        assert([...mountPoint.querySelectorAll('input')].some((input) => input.value === '417'), 'Language switch retains team number')
        assert(mountPoint.querySelector('.scout-identity').textContent.includes('Red'), 'Scout names remain unchanged')
      }
      // Language choices intentionally show native names in every language.
      const copy = mountPoint.cloneNode(true)
      copy.querySelectorAll('.language-picker').forEach((node) => node.remove())
      if (language === 'en') assert(!/\p{Script=Han}/u.test(copy.textContent.replaceAll(rawNote, '')), `English UI still has Chinese on ${page}`)
      if (draft) assert.equal(JSON.stringify(storage.get(draftKey)), draft, 'Changing language must not rewrite a draft')
    }
    if (page === 'data') {
      await flush(() => mountPoint.querySelectorAll('.tab-item')[1].click())
      await changeLanguage(0)
      assert(mountPoint.textContent.includes('reported breakdowns'))
      await changeLanguage(1)
      assert(mountPoint.textContent.includes('场报告故障'))
      assert(!mountPoint.textContent.includes('reported breakdowns'), 'Memoized ranking text refreshes')
      await flush(() => mountPoint.querySelectorAll('.tab-item')[2].click())
      assert(mountPoint.textContent.includes(rawNote), 'Pit notes remain untouched')
    }
  }
  await mount(require('../src/auth/LoginScreen').default)
  await changeLanguage(0)
  await flush(() => mountPoint.querySelector('.login-btn').click())
  assert(mountPoint.textContent.includes('Enter your username and password'))
  await changeLanguage(1)
  assert(mountPoint.textContent.includes('请输入用户名和密码'))
  assert(!mountPoint.textContent.includes('Enter your username and password'), 'Visible validation updates immediately')
  await mount(require('../src/pages/settings/index').default)
  assert.equal(document.documentElement.lang, 'zh-CN', 'Preference survives remount')
  await flush(() => root.unmount())
  dom.window.close()
  console.log(`Passed: ${Object.keys(messages).length} message pairs, 7 pages in 3 languages, login validation, ranking refresh, exports, legacy preference, stable tags and preserved user content.`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
